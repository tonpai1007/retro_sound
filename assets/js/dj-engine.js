// ============================================================
//  DJ ENGINE v2 — Web Audio Decks + Step Sequencer
//  Dual-deck engine with real waveform, BPM detection, per-deck
//  EQ/filter/trim, tempo sync, loops, hot-cues, VU metering and
//  an FL-style chiptune drum rack. Heavily reuses the analyser
//  pattern from audio-engine.js and the 8-bit voices from the
//  CRT player and legacy retro-v2 apps.
//
//  Deck modes:
//    audio -> decoded AudioBuffer -> full Web Audio graph (all features)
//    yt    -> auxiliary YouTube iframe (no sample access -> volume only)
// ============================================================

function byId(id) { return document.getElementById(id); }

const DJ_COLORS = { a: '#00ffff', b: '#ff00ff' };

const dj = {
    ctx: null,
    decks: { a: deckState('a'), b: deckState('b') },
    yt: { a: null, b: null },
    ytReady: false,
    ytApiLoading: false,
    proxy: false,
    syncMaster: 'a',
    limiterOn: true,
    noiseBuf: null,
    raf: null,
    alive: false,
    rack: {
        on: false,
        bpm: 128,
        step: 0,
        stepDur: 0.234,
        nextTime: 0,
        timer: null,
        seq: {
            kick:  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
            hat:   [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
            snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            bass:  [1,0,1,0,1,0,0,1,0,0,1,0,1,0,0,1]
        }
    },
    lrc: [],
    lrcElems: [],
    built: false
};

function deckState(name) {
    return {
        name: name,
        mode: 'idle',
        buffer: null,
        peaks: null,
        src: null,
        anchor: 0,
        offset: 0,
        rate: 1,
        baseRate: 1,
        syncRate: 1,
        pitch: 0,
        playing: false,
        dur: 0,
        bpm: 0,
        bpmSource: 'none',
        hot: [null, null, null],
        loopOn: false,
        loopIn: 0,
        loopOut: 0,
        title: '',
        vu: 0,
        nodes: null,
        delayTime: 0,
        delayFb: 0,
        reverbMix: 0,
        pan: 0,
        distortion: 0,
        bitcrush: 0,
        flanger: 0,
        delaySync: false,
        delayNote: 0.25,
        filterRes: 0.6,
        tapTimes: [],
        presetName: ''
    };
}

// ============================================================
//  AUDIO CONTEXT + MASTER BUS
// ============================================================
function ensureCtx() {
    if (!dj.ctx) {
        dj.ctx = new (window.AudioContext || window.webkitAudioContext)();
        dj.ctx.masterIn = dj.ctx.createGain();
        dj.ctx.shaper = dj.ctx.createWaveShaper();
        dj.ctx.masterGain = dj.ctx.createGain();
        dj.ctx.compressor = dj.ctx.createDynamicsCompressor();
        dj.ctx.masterAnalyser = dj.ctx.createAnalyser();
        dj.ctx.masterAnalyser.fftSize = 1024;
        dj.ctx.noiseBuf = makeNoiseBuf(dj.ctx);
        setShaperCurve(true);
        dj.ctx.shaper.connect(dj.ctx.masterGain);
        dj.ctx.masterGain.gain.value = 0.9;
        dj.ctx.masterIn.connect(dj.ctx.shaper);
        dj.ctx.masterGain.connect(dj.ctx.compressor);
        dj.ctx.compressor.connect(dj.ctx.masterAnalyser);
        dj.ctx.masterAnalyser.connect(dj.ctx.destination);
        dj.ctx.rackIn = dj.ctx.createGain();
        dj.ctx.rackIn.gain.value = 0.8;
        dj.ctx.rackIn.connect(dj.ctx.masterIn);
    }
    if (dj.ctx.state === 'suspended') dj.ctx.resume();
    return dj.ctx;
}

function makeNoiseBuf(ctx) {
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
}

function setShaperCurve(on) {
    if (!dj.ctx) return;
    if (!on) {
        dj.ctx.shaper.curve = null;
        return;
    }
    const n = 1024;
    const curve = new Float32Array(n);
    const k = 1.6;
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x);
    }
    dj.ctx.shaper.curve = curve;
}

function makeDistortionCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = amount * 100;
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function makeBitcrushCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const bits = Math.max(1, 16 - Math.floor(amount * 15));
    const step = Math.pow(2, bits);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.round(x * step) / step;
    }
    return curve;
}

function buildDeckGraph(name) {
    const d = dj.decks[name];
    if (d.nodes) return;
    const c = ensureCtx();
    d.nodes = {
        preGain: c.createGain(),
        low: c.createBiquadFilter(),
        mid: c.createBiquadFilter(),
        high: c.createBiquadFilter(),
        filter: c.createBiquadFilter(),
        distortion: c.createWaveShaper(),
        bitcrusher: c.createWaveShaper(),
        flangerDelay: c.createDelay(0.05),
        flangerLfo: c.createOscillator(),
        flangerDepth: c.createGain(),
        panner: c.createStereoPanner(),
        gain: c.createGain(),
        xfGain: c.createGain(),
        analyser: c.createAnalyser(),
        spectrum: c.createAnalyser(),
        delay: c.createDelay(2.0),
        delayFb: c.createGain(),
        delayMix: c.createGain(),
        reverbSend: c.createGain(),
        reverbRet: c.createGain()
    };
    const n = d.nodes;
    n.low.type = 'lowshelf'; n.low.frequency.value = 130;
    n.mid.type = 'peaking'; n.mid.frequency.value = 1000; n.mid.Q.value = 1.0;
    n.high.type = 'highshelf'; n.high.frequency.value = 6500;
    n.filter.type = 'lowpass'; n.filter.frequency.value = 22000; n.filter.Q.value = 0.6;
    n.distortion.curve = makeDistortionCurve(0);
    n.distortion.oversample = '4x';
    n.bitcrusher.curve = makeBitcrushCurve(0);
    n.bitcrusher.oversample = 'none';
    n.flangerLfo.type = 'sine';
    n.flangerLfo.frequency.value = 0.5;
    n.flangerDepth.gain.value = 0;
    n.flangerDelay.delayTime.value = 0.005;
    n.panner.pan.value = 0;
    n.delay.delayTime.value = 0.3;
    n.delayFb.gain.value = 0;
    n.delayMix.gain.value = 0;
    n.reverbSend.gain.value = 0;
    n.reverbRet.gain.value = 0.3;
    n.preGain.gain.value = 0.9;
    n.gain.gain.value = 0.85;
    n.xfGain.gain.value = 1;
    n.analyser.fftSize = 1024;
    n.spectrum.fftSize = 256;
    n.preGain.connect(n.low);
    n.low.connect(n.mid);
    n.mid.connect(n.high);
    n.high.connect(n.filter);
    n.filter.connect(n.distortion);
    n.distortion.connect(n.bitcrusher);
    n.bitcrusher.connect(n.flangerDelay);
    n.flangerDelay.connect(n.flangerDepth);
    n.flangerDepth.connect(n.panner);
    n.panner.connect(n.gain);
    n.gain.connect(n.xfGain);
    n.xfGain.connect(n.analyser);
    n.analyser.connect(c.masterIn);
    n.xfGain.connect(n.spectrum);
    n.xfGain.connect(n.delayMix);
    n.delayMix.connect(n.delay);
    n.delay.connect(n.delayFb);
    n.delayFb.connect(n.delayMix);
    n.delayMix.connect(c.masterIn);
    n.xfGain.connect(n.reverbSend);
    n.reverbSend.connect(n.reverbRet);
    n.reverbRet.connect(c.masterIn);
    n.flangerLfo.connect(n.flangerDepth);
    n.flangerLfo.start(0);
}

// ============================================================
//  UI BUILD (single source of truth for the DJ layout)
// ============================================================
const DECK_INPUT_STYLE = 'background:transparent;border:none;border-bottom:1px solid %C;color:%C;font-family:\'VT323\',monospace;font-size:15px;outline:none;padding:2px;width:100%;text-shadow:0 0 5px %C;';

function loadRowHTML(x, c) {
    const inpStyle = DECK_INPUT_STYLE.replace(/%C/g, c);
    return '<div class="dj-load-row">'
        + '<input type="file" id="' + x + '-file" accept="audio/*" style="display:none">'
        + '<button class="dj-mini" id="' + x + '-filebtn" style="border-color:' + c + ';color:' + c + '" title="Load local audio file">FILE</button>'
        + '<input type="text" id="' + x + '-url" class="dj-input" style="' + inpStyle + '" placeholder="audio URL">'
        + '<button class="dj-mini" id="' + x + '-urlbtn" style="border-color:' + c + ';color:' + c + '" title="Load audio URL (via proxy if available)">URL</button>'
        + '<input type="text" id="' + x + '-yt" class="dj-input" style="' + inpStyle + '" placeholder="YT video ID" title="YouTube video ID — aux, no EQ analysis">'
        + '<button class="dj-mini" id="' + x + '-ytbtn" style="border-color:' + c + ';color:' + c + '" title="Load YouTube as aux stream">YT</button>'
        + '</div>';
}

function deckHTML(x) {
    const c = DJ_COLORS[x];
    return '<div class="dj-deck" id="' + x + '-deck" style="border-color:' + c + '">'
        + '<div class="dj-deck-head" id="' + x + '-head" style="color:' + c + ';text-shadow:0 0 8px ' + c + ';">'
        + 'DECK ' + x.toUpperCase() + ' [<span id="' + x + '-mode">---</span>] '
        + '<span class="dj-master-tag" id="' + x + '-master" title="Toggle tempo master">&lt;MASTER?&gt;</span>'
        + '</div>'
        + loadRowHTML(x, c)
        + '<div class="dj-title" id="' + x + '-title">NO TRACK LOADED</div>'
        + '<div class="dj-viz-row">'
        + '<canvas class="dj-wave" id="' + x + '-wave" height="72"></canvas>'
        + '<canvas class="dj-spectrum" id="' + x + '-spectrum" height="64"></canvas>'
        + '<canvas class="dj-osc" id="' + x + '-osc" height="64"></canvas>'
        + '</div>'
        + '<div class="dj-time" id="' + x + '-time" style="color:' + c + ';text-shadow:0 0 8px ' + c + ';">00:00 / 00:00</div>'
        + '<div class="dj-transport">'
        + '<button class="dj-mini" id="' + x + '-play" style="border-color:' + c + ';color:' + c + '" title="Ctrl+' + (x === 'a' ? '1' : '2') + '">PLAY</button>'
        + '<button class="dj-mini" id="' + x + '-cue" title="Cue (loop start or 0)">CUE</button>'
        + '<button class="dj-mini" id="' + x + '-loopin" title="Set loop IN at playhead">LOOP IN</button>'
        + '<button class="dj-mini" id="' + x + '-loopout" title="Set loop OUT at playhead">LOOP OUT</button>'
        + '<button class="dj-mini" id="' + x + '-loop" title="Toggle loop">LOOP</button>'
        + '<button class="dj-mini dj-tap" id="' + x + '-tap" style="border-color:' + c + ';color:' + c + ';" title="Tap tempo">TAP</button>'
        + '</div>'
        + '<div class="dj-cues" id="' + x + '-cues">'
        + cuePadHTML(x, 0, c) + cuePadHTML(x, 1, c) + cuePadHTML(x, 2, c)
        + '</div>'
        + '<div class="dj-strip">'
        + '<label class="dj-knob">EQ LO <input type="range" id="' + x + '-eq-low" min="-12" max="12" value="0"></label>'
        + '<label class="dj-knob">MID <input type="range" id="' + x + '-eq-mid" min="-12" max="12" value="0"></label>'
        + '<label class="dj-knob">HI <input type="range" id="' + x + '-eq-high" min="-12" max="12" value="0"></label>'
        + '</div>'
        + '<div class="dj-strip">'
        + '<label class="dj-knob">FLT <input type="range" id="' + x + '-filter" min="0" max="100" value="100"></label>'
        + '<label class="dj-knob">RES <input type="range" id="' + x + '-filter-res" min="0" max="100" value="30"></label>'
        + '<button class="dj-mini dj-filter-btn" id="' + x + '-filter-type" style="border-color:' + c + ';color:' + c + ';" title="Cycle filter type">LP</button>'
        + '</div>'
        + '<div class="dj-strip dj-fx-strip">'
        + '<label class="dj-knob">PAN <input type="range" id="' + x + '-pan" min="-100" max="100" value="0"></label>'
        + '<label class="dj-knob">DELAY <input type="range" id="' + x + '-delay" min="0" max="100" value="0"></label>'
        + '<label class="dj-knob">DLY FB <input type="range" id="' + x + '-delayfb" min="0" max="80" value="0"></label>'
        + '<button class="dj-mini dj-delay-sync" id="' + x + '-delay-sync" style="border-color:' + c + ';color:' + c + ';" title="Sync delay to BPM">SYNC</button>'
        + '<select id="' + x + '-delay-note" class="dj-select" style="border-color:' + c + ';color:' + c + ';">'
        + '<option value="0.25">1/4</option>'
        + '<option value="0.375">1/4 D</option>'
        + '<option value="0.16666667">1/6</option>'
        + '<option value="0.125">1/8</option>'
        + '<option value="0.1875">1/8 D</option>'
        + '<option value="0.0625">1/16</option>'
        + '<option value="0.09375">1/16 D</option>'
        + '<option value="0.03125">1/32</option>'
        + '</select>'
        + '</div>'
        + '<div class="dj-strip dj-fx-strip">'
        + '<label class="dj-knob">REVERB <input type="range" id="' + x + '-reverb" min="0" max="100" value="0"></label>'
        + '<label class="dj-knob">DIST <input type="range" id="' + x + '-distortion" min="0" max="100" value="0"></label>'
        + '<label class="dj-knob">CRUSH <input type="range" id="' + x + '-bitcrush" min="0" max="100" value="0"></label>'
        + '<label class="dj-knob">FLANG <input type="range" id="' + x + '-flanger" min="0" max="100" value="0"></label>'
        + '</div>'
        + '<div class="dj-strip">'
        + '<label class="dj-knob">TRIM <input type="range" id="' + x + '-trim" min="0" max="200" value="90"></label>'
        + '<label class="dj-knob">PITCH <input type="range" id="' + x + '-pitch" min="-8" max="8" value="0" step="0.5"></label>'
        + '<label class="dj-knob">FADER <input type="range" id="' + x + '-fader" min="0" max="100" value="85"></label>'
        + '<span class="dj-bpm" id="' + x + '-bpm" title="Click to set BPM manually">-- BPM</span>'
        + '</div>'
        + '<div class="dj-vu"><div class="dj-vu-fill" id="' + x + '-vu"></div></div>'
        + '<div class="dj-preset-bar">'
        + '<input type="text" id="' + x + '-preset-name" class="dj-preset-input" placeholder="preset name">'
        + '<button class="dj-mini dj-preset-btn" id="' + x + '-preset-save" style="border-color:' + c + ';color:' + c + ';" title="Save FX preset">SAVE</button>'
        + '<button class="dj-mini dj-preset-btn" id="' + x + '-preset-load" style="border-color:' + c + ';color:' + c + ';" title="Load FX preset">LOAD</button>'
        + '</div>'
        + '<div class="dj-status" id="' + x + '-status">ENGINE: STANDBY</div>'
        + '</div>';
}

function cuePadHTML(x, i, c) {
    return '<button class="dj-cue" id="' + x + '-cue' + i + '" style="border-color:' + c + ';color:' + c + ';">'
        + (i + 1) + '</button>';
}

function mixerHTML() {
    return '<div class="dj-mixer">'
        + '<div class="dj-mixer-label">CROSSFADER</div>'
        + '<input type="range" id="dj-xfader" class="dj-xfader" min="0" max="100" value="50">'
        + '<div class="dj-mixer-label" id="dj-xfader-display">A 100 | B 100</div>'
        + '<div class="dj-vu dj-vu-master"><div class="dj-vu-fill" id="dj-master-vu"></div></div>'
        + '<label class="dj-knob">MASTER <input type="range" id="dj-master-gain" min="0" max="150" value="100"></label>'
        + '<div class="dj-master-val" id="dj-master-bpm">-- BPM</div>'
        + '<button class="dj-master-btn" id="dj-sync" title="Sync slave deck to master">SYNC</button>'
        + '<button class="dj-master-btn" id="dj-playboth">PLAY BOTH</button>'
        + '<button class="dj-master-btn" id="dj-pauseboth">PAUSE</button>'
        + '<button class="dj-master-btn danger" id="dj-stopall">STOP</button>'
        + '<button class="dj-master-btn" id="dj-limiter" title="Master soft-clip">LIM ON</button>'
        + '<button class="dj-master-btn" id="dj-clone" title="Copy A to B">A=></button>'
        + '<button class="dj-master-btn" id="dj-swap" title="Swap A and B">SWAP</button>'
        + '<button class="dj-master-btn" id="dj-record" title="Record master output">REC</button>'
        + '<div class="dj-circular-viz"><canvas id="dj-circular" width="200" height="200"></canvas></div>'
        + '</div>';
}

function rackHTML() {
    const rows = [
        ['kick', 'KICK'], ['hat', 'HAT'], ['snare', 'SNARE'], ['bass', 'BASS']
    ];
    let cells = '';
    for (let r = 0; r < 4; r++) {
        let rowCells = '';
        for (let c = 0; c < 16; c++) {
            const on = dj.rack.seq[rows[r][0]][c] ? ' on' : '';
            rowCells += '<div class="dj-cell' + on + '" data-r="' + r + '" data-c="' + c + '"></div>';
        }
        cells += '<div class="dj-row"><span class="dj-row-label">' + rows[r][1] + '</span>' + rowCells + '</div>';
    }
    return '<div class="dj-rack">'
        + '<div class="dj-rack-head">'
        + '<span>STEP SEQUENCER</span>'
        + '<span>MASTER <span id="dj-rack-bpm">' + (dj.rack.bpm || '128') + '</span> BPM</span>'
        + '<button class="dj-mini" id="dj-rack-play">PLAY</button>'
        + '</div>'
        + '<div class="dj-rack-grid">' + cells + '</div>'
        + '</div>';
}

// ============================================================
//  WIRING
// ============================================================
function buildDJApp() {
    const root = byId('dj-app');
    if (!root) return;
    if (dj.built) return;
    dj.built = true;

    root.innerHTML =
        '<div class="dj-main">' + deckHTML('a') + mixerHTML() + deckHTML('b') + '</div>'
        + rackHTML();

    ['a', 'b'].forEach(wireDeck);
    wireMixer();
    wireRack();

    byId('dj-xfader').addEventListener('input', onXfader);
    byId('dj-master-gain').addEventListener('input', (e) => {
        if (dj.ctx) dj.ctx.masterGain.gain.value = parseInt(e.target.value) / 100;
    });
    byId('dj-sync').addEventListener('click', () => syncBPM6());
    byId('dj-playboth').addEventListener('click', () => playBoth6());
    byId('dj-pauseboth').addEventListener('click', () => pauseBoth6());
    byId('dj-stopall').addEventListener('click', () => stopAll6());
    byId('dj-limiter').addEventListener('click', toggleLimiter6);
    byId('dj-clone').addEventListener('click', () => cloneDeck('a', 'b'));
    byId('dj-swap').addEventListener('click', swapDecks);
    byId('dj-record').addEventListener('click', toggleRecord);

    byId('dj-rack-play').addEventListener('click', rackPlay6);

    probeBackend();
}

function wireDeck(x) {
    byId(x + '-filebtn').addEventListener('click', () => byId(x + '-file').click());
    byId(x + '-file').addEventListener('change', () => loadFile6(x));
    byId(x + '-urlbtn').addEventListener('click', () => loadUrl6(x));
    byId(x + '-ytbtn').addEventListener('click', () => loadYt6(x));

    byId(x + '-play').addEventListener('click', () => togglePlay6(x));
    byId(x + '-cue').addEventListener('click', () => cueDeck6(x));
    byId(x + '-loopin').addEventListener('click', () => setLoopIn6(x));
    byId(x + '-loopout').addEventListener('click', () => setLoopOut6(x));
    byId(x + '-loop').addEventListener('click', () => toggleLoop6(x));
    for (let i = 0; i < 3; i++) {
        byId(x + '-cue' + i).addEventListener('click', () => hotCue6(x, i));
    }
    byId(x + '-bpm').addEventListener('click', () => editBPM6(x));
    byId(x + '-master').addEventListener('click', () => setMaster6(x));
    byId(x + '-head').addEventListener('click', () => setMaster6(x));
    byId(x + '-filter-type').addEventListener('click', () => cycleFilterType(x));
    byId(x + '-tap').addEventListener('click', () => tapTempo(x));
    byId(x + '-delay-sync').addEventListener('click', () => toggleDelaySync(x));
    byId(x + '-delay-note').addEventListener('change', (e) => {
        dj.decks[x].delayNote = parseFloat(e.target.value);
        if (dj.decks[x].delaySync) updateDelaySync(x);
    });
    byId(x + '-preset-save').addEventListener('click', () => savePreset(x));
    byId(x + '-preset-load').addEventListener('click', () => loadPreset(x));

    bindRange(x + '-eq-low', (v) => dj.decks[x].nodes && (dj.decks[x].nodes.low.gain.value = v));
    bindRange(x + '-eq-mid', (v) => dj.decks[x].nodes && (dj.decks[x].nodes.mid.gain.value = v));
    bindRange(x + '-eq-high', (v) => dj.decks[x].nodes && (dj.decks[x].nodes.high.gain.value = v));
    bindRange(x + '-filter', (v) => {
        if (!dj.decks[x].nodes) return;
        const freq = 40 * Math.pow(550, v / 100);
        dj.decks[x].nodes.filter.frequency.value = freq;
    });
    bindRange(x + '-filter-res', (v) => {
        if (!dj.decks[x].nodes) return;
        dj.decks[x].nodes.filter.Q.value = 0.1 + (v / 100) * 20;
        dj.decks[x].filterRes = 0.1 + (v / 100) * 20;
    });
    bindRange(x + '-pan', (v) => {
        if (!dj.decks[x].nodes) return;
        dj.decks[x].nodes.panner.pan.value = v / 100;
        dj.decks[x].pan = v / 100;
    });
    bindRange(x + '-delay', (v) => {
        if (!dj.decks[x].nodes) return;
        dj.decks[x].nodes.delayMix.gain.value = v / 100;
        dj.decks[x].delayTime = v / 100;
    });
    bindRange(x + '-delayfb', (v) => {
        if (!dj.decks[x].nodes) return;
        dj.decks[x].nodes.delayFb.gain.value = Math.min(0.8, v / 100);
        dj.decks[x].delayFb = v / 100;
    });
    bindRange(x + '-reverb', (v) => {
        if (!dj.decks[x].nodes) return;
        dj.decks[x].nodes.reverbSend.gain.value = v / 100;
        dj.decks[x].reverbMix = v / 100;
    });
    bindRange(x + '-distortion', (v) => {
        if (!dj.decks[x].nodes) return;
        const amt = v / 100;
        dj.decks[x].nodes.distortion.curve = makeDistortionCurve(amt);
        dj.decks[x].distortion = amt;
    });
    bindRange(x + '-bitcrush', (v) => {
        if (!dj.decks[x].nodes) return;
        const amt = v / 100;
        dj.decks[x].nodes.bitcrusher.curve = makeBitcrushCurve(amt);
        dj.decks[x].bitcrush = amt;
    });
    bindRange(x + '-flanger', (v) => {
        if (!dj.decks[x].nodes) return;
        const amt = v / 100;
        dj.decks[x].nodes.flangerDepth.gain.value = amt * 0.005;
        dj.decks[x].flanger = amt;
    });
    bindRange(x + '-trim', (v) => {
        if (dj.decks[x].nodes) dj.decks[x].nodes.preGain.gain.value = v / 100;
        onXfader();
    });
    bindRange(x + '-pitch', (v) => setPitch6(x, parseFloat(v)));
    bindRange(x + '-fader', (v) => {
        if (dj.decks[x].nodes) dj.decks[x].nodes.gain.gain.value = v / 100;
        onXfader();
    });

    const wave = byId(x + '-wave');
    if (wave) {
        wave.addEventListener('pointerdown', (e) => waveSeek(x, e));
        wave.addEventListener('pointermove', (e) => { if (e.buttons === 1) waveSeek(x, e); });
    }
    const spec = byId(x + '-spectrum');
    if (spec) {
        spec.addEventListener('pointerdown', (e) => specSeek(x, e));
        spec.addEventListener('pointermove', (e) => { if (e.buttons === 1) specSeek(x, e); });
    }
}

function bindRange(id, fn) {
    const el = byId(id);
    if (el) el.addEventListener('input', (e) => fn(e.target.value));
}

function wireMixer() {
    onXfader();
}

function wireRack() {
    dj.rack.grid = byId('dj-rack');
    document.querySelectorAll('#dj-app .dj-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
            const r = parseInt(cell.dataset.r);
            const c = parseInt(cell.dataset.c);
            const key = ['kick', 'hat', 'snare', 'bass'][r];
            dj.rack.seq[key][c] = dj.rack.seq[key][c] ? 0 : 1;
            cell.classList.toggle('on');
        });
    });
}

function setMaster6(name) {
    dj.syncMaster = name;
    ['a', 'b'].forEach((x) => {
        const t = byId(x + '-master');
        if (t) {
            t.innerText = x === name ? '<MASTER>' : 'master';
            t.style.opacity = x === name ? '1' : '0.4';
        }
    });
    setStatus(name, 'TEMPO MASTER');
}

function onXfader() {
    const el = byId('dj-xfader');
    if (!el) return;
    const v = parseInt(el.value);
    const theta = (v / 100) * (Math.PI / 2);
    const a = Math.cos(theta);
    const b = Math.sin(theta);
    if (dj.decks.a.nodes) dj.decks.a.nodes.xfGain.gain.value = a;
    if (dj.decks.b.nodes) dj.decks.b.nodes.xfGain.gain.value = b;
    const disp = byId('dj-xfader-display');
    if (disp) disp.innerText = 'A ' + Math.round(a * 100) + ' | B ' + Math.round(b * 100);
    applyYtVolume('a', a);
    applyYtVolume('b', b);
}

function applyYtVolume(x, cross) {
    const p = dj.yt[x];
    if (!p || !dj.decks[x] || dj.decks[x].mode !== 'yt') return;
    const fader = byId(x + '-fader');
    const f = fader ? parseInt(fader.value) / 100 : 0.85;
    const trim = byId(x + '-trim');
    const t = trim ? parseInt(trim.value) / 100 : 0.9;
    p.setVolume(Math.max(0, Math.min(100, cross * f * t * 100)));
}

// ============================================================
//  LOADING
// ============================================================
function setStatus(x, msg) {
    const el = byId(x + '-status');
    if (el) el.innerText = 'ENGINE: ' + msg.toUpperCase();
}

async function probeBackend() {
    try {
        const r = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
        dj.proxy = r.ok;
    } catch (e) {
        dj.proxy = false;
    }
}

async function loadFile6(x) {
    const inp = byId(x + '-file');
    if (!inp || !inp.files.length) return;
    const f = inp.files[0];
    const c = ensureCtx();
    setStatus(x, 'DECODING ' + f.name.toUpperCase());
    try {
        const data = await f.arrayBuffer();
        const buf = await c.decodeAudioData(data);
        setupAudioDeck(x, buf, f.name);
    } catch (e) {
        setStatus(x, 'DECODE FAILED');
    }
}

async function loadUrl6(x) {
    const url = byId(x + '-url').value.trim();
    if (!url) { setStatus(x, 'ENTER A URL FIRST'); return; }
    const c = ensureCtx();
    const target = dj.proxy ? ('/api/audio/proxy?url=' + encodeURIComponent(url)) : url;
    setStatus(x, dj.proxy ? 'FETCHING VIA PROXY' : 'FETCHING DIRECT');
    try {
        const resp = await fetch(target);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.arrayBuffer();
        const buf = await c.decodeAudioData(data);
        setupAudioDeck(x, buf, url.replace(/^https?:\/\//, '').slice(0, 40));
    } catch (e) {
        setStatus(x, 'LOAD FAILED: ' + (e.message || 'CORS/UNKNOWN'));
    }
}

function setupAudioDeck(x, buf, title) {
    const d = dj.decks[x];
    buildDeckGraph(x);
    stopSource(d);
    d.mode = 'audio';
    d.buffer = buf;
    d.title = title || 'AUDIO TRACK';
    d.dur = buf.duration;
    d.peaks = computePeaks(buf, 512);
    d.bpm = detectBpm(buf);
    d.bpmSource = d.bpm ? 'auto' : 'none';
    d.hot = [null, null, null];
    d.loopIn = 0;
    d.loopOut = d.dur;
    d.loopOn = false;
    d.offset = 0;
    d.pitch = 0;
    d.syncRate = 1;
    d.rate = 1;
    d.playing = false;
    d.delayTime = 0;
    d.delayFb = 0;
    d.reverbMix = 0;
    d.pan = 0;
    d.distortion = 0;
    d.bitcrush = 0;
    d.flanger = 0;
    d.delaySync = false;
    d.delayNote = 0.25;
    d.filterRes = 0.6;
    d.tapTimes = [];
    specPeaks[x] = null;
    byId(x + '-pitch').value = 0;
    byId(x + '-pan').value = 0;
    byId(x + '-delay').value = 0;
    byId(x + '-delayfb').value = 0;
    byId(x + '-reverb').value = 0;
    byId(x + '-distortion').value = 0;
    byId(x + '-bitcrush').value = 0;
    byId(x + '-flanger').value = 0;
    byId(x + '-filter-res').value = 30;
    byId(x + '-delay-sync').innerText = 'SYNC';
    byId(x + '-delay-note').value = '0.25';
    byId(x + '-loop').innerText = 'LOOP';
    if (d.nodes) {
        d.nodes.panner.pan.value = 0;
        d.nodes.delayMix.gain.value = 0;
        d.nodes.delayFb.gain.value = 0;
        d.nodes.reverbSend.gain.value = 0;
        d.nodes.filter.Q.value = 0.6;
        d.nodes.distortion.curve = makeDistortionCurve(0);
        d.nodes.bitcrusher.curve = makeBitcrushCurve(0);
        d.nodes.flangerDepth.gain.value = 0;
    }
    updateDeckUI(x);
    setStatus(x, 'AUDIO ' + (d.bpm ? d.bpm + ' BPM' : 'BPM UNKNOWN') + (d.bpmSource === 'auto' ? ' (AUTO)' : ''));
    updateMasterBpm();
}

function updateDeckUI(x) {
    const d = dj.decks[x];
    const t = byId(x + '-title');
    if (t) t.innerText = d.title || 'NO TRACK LOADED';
    const m = byId(x + '-mode');
    if (m) m.innerText = d.mode.toUpperCase();
    const b = byId(x + '-bpm');
    if (b) b.innerText = d.bpm ? d.bpm + ' BPM' : '-- BPM';
    setPitchText(x);
    drawWave(x, true);
}

// ============================================================
//  TRANSPORT (audio mode)
// ============================================================
function startSource(d) {
    const c = dj.ctx;
    if (!c || !d.buffer) return;
    const src = c.createBufferSource();
    src.buffer = d.buffer;
    src.playbackRate.value = d.rate;
    applyLoopToSource(d, src);
    src.connect(d.nodes.preGain);
    if (d.loopOn && d.offset >= d.loopEnd) d.offset = d.loopIn;
    src.start(0, d.offset);
    d.src = src;
    d.anchor = c.currentTime;
    d.playing = true;
}

function pauseSource(d) {
    if (d.src) {
        try { d.src.stop(); } catch (e) {}
        d.src.disconnect();
        d.src = null;
    }
    d.offset = getPos(d);
    d.playing = false;
}

function stopSource(d) {
    if (d.src) {
        try { d.src.stop(); } catch (e) {}
        try { d.src.disconnect(); } catch (e) {}
        d.src = null;
    }
    d.playing = false;
    d.offset = 0;
}

function getPos(d) {
    if (d.mode !== 'audio' || !d.buffer) return 0;
    if (!d.playing || !d.src) return Math.max(0, Math.min(d.offset, d.dur));
    let p = d.offset + (dj.ctx.currentTime - d.anchor) * d.rate;
    if (d.loopOn && d.loopEnd > d.loopIn) {
        const len = d.loopEnd - d.loopIn;
        p = d.loopIn + ((p - d.loopIn) % len + len) % len;
    }
    return Math.max(0, Math.min(p, d.dur));
}

function seekDeck(x, pos) {
    const d = dj.decks[x];
    if (d.mode !== 'audio' || !d.buffer) return;
    pos = Math.max(0, Math.min(pos, d.dur));
    if (d.playing) {
        pauseSource(d);
        d.offset = pos;
        startSource(d);
    } else {
        d.offset = pos;
    }
    drawWave(x, true);
}

function drawCircularViz() {
    const canvas = byId('dj-circular');
    if (!canvas) return;
    const ctx2 = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const beatFlash = beatCooldown > 4 ? 1 : 0;
    ctx2.fillStyle = beatFlash ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.18)';
    ctx2.fillRect(0, 0, W, H);
    const analyser = dj.ctx && dj.ctx.masterAnalyser;
    if (!analyser) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);
    const cx = W / 2;
    const cy = H / 2;
    const baseR = Math.min(W, H) * 0.22;
    const bars = 64;
    const step = Math.max(1, Math.floor(bufLen / bars));
    for (let i = 0; i < bars; i++) {
        const val = data[i * step] || 0;
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const barH = (val / 255) * baseR * 1.2;
        const x1 = cx + Math.cos(angle) * baseR;
        const y1 = cy + Math.sin(angle) * baseR;
        const x2 = cx + Math.cos(angle) * (baseR + barH);
        const y2 = cy + Math.sin(angle) * (baseR + barH);
        const hue = (i / bars) * 60 + (beatFlash ? 180 : 0);
        ctx2.strokeStyle = i % 2 === 0 ? '#00ffff' : '#ff00ff';
        ctx2.shadowBlur = beatFlash ? 12 : 4;
        ctx2.shadowColor = ctx2.strokeStyle;
        ctx2.lineWidth = beatFlash ? 3 : 2;
        ctx2.beginPath();
        ctx2.moveTo(x1, y1);
        ctx2.lineTo(x2, y2);
        ctx2.stroke();
    }
    ctx2.shadowBlur = 0;
    ctx2.strokeStyle = beatFlash ? '#ffffff' : '#333';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx2.stroke();
}

let lastBeatEnergy = 0;
let beatCooldown = 0;

function detectBeat() {
    if (!dj.ctx || !dj.ctx.masterAnalyser) return false;
    const analyser = dj.ctx.masterAnalyser;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
    }
    const energy = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (beatCooldown > 0) { beatCooldown--; return false; }
    if (energy > lastBeatEnergy * 1.4 && energy > 0.05) {
        lastBeatEnergy = energy;
        beatCooldown = 8;
        return true;
    }
    lastBeatEnergy = energy * 0.9 + lastBeatEnergy * 0.1;
    return false;
}

function flashOnBeat() {
    if (!dj.alive) return;
    const isBeat = detectBeat();
    if (isBeat) {
        document.querySelectorAll('.dj-deck').forEach((deck) => {
            deck.style.boxShadow = 'inset 0 0 30px rgba(255,255,255,0.15)';
            setTimeout(() => { deck.style.boxShadow = ''; }, 80);
        });
    }
}

function drawOscilloscope(x) {
    const canvas = byId(x + '-osc');
    if (!canvas) return;
    const d = dj.decks[x];
    const W = canvas.clientWidth || 600;
    const H = canvas.clientHeight || 64;
    canvas.width = W;
    canvas.height = H;
    const ctx2 = canvas.getContext('2d');
    ctx2.fillStyle = '#000';
    ctx2.fillRect(0, 0, W, H);
    const analyser = d.nodes && d.nodes.analyser;
    if (!analyser) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(data);
    const c = DJ_COLORS[x];
    ctx2.lineWidth = 2;
    ctx2.strokeStyle = c;
    ctx2.shadowBlur = 6;
    ctx2.shadowColor = c;
    ctx2.beginPath();
    const sliceWidth = W / bufLen;
    let px = 0;
    for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0;
        const py = (v * H) / 2;
        if (i === 0) ctx2.moveTo(px, py);
        else ctx2.lineTo(px, py);
        px += sliceWidth;
    }
    ctx2.lineTo(W, H / 2);
    ctx2.stroke();
    ctx2.shadowBlur = 0;
}

let specPeaks = {};

function drawSpectrum(x) {
    const canvas = byId(x + '-spectrum');
    if (!canvas) return;
    const d = dj.decks[x];
    const W = canvas.clientWidth || 600;
    const H = canvas.clientHeight || 64;
    canvas.width = W;
    canvas.height = H;
    if (!W || !H) return;
    const ctx2 = canvas.getContext('2d');
    ctx2.fillStyle = '#000';
    ctx2.fillRect(0, 0, W, H);
    if (d.mode === 'yt' && d.playing) {
        const c = DJ_COLORS[x];
        const barCount = 48;
        const bw = W / barCount;
        const t = performance.now() * 0.003;
        for (let i = 0; i < barCount; i++) {
            const val = (Math.sin(t + i * 0.3) * 0.5 + 0.5) * (Math.random() * 0.5 + 0.5);
            const bh = val * H * 0.8;
            ctx2.fillStyle = c;
            ctx2.shadowBlur = 4;
            ctx2.shadowColor = c;
            ctx2.fillRect(i * bw, H - bh, Math.max(1, bw - 1), bh);
        }
        ctx2.shadowBlur = 0;
        return;
    }
    const analyser = d.nodes && d.nodes.spectrum;
    if (!analyser) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);
    const barCount = 48;
    const step = Math.max(1, Math.floor(bufLen / barCount));
    const bw = W / barCount;
    const c = DJ_COLORS[x];
    if (!specPeaks[x]) specPeaks[x] = new Float32Array(barCount);
    for (let i = 0; i < barCount; i++) {
        const val = data[i * step] || 0;
        if (val > specPeaks[x][i]) specPeaks[x][i] = val;
        else specPeaks[x][i] = Math.max(0, specPeaks[x][i] - 1.5);
        const bh = (val / 255) * H * 0.9;
        const ph = (specPeaks[x][i] / 255) * H * 0.9;
        ctx2.fillStyle = c;
        ctx2.shadowBlur = 4;
        ctx2.shadowColor = c;
        ctx2.fillRect(i * bw, H - bh, Math.max(1, bw - 1), bh);
        ctx2.fillStyle = '#ffffff';
        ctx2.shadowBlur = 0;
        ctx2.fillRect(i * bw, H - ph - 2, Math.max(1, bw - 1), 2);
    }
    ctx2.shadowBlur = 0;
}

function togglePlay6(x) {
    const d = dj.decks[x];
    if (d.mode === 'audio') {
        ensureCtx();
        if (d.playing) pauseSource(d);
        else startSource(d);
    } else if (d.mode === 'yt') {
        const p = dj.yt[x];
        if (p && p.getPlayerState) {
            if (p.getPlayerState() === 1) p.pauseVideo();
            else p.playVideo();
        }
    } else {
        setStatus(x, 'LOAD A TRACK FIRST');
        return;
    }
    updatePlayBtn(x);
}

function updatePlayBtn(x) {
    const btn = byId(x + '-play');
    if (btn) btn.innerText = dj.decks[x].playing ? 'PAUSE' : 'PLAY';
}

function cueDeck6(x) {
    const d = dj.decks[x];
    if (d.mode === 'audio') {
        if (d.playing) pauseSource(d);
        d.offset = d.loopOn ? d.loopIn : 0;
        drawWave(x, true);
        setStatus(x, 'CUED');
    } else if (d.mode === 'yt') {
        const p = dj.yt[x];
        if (p) { p.pauseVideo(); p.seekTo(0, true); }
    }
}

function playBoth6() {
    ['a', 'b'].forEach((x) => {
        const d = dj.decks[x];
        if (d.mode === 'audio') togglePlay6(x);
        else if (d.mode === 'yt') { const p = dj.yt[x]; if (p && p.playVideo) p.playVideo(); }
    });
}

function pauseBoth6() {
    ['a', 'b'].forEach((x) => {
        const d = dj.decks[x];
        if (d.mode === 'audio' && d.playing) togglePlay6(x);
        else if (d.mode === 'yt') { const p = dj.yt[x]; if (p && p.pauseVideo) p.pauseVideo(); }
    });
}

function stopAll6() {
    ['a', 'b'].forEach((x) => {
        const d = dj.decks[x];
        if (d.mode === 'audio') { stopSource(d); }
        if (d.mode === 'yt') {
            const p = dj.yt[x];
            if (p) { try { p.pauseVideo(); } catch (e) {} try { p.seekTo(0, true); } catch (e) {} }
        }
        updatePlayBtn(x);
    });
    const xf = byId('dj-xfader');
    if (xf) xf.value = 50;
    onXfader();
}

// ============================================================
//  LOOPS + HOT CUES + BPM + SYNC
// ============================================================
function applyLoopToSource(d, src) {
    if (!src) return;
    src.loop = d.loopOn;
    if (d.loopOn) {
        src.loopStart = d.loopIn;
        src.loopEnd = d.loopOut;
    }
}

function setLoopIn6(x) {
    const d = dj.decks[x];
    if (d.mode !== 'audio') { setStatus(x, 'AUDIO DECK ONLY'); return; }
    d.loopIn = Math.min(getPos(d), d.loopOut);
    applyLoopToSource(d, d.src);
    drawWave(x, false);
    setStatus(x, 'LOOP IN @ ' + fmtTime(d.loopIn));
}

function setLoopOut6(x) {
    const d = dj.decks[x];
    if (d.mode !== 'audio') { setStatus(x, 'AUDIO DECK ONLY'); return; }
    d.loopOut = Math.max(getPos(d), d.loopIn);
    applyLoopToSource(d, d.src);
    drawWave(x, false);
    setStatus(x, 'LOOP OUT @ ' + fmtTime(d.loopOut));
}

function toggleLoop6(x) {
    const d = dj.decks[x];
    if (d.mode !== 'audio') return;
    d.loopOn = !d.loopOn;
    if (d.loopOn && d.loopOut <= d.loopIn) { d.loopIn = 0; d.loopOut = d.dur; }
    applyLoopToSource(d, d.src);
    if (!d.playing && d.loopOn && d.offset < d.loopIn) d.offset = d.loopIn;
    const btn = byId(x + '-loop');
    if (btn) btn.innerText = d.loopOn ? 'LOOP ON' : 'LOOP';
    btn.style.opacity = d.loopOn ? '1' : '0.5';
    drawWave(x, false);
    setStatus(x, d.loopOn ? 'LOOP ENGAGED' : 'LOOP DISENGAGED');
}

function hotCue6(x, idx) {
    const d = dj.decks[x];
    if (d.mode !== 'audio') return;
    const btn = byId(x + '-cue' + idx);
    if (!d.hot[idx]) {
        d.hot[idx] = getPos(d);
        if (btn) btn.innerText = fmtTime(d.hot[idx]);
        setStatus(x, 'CUE ' + (idx + 1) + ' SET @ ' + fmtTime(d.hot[idx]));
    } else {
        seekDeck(x, d.hot[idx]);
        flare(btn);
        setStatus(x, 'JUMP TO CUE ' + (idx + 1));
    }
}

function flare(el) {
    if (!el) return;
    el.style.background = '#fff';
    setTimeout(() => { el.style.background = ''; }, 120);
}

function editBPM6(x) {
    const d = dj.decks[x];
    const cur = d.bpm || '';
    const input = prompt('BPM for Deck ' + x.toUpperCase() + ':', cur);
    if (input === null) return;
    const v = parseInt(input);
    if (isNaN(v) || v < 40 || v > 300) { setStatus(x, 'BPM 40-300 ONLY'); return; }
    d.bpm = v;
    d.bpmSource = 'manual';
    updateDeckUI(x);
    updateMasterBpm();
    setStatus(x, v + ' BPM (MANUAL)');
}

function setPitch6(x, v) {
    const d = dj.decks[x];
    d.pitch = v / 100;
    updateRate(x);
}

function updateRate(x) {
    const d = dj.decks[x];
    if (d.mode === 'audio') {
        d.rate = d.syncRate * (1 + d.pitch);
        if (d.src) d.src.playbackRate.value = d.rate;
    } else if (d.mode === 'yt') {
        d.rate = d.syncRate * (1 + d.pitch);
        const p = dj.yt[x];
        if (p && p.setPlaybackRate) p.setPlaybackRate(Math.max(0.25, Math.min(2, d.rate)));
    }
    setPitchText(x);
}

function setPitchText(x) {
    const d = dj.decks[x];
    const el = byId(x + '-bpm');
    if (el && d.mode === 'audio') {
        const pct = Math.round((d.rate - 1) * 100 * 10) / 10;
        el.innerText = (d.bpm ? d.bpm + ' BPM' : '-- BPM') + (pct ? '  ' + (pct > 0 ? '+' : '') + pct + '%' : '');
    }
}

const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch'];
const FILTER_LABELS = ['LP', 'HP', 'BP', 'NT'];

function cycleFilterType(x) {
    const d = dj.decks[x];
    if (!d.nodes) return;
    const cur = d.nodes.filter.type;
    let idx = FILTER_TYPES.indexOf(cur);
    if (idx < 0) idx = 0;
    idx = (idx + 1) % FILTER_TYPES.length;
    d.nodes.filter.type = FILTER_TYPES[idx];
    const btn = byId(x + '-filter-type');
    if (btn) btn.innerText = FILTER_LABELS[idx];
    setStatus(x, 'FILTER: ' + FILTER_LABELS[idx]);
}

function syncBPM6() {
    const master = dj.decks[dj.syncMaster];
    const slave = dj.decks[dj.syncMaster === 'a' ? 'b' : 'a'];
    if (!master.bpm || !slave.bpm) {
        setStatus(dj.syncMaster, 'SET MASTER + SLAVE BPM FIRST');
        return;
    }
    slave.syncRate = master.bpm / slave.bpm;
    updateRate(slave.name);
    setStatus(slave.name, 'SYNCED ' + master.name.toUpperCase() + '->' + slave.name.toUpperCase() +
        ' @ ' + Math.round(slave.syncRate * 1000) / 1000);
    updateMasterBpm();
}

function toggleLimiter6() {
    dj.limiterOn = !dj.limiterOn;
    setShaperCurve(dj.limiterOn);
    const btn = byId('dj-limiter');
    if (btn) btn.innerText = dj.limiterOn ? 'LIM ON' : 'LIM OFF';
}

function updateMasterBpm() {
    const m = dj.decks[dj.syncMaster];
    const el = byId('dj-master-bpm');
    if (el) el.innerText = (m && m.bpm ? m.bpm : '--') + ' BPM' + (m.bpmSource === 'manual' ? ' (M)' : '');
    const r = byId('dj-rack-bpm');
    if (r) r.innerText = m && m.bpm ? m.bpm : (dj.rack.bpm || '128');
}

// ============================================================
//  WAVEFORM
// ============================================================
function computePeaks(buf, bins) {
    const ch = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(ch.length / bins));
    const peaks = [];
    for (let i = 0; i < bins; i++) {
        let mn = 1, mx = -1;
        const s = i * block;
        const e = Math.min(s + block, ch.length);
        for (let j = s; j < e; j++) {
            const v = ch[j];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        peaks.push({ mn: mn, mx: mx });
    }
    return peaks;
}

function drawWave(x, force) {
    const canvas = byId(x + '-wave');
    if (!canvas) return;
    const d = dj.decks[x];
    const W = canvas.clientWidth || 600;
    const H = canvas.clientHeight || 72;
    canvas.width = W;
    canvas.height = H;
    if (!W || !H) return;
    const ctx2 = canvas.getContext('2d');
    ctx2.fillStyle = '#000';
    ctx2.fillRect(0, 0, W, H);
    if (d.mode !== 'audio' || !d.peaks) {
        if (d.mode === 'yt' && d.playing) {
            const t = performance.now() * 0.005;
            ctx2.fillStyle = c;
            ctx2.shadowBlur = 6;
            ctx2.shadowColor = c;
            const barCount = 40;
            const bw = W / barCount;
            for (let i = 0; i < barCount; i++) {
                const h = (Math.sin(t + i * 0.4) * 0.5 + 0.5) * (Math.random() * 0.4 + 0.3) * H;
                ctx2.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 1), h);
            }
            ctx2.shadowBlur = 0;
        } else {
            ctx2.fillStyle = '#444';
            ctx2.font = '16px VT323, monospace';
            ctx2.textAlign = 'center';
            ctx2.fillText(d.mode === 'yt' ? 'YT STREAM — NO ANALYSIS' : 'LOAD AUDIO TO SEE WAVEFORM', W / 2, H / 2 + 5);
        }
        return;
    }
    const c = DJ_COLORS[x];
    const dur = d.dur || 1;

    if (d.bpm > 0) {
        const beatSec = 60 / d.bpm;
        ctx2.fillStyle = 'rgba(255,255,255,0.06)';
        for (let t = beatSec; t < dur; t += beatSec) {
            ctx2.fillRect((t / dur) * W, 0, 1, H);
        }
    }

    if (d.loopOn) {
        ctx2.fillStyle = 'rgba(51,255,0,0.12)';
        const x1 = (d.loopIn / dur) * W;
        const x2 = (d.loopOut / dur) * W;
        ctx2.fillRect(x1, 0, Math.max(1, x2 - x1), H);
    }

    const half = H / 2;
    const bw = W / d.peaks.length;
    ctx2.fillStyle = c;
    ctx2.shadowBlur = 8;
    ctx2.shadowColor = c;
    for (let i = 0; i < d.peaks.length; i++) {
        const top = half - d.peaks[i].mx * half * 0.9;
        const bot = half - d.peaks[i].mn * half * 0.9;
        ctx2.fillRect(i * bw, top, Math.max(0.7, bw - 0.5), Math.max(1, bot - top));
    }
    ctx2.shadowBlur = 0;

    ctx2.fillStyle = '#33ff00';
    d.hot.forEach((cue, i) => {
        if (cue === null) return;
        const px = (cue / dur) * W;
        ctx2.beginPath();
        ctx2.moveTo(px - 4, H - 2);
        ctx2.lineTo(px + 4, H - 2);
        ctx2.lineTo(px, H - 12);
        ctx2.closePath();
        ctx2.fill();
        ctx2.font = '11px VT323, monospace';
        ctx2.fillText(i + 1 + ':' + fmtTime(cue), px + 5, H - 6);
    });

    const pos = getPos(d);
    const playX = (pos / dur) * W;
    ctx2.shadowBlur = 6;
    ctx2.shadowColor = '#ffffff';
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(playX - 1, 0, 3, H);
    ctx2.shadowColor = '#33ff00';
    ctx2.fillStyle = '#33ff00';
    ctx2.globalAlpha = 0.7;
    ctx2.fillRect(playX - 1, 0, 1, H);
    ctx2.globalAlpha = 1;
    ctx2.shadowBlur = 0;
}

// ============================================================
//  BPM DETECTION (autocorrelation on energy envelope)
// ============================================================
function detectBpm(buf) {
    try {
        const ch = buf.getChannelData(0);
        const sr = buf.sampleRate;
        const hop = Math.max(64, Math.floor(sr / 50));
        const frames = Math.min(3000, Math.floor(ch.length / hop));
        if (frames < 96) return 0;
        const env = new Float32Array(frames);
        for (let i = 0; i < frames; i++) {
            let s = 0, cnt = 0;
            const end = Math.min(ch.length, (i + 1) * hop);
            for (let j = i * hop; j < end; j++) { s += Math.abs(ch[j]); cnt++; }
            env[i] = s / (cnt || 1);
        }
        const fps = sr / hop;
        const minLag = Math.max(2, Math.floor((fps * 60) / 190));
        const maxLag = Math.max(minLag + 2, Math.ceil((fps * 60) / 65));
        let bestLag = 0, best = -Infinity;
        for (let lag = minLag; lag <= maxLag && lag < frames / 2; lag++) {
            let acc = 0;
            for (let i = 0; i + lag < frames; i++) acc += env[i] * env[i + lag];
            acc /= frames;
            if (acc > best) { best = acc; bestLag = lag; }
        }
        if (!bestLag) return 0;
        const bpm = (fps * 60) / bestLag;
        const snapped = Math.round(bpm);
        return snapped >= 65 && snapped <= 190 ? snapped : 0;
    } catch (e) {
        return 0;
    }
}

// ============================================================
//  STEP SEQUENCER (chiptune drums, 8-bit voices from crt-player)
// ============================================================
function masterBpm() {
    const m = dj.decks[dj.syncMaster];
    return (m && m.bpm) || dj.decks.a.bpm || dj.decks.b.bpm || dj.rack.bpm || 128;
}

function rackPlay6() {
    const c = ensureCtx();
    const btn = byId('dj-rack-play');
    if (dj.rack.on) {
        rackStop();
        if (btn) btn.innerText = 'PLAY';
        return;
    }
    dj.rack.on = true;
    dj.rack.bpm = masterBpm();
    dj.rack.step = 0;
    dj.rack.nextTime = c.currentTime + 0.05;
    dj.rack.stepDur = 60 / dj.rack.bpm / 4;
    if (btn) btn.innerText = 'STOP';
    rackSched();
}

function rackSched() {
    if (!dj.rack.on) return;
    const c = dj.ctx;
    if (!c) return;
    const ahead = 0.06;
    while (dj.rack.nextTime < c.currentTime + ahead) {
        scheduleRackStep(dj.rack.nextTime);
        dj.rack.nextTime += dj.rack.stepDur;
    }
    dj.rack.timer = setTimeout(rackSched, 25);
}

function scheduleRackStep(t) {
    const s = dj.rack.seq;
    const i = dj.rack.step;
    if (s.kick[i]) rackVoice('kick', t);
    if (s.hat[i]) rackVoice('hat', t);
    if (s.snare[i]) rackVoice('snare', t);
    if (s.bass[i]) rackVoice('bass', t);
    rackFlash(i);
    dj.rack.step = (dj.rack.step + 1) % 16;
}

function rackFlash(col) {
    const cells = document.querySelectorAll('#dj-app .dj-cell[data-c="' + col + '"]');
    cells.forEach((cell) => cell.classList.add('flash'));
    setTimeout(() => {
        cells.forEach((cell) => cell.classList.remove('flash'));
    }, 90);
}

function rackVoice(kind, t) {
    const c = dj.ctx;
    if (!c) return;
    const out = c.rackIn;
    if (kind === 'kick') {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 0.12);
    } else if (kind === 'hat') {
        const n = c.createBufferSource();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        n.buffer = c.noiseBuf;
        n.loop = true;
        f.type = 'highpass';
        f.frequency.value = 1000;
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        n.connect(f);
        f.connect(g);
        g.connect(out);
        n.start(t);
        n.stop(t + 0.05);
    } else if (kind === 'snare') {
        const n = c.createBufferSource();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        const o = c.createOscillator();
        const og = c.createGain();
        n.buffer = c.noiseBuf;
        n.loop = true;
        f.type = 'highpass';
        f.frequency.value = 1500;
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        n.connect(f);
        f.connect(g);
        g.connect(out);
        n.start(t);
        n.stop(t + 0.13);
        o.type = 'triangle';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
        og.gain.setValueAtTime(0.25, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og);
        og.connect(out);
        o.start(t);
        o.stop(t + 0.11);
    } else if (kind === 'bass') {
        const bassline = [110, 110, 110, 87.31, 130.81, 110, 146.83, 87.31];
        const note = bassline[dj.rack.step % bassline.length];
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(note, t);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 0.22);
    }
}

function rackStop() {
    dj.rack.on = false;
    if (dj.rack.timer) clearTimeout(dj.rack.timer);
    dj.rack.timer = null;
    document.querySelectorAll('#dj-app .dj-cell.flash').forEach((c) => c.classList.remove('flash'));
}

// ============================================================
//  YOUTUBE AUX (no sample access — volume control only)
// ============================================================
function ensureYt() {
    if (window.YT && dj.ytReady) return;
    if (dj.ytApiLoading) return;
    dj.ytApiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
    dj.ytReady = true;
    createYtPlayer('a');
    createYtPlayer('b');
};

function createYtPlayer(x) {
    const container = byId(x + '-yt-container');
    if (!container || dj.yt[x]) return;
    dj.yt[x] = new YT.Player(container.id, {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
        events: {
            onStateChange: (e) => onYtState(x, e)
        }
    });
}

function onYtState(x, e) {
    const d = dj.decks[x];
    if (!d) return;
    if (e.data === YT.PlayerState.PLAYING) {
        d.playing = true;
    } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
        d.playing = false;
    }
    updatePlayBtn(x);
}

function loadYt6(x) {
    const id = byId(x + '-yt').value.trim();
    if (!id) { setStatus(x, 'ENTER YT ID'); return; }
    ensureYt();
    if (!dj.ytReady || !dj.yt[x]) {
        setStatus(x, 'YT API STARTING...');
        dj.ytPending = dj.ytPending || {};
        dj.ytPending[x] = id;
        return;
    }
    startYt(x, id);
}

function startYt(x, id) {
    const d = dj.decks[x];
    const p = dj.yt[x];
    if (!p) return;
    d.mode = 'yt';
    d.title = 'YT: ' + id;
    d.bpm = 0;
    d.playing = false;
    stopSource(d);
    p.loadVideoById(id);
    p.setVolume(80);
    updateDeckUI(x);
    onXfader();
    setStatus(x, 'YT AUX STREAM');
}

// ============================================================
//  PER-DECK LRC (only in pages that ship an LRC panel)
// ============================================================
function lrcPanel() {
    return byId('lrc-panel');
}

function parseLRC2(text) {
    const out = [];
    const re = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;
    for (const line of text.split('\n')) {
        const m = line.match(re);
        if (m) {
            const time = parseInt(m[1]) * 60 + parseInt(m[2]) + (parseInt(m[3]) / (m[3].length === 2 ? 10 : 1000));
            const t = m[4].trim();
            if (t) out.push({ time: time, text: t });
        }
    }
    return out;
}

function renderLRC2(lines) {
    const panel = lrcPanel();
    if (!panel) return;
    panel.innerHTML = '';
    dj.lrcElems = [];
    if (!lines || lines.length === 0) { panel.innerHTML = '> NO LRC DATA'; return; }
    lines.forEach((line) => {
        const div = document.createElement('div');
        div.className = 'lrc-line';
        line.text.split(' ').forEach((w) => {
            const s = document.createElement('span');
            s.className = 'word';
            s.innerText = w + ' ';
            div.appendChild(s);
        });
        panel.appendChild(div);
        dj.lrcElems.push(div);
    });
}

function openLRCModal6() {
    if (!lrcPanel()) return;
    byId('lrc-textarea').value = '';
    byId('lrc-modal').classList.add('open');
}

function closeLRCModal6() {
    const m = byId('lrc-modal');
    if (m) m.classList.remove('open');
}

function applyLRC6() {
    const panel = lrcPanel();
    if (!panel) return;
    const text = byId('lrc-textarea').value.trim();
    if (!text) { dj.lrc = []; renderLRC2([]); closeLRCModal6(); return; }
    const parsed = parseLRC2(text);
    if (parsed.length === 0) {
        const lines = text.split('\n').filter((l) => l.trim());
        dj.lrc = lines.map((line, i) => ({ time: i * 3, text: line.trim() }));
    } else {
        dj.lrc = parsed;
    }
    renderLRC2(dj.lrc);
    closeLRCModal6();
}

function activeLrcClock() {
    const xf = byId('dj-xfader');
    const v = xf ? parseInt(xf.value) : 50;
    const aw = v <= 50 ? 1 : (100 - v) / 50;
    const bw = v >= 50 ? 1 : v / 50;
    let decksLive = ['a', 'b'].filter((x) => dj.decks[x].playing).sort((x, y) => {
        const wx = x === 'a' ? aw : bw;
        const wy = y === 'a' ? aw : bw;
        return wy - wx;
    });
    return decksLive[0] || 'a';
}

function lrcSyncTick() {
    if (!lrcPanel()) return;
    const x = activeLrcClock();
    const d = dj.decks[x];
    if (!d.playing || dj.lrc.length === 0 || dj.lrcElems.length === 0) return;
    const cur = getPos(d);
    let active = -1;
    for (let i = dj.lrc.length - 1; i >= 0; i--) {
        if (cur >= dj.lrc[i].time) { active = i; break; }
    }
    dj.lrcElems.forEach((el, idx) => {
        el.classList.remove('active', 'sung');
        if (idx < active) el.classList.add('sung');
        else if (idx === active) el.classList.add('active');
    });
}

function exportLRC() {
    if (!lrcPanel() || dj.lrc.length === 0) return;
    const text = dj.lrc.map((l) => {
        const m = Math.floor(l.time / 60);
        const s = l.time % 60;
        return '[' + String(m).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0') + '.' +
            String(Math.floor((s % 1) * 100)).padStart(2, '0') + ']' + l.text;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics.lrc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function copyLRC() {
    if (!lrcPanel() || dj.lrc.length === 0) return;
    const text = dj.lrc.map((l) => {
        const m = Math.floor(l.time / 60);
        const s = l.time % 60;
        return '[' + String(m).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0') + '.' +
            String(Math.floor((s % 1) * 100)).padStart(2, '0') + ']' + l.text;
    }).join('\n');
    navigator.clipboard.writeText(text);
}

function shareURL() {
    if (!lrcPanel() || dj.lrc.length === 0) return;
    const text = dj.lrc.map((l) => {
        const m = Math.floor(l.time / 60);
        const s = l.time % 60;
        return '[' + String(m).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0') + '.' +
            String(Math.floor((s % 1) * 100)).padStart(2, '0') + ']' + l.text;
    }).join('\n');
    const encoded = btoa(unescape(encodeURIComponent(text)));
    const url = window.location.origin + window.location.pathname + '#' + encoded;
    navigator.clipboard.writeText(url);
}

function loadFromHash() {
    const hash = window.location.hash.substring(1);
    if (!hash || !lrcPanel()) return false;
    try {
        const parsed = parseLRC2(decodeURIComponent(escape(atob(hash))));
        if (parsed.length > 0) { dj.lrc = parsed; renderLRC2(parsed); return true; }
    } catch (e) {}
    return false;
}

// ============================================================
//  MAIN LOOP + MOUNT / UNMOUNT
// ============================================================
function engineTick() {
    if (!dj.alive) return;
    const isBeat = detectBeat();
    ['a', 'b'].forEach((x) => {
        const d = dj.decks[x];
        if (d.mode === 'audio') {
            const pos = getPos(d);
            const t = byId(x + '-time');
            if (t) t.innerText = fmtTime(pos) + ' / ' + fmtTime(d.dur);
            if (d.nodes && d.nodes.analyser) {
                const rms = vuRms(d.nodes.analyser);
                setVu(x + '-vu', rms);
                d.vu = rms;
            }
            drawWave(x, false);
            drawSpectrum(x);
            drawOscilloscope(x);
        } else if (d.mode === 'yt') {
            const p = dj.yt[x];
            if (p && p.getCurrentTime) {
                const t = byId(x + '-time');
                if (t) t.innerText = fmtTime(p.getCurrentTime() || 0) + ' / ' + fmtTime(p.getDuration() || 0);
            }
            drawWave(x, false);
            drawSpectrum(x);
            drawOscilloscope(x);
        }
    });
    if (dj.ctx && dj.ctx.masterAnalyser) setVu('dj-master-vu', vuRms(dj.ctx.masterAnalyser));
    ['a', 'b'].forEach((x) => { if (dj.decks[x].delaySync) updateDelaySync(x); });
    drawCircularViz();
    if (isBeat) {
        document.querySelectorAll('.dj-deck').forEach((deck) => {
            deck.style.boxShadow = 'inset 0 0 30px rgba(255,255,255,0.15)';
            setTimeout(() => { deck.style.boxShadow = ''; }, 80);
        });
        document.querySelectorAll('.dj-osc').forEach((c) => {
            c.style.boxShadow = '0 0 12px rgba(255,255,255,0.3)';
            setTimeout(() => { c.style.boxShadow = ''; }, 80);
        });
    }
    lrcSyncTick();
    dj.raf = requestAnimationFrame(engineTick);
}

function vuRms(analyser) {
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        s += v * v;
    }
    const rms = Math.sqrt(s / buf.length);
    if (rms < 1e-4) return 0;
    const db = 20 * Math.log10(rms);
    return Math.max(0, Math.min(1, (db + 48) / 48));
}

function setVu(id, level) {
    const el = byId(id);
    if (!el) return;
    const db = level <= 0 ? -Infinity : 20 * Math.log10(level * 1.6);
    el.style.height = Math.max(2, Math.min(100, 100 * (level || 0.01))) + '%';
    el.style.background = db > -6 ? '#ff3355' : (db > -18 ? '#ffbb00' : '#33ff00');
}

// ============================================================
//  DELAY SYNC
// ============================================================
function toggleDelaySync(x) {
    const d = dj.decks[x];
    if (!d || !d.nodes) return;
    d.delaySync = !d.delaySync;
    const btn = byId(x + '-delay-sync');
    if (btn) {
        btn.innerText = d.delaySync ? 'SYNC ON' : 'SYNC';
        btn.style.background = d.delaySync ? '#fff' : '';
        btn.style.color = d.delaySync ? '#000' : '';
    }
    if (d.delaySync) updateDelaySync(x);
    setStatus(x, d.delaySync ? 'DELAY SYNC ON' : 'DELAY FREE');
}

function updateDelaySync(x) {
    const d = dj.decks[x];
    if (!d || !d.nodes || !d.delaySync) return;
    const bpm = d.bpm || dj.decks[dj.syncMaster].bpm || 128;
    const beatSec = 60 / bpm;
    const delaySec = beatSec * d.delayNote;
    d.nodes.delay.delayTime.value = Math.max(0.01, Math.min(2.0, delaySec));
    d.delayTime = d.nodes.delay.delayTime.value;
}

// ============================================================
//  TAP TEMPO
// ============================================================
function tapTempo(x) {
    const d = dj.decks[x];
    const now = performance.now();
    d.tapTimes = d.tapTimes || [];
    d.tapTimes.push(now);
    if (d.tapTimes.length > 8) d.tapTimes.shift();
    if (d.tapTimes.length < 2) return;
    let sum = 0;
    for (let i = 1; i < d.tapTimes.length; i++) sum += d.tapTimes[i] - d.tapTimes[i - 1];
    const avg = sum / (d.tapTimes.length - 1);
    const bpm = Math.round(60000 / avg);
    if (bpm >= 40 && bpm <= 300) {
        d.bpm = bpm;
        d.bpmSource = 'tap';
        updateDeckUI(x);
        updateMasterBpm();
        setStatus(x, bpm + ' BPM (TAP)');
        if (d.delaySync) updateDelaySync(x);
    }
    const btn = byId(x + '-tap');
    if (btn) {
        btn.style.background = '#fff';
        btn.style.color = '#000';
        setTimeout(() => { btn.style.background = ''; btn.style.color = ''; }, 120);
    }
}

// ============================================================
//  FX PRESETS
// ============================================================
function savePreset(x) {
    const d = dj.decks[x];
    const nameInput = byId(x + '-preset-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) { setStatus(x, 'ENTER PRESET NAME'); return; }
    const preset = {
        eqLow: d.nodes && d.nodes.low ? d.nodes.low.gain.value : 0,
        eqMid: d.nodes && d.nodes.mid ? d.nodes.mid.gain.value : 0,
        eqHigh: d.nodes && d.nodes.high ? d.nodes.high.gain.value : 0,
        filterFreq: d.nodes && d.nodes.filter ? d.nodes.filter.frequency.value : 22000,
        filterQ: d.filterRes || 0.6,
        filterType: d.nodes && d.nodes.filter ? d.nodes.filter.type : 'lowpass',
        pan: d.pan || 0,
        delayMix: d.delayTime || 0,
        delayFb: d.delayFb || 0,
        delaySync: d.delaySync || false,
        delayNote: d.delayNote || 0.25,
        reverbMix: d.reverbMix || 0,
        distortion: d.distortion || 0,
        bitcrush: d.bitcrush || 0,
        flanger: d.flanger || 0
    };
    const key = 'dj-preset-' + x + '-' + name;
    localStorage.setItem(key, JSON.stringify(preset));
    setStatus(x, 'PRESET SAVED: ' + name.toUpperCase());
}

function loadPreset(x) {
    const nameInput = byId(x + '-preset-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) { setStatus(x, 'ENTER PRESET NAME'); return; }
    const key = 'dj-preset-' + x + '-' + name;
    const raw = localStorage.getItem(key);
    if (!raw) { setStatus(x, 'PRESET NOT FOUND'); return; }
    const p = JSON.parse(raw);
    const d = dj.decks[x];
    if (!d.nodes) return;
    d.nodes.low.gain.value = p.eqLow || 0;
    d.nodes.mid.gain.value = p.eqMid || 0;
    d.nodes.high.gain.value = p.eqHigh || 0;
    d.nodes.filter.frequency.value = p.filterFreq || 22000;
    d.nodes.filter.Q.value = p.filterQ || 0.6;
    d.nodes.filter.type = p.filterType || 'lowpass';
    d.pan = p.pan || 0;
    d.nodes.panner.pan.value = d.pan;
    d.delayTime = p.delayMix || 0;
    d.nodes.delayMix.gain.value = d.delayTime;
    d.delayFb = p.delayFb || 0;
    d.nodes.delayFb.gain.value = Math.min(0.8, d.delayFb);
    d.delaySync = p.delaySync || false;
    d.delayNote = p.delayNote || 0.25;
    d.reverbMix = p.reverbMix || 0;
    d.nodes.reverbSend.gain.value = d.reverbMix;
    d.distortion = p.distortion || 0;
    d.nodes.distortion.curve = makeDistortionCurve(d.distortion);
    d.bitcrush = p.bitcrush || 0;
    d.nodes.bitcrusher.curve = makeBitcrushCurve(d.bitcrush);
    d.flanger = p.flanger || 0;
    d.nodes.flangerDepth.gain.value = d.flanger * 0.005;
    byId(x + '-pan').value = d.pan * 100;
    byId(x + '-delay').value = d.delayTime * 100;
    byId(x + '-delayfb').value = d.delayFb * 100;
    byId(x + '-reverb').value = d.reverbMix * 100;
    byId(x + '-distortion').value = d.distortion * 100;
    byId(x + '-bitcrush').value = d.bitcrush * 100;
    byId(x + '-flanger').value = d.flanger * 100;
    const syncBtn = byId(x + '-delay-sync');
    if (syncBtn) {
        syncBtn.innerText = d.delaySync ? 'SYNC ON' : 'SYNC';
        syncBtn.style.background = d.delaySync ? '#fff' : '';
        syncBtn.style.color = d.delaySync ? '#000' : '';
    }
    const noteSel = byId(x + '-delay-note');
    if (noteSel) noteSel.value = d.delayNote;
    const ftBtn = byId(x + '-filter-type');
    if (ftBtn) {
        const labels = { lowpass: 'LP', highpass: 'HP', bandpass: 'BP', notch: 'NT' };
        ftBtn.innerText = labels[d.nodes.filter.type] || 'LP';
    }
    setStatus(x, 'PRESET LOADED: ' + name.toUpperCase());
}

// ============================================================
//  DECK CLONE / SWAP
// ============================================================
function cloneDeck(src, dst) {
    const s = dj.decks[src];
    const d = dj.decks[dst];
    if (!s || !d) return;
    if (s.mode === 'audio' && s.buffer) {
        d.buffer = s.buffer;
        d.peaks = s.peaks;
        d.dur = s.dur;
        d.bpm = s.bpm;
        d.bpmSource = s.bpmSource;
        d.title = s.title + ' (CLONE)';
        d.mode = 'audio';
        d.hot = [null, null, null];
        d.loopIn = 0;
        d.loopOut = d.dur;
        d.loopOn = false;
        d.offset = 0;
        d.pitch = 0;
        d.syncRate = 1;
        d.rate = 1;
        d.playing = false;
        stopSource(d);
        if (d.nodes) {
            d.nodes.low.gain.value = s.nodes.low.gain.value;
            d.nodes.mid.gain.value = s.nodes.mid.gain.value;
            d.nodes.high.gain.value = s.nodes.high.gain.value;
            d.nodes.filter.frequency.value = s.nodes.filter.frequency.value;
            d.nodes.filter.Q.value = s.nodes.filter.Q.value;
            d.nodes.filter.type = s.nodes.filter.type;
            d.nodes.panner.pan.value = s.nodes.panner.pan.value;
            d.nodes.delayMix.gain.value = s.nodes.delayMix.gain.value;
            d.nodes.delayFb.gain.value = s.nodes.delayFb.gain.value;
            d.nodes.reverbSend.gain.value = s.nodes.reverbSend.gain.value;
            d.nodes.distortion.curve = s.nodes.distortion.curve;
            d.nodes.bitcrusher.curve = s.nodes.bitcrusher.curve;
            d.nodes.flangerDepth.gain.value = s.nodes.flangerDepth.gain.value;
        }
        d.pan = s.pan;
        d.delayTime = s.delayTime;
        d.delayFb = s.delayFb;
        d.reverbMix = s.reverbMix;
        d.distortion = s.distortion;
        d.bitcrush = s.bitcrush;
        d.flanger = s.flanger;
        d.delaySync = s.delaySync;
        d.delayNote = s.delayNote;
        d.filterRes = s.filterRes;
        updateDeckUI(dst);
        setStatus(dst, 'CLONED FROM ' + src.toUpperCase());
    } else if (s.mode === 'yt') {
        startYt(dst, s.title.replace('YT: ', ''));
        setStatus(dst, 'YT CLONE FROM ' + src.toUpperCase());
    }
}

function swapDecks() {
    const tempBpm = dj.decks.a.bpm;
    dj.decks.a.bpm = dj.decks.b.bpm;
    dj.decks.b.bpm = tempBpm;
    const tempTitle = dj.decks.a.title;
    dj.decks.a.title = dj.decks.b.title;
    dj.decks.b.title = tempTitle;
    updateDeckUI('a');
    updateDeckUI('b');
    updateMasterBpm();
    setStatus('a', 'SWAPPED');
    setStatus('b', 'SWAPPED');
}

// ============================================================
//  RECORDING / SAMPLE GRAB
// ============================================================
let recording = false;
let mediaRecorder = null;
let recordedChunks = [];

function toggleRecord() {
    if (recording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!dj.ctx) { ensureCtx(); }
    const dest = dj.ctx.createMediaStreamDestination();
    dj.ctx.masterAnalyser.connect(dest);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(dest.stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = byId('a-url');
        if (a) a.value = url;
        setStatus('a', 'RECORDED — URL LOADED IN DECK A');
        dj.ctx.masterAnalyser.disconnect(dest);
    };
    mediaRecorder.start();
    recording = true;
    const btn = byId('dj-record');
    if (btn) { btn.innerText = 'STOP'; btn.style.background = '#ff3355'; btn.style.color = '#fff'; }
    setStatus('a', 'RECORDING...');
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    recording = false;
    const btn = byId('dj-record');
    if (btn) { btn.innerText = 'REC'; btn.style.background = ''; btn.style.color = ''; }
}

function resizeWaves() {
    ['a', 'b'].forEach((x) => {
        const cv = byId(x + '-wave');
        if (cv && cv.width) drawWave(x, true);
        const sp = byId(x + '-spectrum');
        if (sp && sp.width) drawSpectrum(x);
    });
}

function mountDJMixer() {
    buildDJApp();
    dj.alive = true;
    setMaster6(dj.syncMaster);
    resizeWaves();
    if (!dj.raf) dj.raf = requestAnimationFrame(engineTick);
    loadFromHash();
    // only load YT API lazily when it is first needed
}

function unmountDJMixer() {
    dj.alive = false;
    if (dj.raf) cancelAnimationFrame(dj.raf);
    dj.raf = null;
    rackStop();
}

// Plain-name aliases for v6.html page handlers.
function loadDeck(x) { loadDeck6(x); }
function togglePlay(x) { togglePlay6(x); }
function cueDeck(x) { cueDeck6(x); }
function editBPM(x) { editBPM6(x); }
function syncBPM() { syncBPM6(); }
function playBoth() { playBoth6(); }
function pauseBoth() { pauseBoth6(); }
function stopAll() { stopAll6(); }
function openLRCModal() { openLRCModal6(); }
function closeLRCModal() { closeLRCModal6(); }
function applyLRC() { applyLRC6(); }

function loadDeck6(x) {
    const hasFile = byId(x + '-file') && byId(x + '-file').files.length;
    const url = byId(x + '-url') ? byId(x + '-url').value.trim() : '';
    const ytId = byId(x + '-yt') ? byId(x + '-yt').value.trim() : '';
    if (hasFile) loadFile6(x);
    else if (url) loadUrl6(x);
    else if (ytId) loadYt6(x);
    else setStatus(x, 'GET FILE / URL / YT ID');
}

if (byId('dj-app') && !byId('app-dj-mixer')) {
    window.addEventListener('DOMContentLoaded', () => mountDJMixer());
}