// APP 7: DJ MIXER v6
let ytReady, ytPlayerA, ytPlayerB, decks, xfader, statusEl;
let lrcData = [];
let lrcLineElements = [];
let lrcSyncRAF = null;
let lrcActive = false;
let currentApp = 'dj-mixer';

function initDJMixer() {
    ytReady = false;
    ytPlayerA = null;
    ytPlayerB = null;
    decks = { a: { bpm: 0, playing: false, loaded: false, title: '' }, b: { bpm: 0, playing: false, loaded: false, title: '' } };
    xfader = document.getElementById('xfader');
    statusEl = document.getElementById('status');
    lrcData = [];
    lrcLineElements = [];
    lrcActive = false;
}

function onYouTubeIframeAPIReady() {
    ytReady = true;
    ytPlayerA = new YT.Player('a-yt-container', {
        height: '1', width: '1',
        videoId: '',
        playerVars: { 'autoplay': 0, 'controls': 0, 'disablekb': 1 },
        events: { 'onReady': () => updateYTStatus('a', 'READY'), 'onStateChange': (e) => onYTState('a', e) }
    });
    ytPlayerB = new YT.Player('b-yt-container', {
        height: '1', width: '1',
        videoId: '',
        playerVars: { 'autoplay': 0, 'controls': 0, 'disablekb': 1 },
        events: { 'onReady': () => updateYTStatus('b', 'READY'), 'onStateChange': (e) => onYTState('b', e) }
    });
}

function updateYTStatus(deck, msg) {
    const el = document.getElementById(deck + '-yt-status');
    if (el) el.innerText = 'YT PLAYER: ' + msg;
}

function onYTState(deck, event) {
    const playBtn = document.getElementById(deck + '-play');
    if (event.data == YT.PlayerState.PLAYING) {
        if (playBtn) playBtn.innerText = 'PAUSE';
        decks[deck].playing = true;
    } else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.ENDED) {
        if (playBtn) playBtn.innerText = 'PLAY';
        decks[deck].playing = false;
    }
}

function loadDeck(deck) {
    const player = deck === 'a' ? ytPlayerA : ytPlayerB;
    const ytId = document.getElementById(deck + '-ytid').value.trim();
    if (!player || !ytReady || !ytId) return;
    player.loadVideoById(ytId);
    player.setVolume(80);
    decks[deck].loaded = true;
    decks[deck].title = ytId;
    const titleEl = document.getElementById(deck + '-title-display');
    if (titleEl) titleEl.innerText = 'LOADING: ' + ytId;
    if (statusEl) statusEl.innerText = 'DECK ' + deck.toUpperCase() + ' LOADED';
}

function togglePlay(deck) {
    const player = deck === 'a' ? ytPlayerA : ytPlayerB;
    if (!player || !player.getPlayerState) return;
    player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo();
}

function cueDeck(deck) {
    const player = deck === 'a' ? ytPlayerA : ytPlayerB;
    if (!player || !player.getPlayerState) return;
    player.pauseVideo();
    player.seekTo(0, true);
    if (statusEl) statusEl.innerText = 'DECK ' + deck.toUpperCase() + ' CUED';
}

function playBoth() {
    ['a','b'].forEach(d => {
        const player = d === 'a' ? ytPlayerA : ytPlayerB;
        if (player && decks[d].loaded) player.playVideo();
    });
    if (statusEl) statusEl.innerText = 'PLAYING BOTH';
}

function pauseBoth() {
    ['a','b'].forEach(d => {
        const player = d === 'a' ? ytPlayerA : ytPlayerB;
        if (player && decks[d].loaded) player.pauseVideo();
    });
    if (statusEl) statusEl.innerText = 'PAUSED';
}

function stopAll() {
    ['a','b'].forEach(d => {
        const player = d === 'a' ? ytPlayerA : ytPlayerB;
        if (!player) return;
        try { player.pauseVideo(); } catch(e){}
        try { player.seekTo(0, true); } catch(e){}
        decks[d].playing = false;
        decks[d].loaded = false;
        decks[d].title = '';
        const playBtn = document.getElementById(d + '-play');
        if (playBtn) playBtn.innerText = 'PLAY';
        const timeEl = document.getElementById(d + '-time');
        if (timeEl) timeEl.innerText = '00:00 / 00:00';
        const titleEl = document.getElementById(d + '-title-display');
        if (titleEl) titleEl.innerText = 'NO TRACK LOADED';
    });
    const xf = document.getElementById('xfader');
    if (xf) xf.value = 50;
    const xfDisplay = document.getElementById('xfader-display');
    if (xfDisplay) xfDisplay.innerText = 'A 1.00 | B 1.00';
    if (statusEl) statusEl.innerText = 'ALL STOPPED';
}

function editBPM(deck) {
    const input = prompt('Set BPM for Deck ' + deck.toUpperCase() + ':', decks[deck].bpm || '');
    if (input === null) return;
    const bpm = parseInt(input);
    if (isNaN(bpm) || bpm < 40 || bpm > 300) { alert('BPM must be 40-300'); return; }
    decks[deck].bpm = bpm;
    const bpmEl = document.getElementById(deck + '-bpm');
    if (bpmEl) bpmEl.innerText = bpm + ' BPM';
}

function syncBPM() {
    const aBpm = parseInt(prompt('Deck A BPM:', decks.a.bpm || ''));
    const bBpm = parseInt(prompt('Deck B BPM:', decks.b.bpm || ''));
    if (isNaN(aBpm) || isNaN(bBpm)) return;
    decks.a.bpm = aBpm; decks.b.bpm = bBpm;
    const aEl = document.getElementById('a-bpm');
    const bEl = document.getElementById('b-bpm');
    if (aEl) aEl.innerText = aBpm + ' BPM';
    if (bEl) bEl.innerText = bBpm + ' BPM';
}

// LRC SYNC
function updateDeckTime(deck) {
    const player = deck === 'a' ? ytPlayerA : ytPlayerB;
    const el = document.getElementById(deck + '-time');
    if (!player || !player.getCurrentTime || !decks[deck].loaded) {
        if (el) el.innerText = '00:00 / 00:00';
        return;
    }
    const cur = player.getCurrentTime() || 0;
    const dur = player.getDuration() || 0;
    const fmt = (s) => { const m = Math.floor(s/60); const sec = Math.floor(s%60); return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0'); };
    if (el) el.innerText = fmt(cur) + ' / ' + fmt(dur);
}

function genWaveform(deck) {
    const container = document.getElementById(deck + '-waveform');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 40; i++) {
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.height = (Math.random() * 80 + 20) + '%';
        bar.style.width = '3px';
        bar.style.background = 'currentColor';
        bar.style.transition = 'height 0.05s';
        bar.style.opacity = '0.7';
        container.appendChild(bar);
    }
}

function animWaveform() {
    ['a','b'].forEach(deck => {
        const bars = document.getElementById(deck + '-waveform');
        if (!bars) return;
        const children = bars.children;
        for (let i = 0; i < children.length; i++) {
            children[i].style.height = decks[deck].playing ? (Math.random() * 60 + 20) + '%' : (Math.random() * 15 + 10) + '%';
            children[i].style.opacity = decks[deck].playing ? (Math.random() * 0.5 + 0.5) : '0.3';
        }
        updateDeckTime(deck);
    });
    if (lrcActive) {
        const xfVal = xfader ? parseInt(xfader.value) : 50;
        const aWeight = xfVal <= 50 ? 1 : (100 - xfVal) / 50;
        const bWeight = xfVal >= 50 ? 1 : xfVal / 50;
        let player = null;
        if (decks.a.playing && aWeight >= bWeight && decks.a.loaded && ytPlayerA && ytPlayerA.getCurrentTime) {
            player = ytPlayerA;
        } else if (decks.b.playing && decks.b.loaded && ytPlayerB && ytPlayerB.getCurrentTime) {
            player = ytPlayerB;
        } else if (decks.a.playing && decks.a.loaded && ytPlayerA && ytPlayerA.getCurrentTime) {
            player = ytPlayerA;
        } else if (decks.b.playing && decks.b.loaded && ytPlayerB && ytPlayerB.getCurrentTime) {
            player = ytPlayerB;
        }
        if (player && lrcData.length > 0 && lrcLineElements.length > 0) {
            const cur = player.getCurrentTime() || 0;
            let activeIndex = -1;
            for (let i = lrcData.length - 1; i >= 0; i--) {
                if (cur >= lrcData[i].time) { activeIndex = i; break; }
            }
            lrcLineElements.forEach((el, idx) => {
                el.classList.remove('active', 'sung');
                if (idx < activeIndex) el.classList.add('sung');
                else if (idx === activeIndex) el.classList.add('active');
            });
        }
    }
    requestAnimationFrame(animWaveform);
}

// Crossfader
function setupCrossfader() {
    const xf = document.getElementById('xfader');
    if (!xf) return;
    xf.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        const aVol = v <= 50 ? 1 : (100 - v) / 50;
        const bVol = v >= 50 ? 1 : v / 50;
        const display = document.getElementById('xfader-display');
        if (display) display.innerText = 'A ' + aVol.toFixed(2) + ' | B ' + bVol.toFixed(2);
        if (ytPlayerA && ytPlayerA.setVolume) ytPlayerA.setVolume(aVol * 100);
        if (ytPlayerB && ytPlayerB.setVolume) ytPlayerB.setVolume(bVol * 100);
    });
}

// Share / Export
function exportLRC() {
    if (lrcData.length === 0) { if (statusEl) statusEl.innerText = 'STATUS: No lyrics to export'; return; }
    const lrcText = lrcData.map(l => {
        const mins = Math.floor(l.time / 60);
        const secs = l.time % 60;
        const mm = String(mins).padStart(2, '0');
        const ss = String(Math.floor(secs)).padStart(2, '0');
        const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
        return '[' + mm + ':' + ss + '.' + xx + ']' + l.text;
    }).join('\n');
    const blob = new Blob([lrcText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lyrics.lrc';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (statusEl) statusEl.innerText = 'STATUS: EXPORTED ' + lrcData.length + ' lines';
}

function copyLRC() {
    if (lrcData.length === 0) { if (statusEl) statusEl.innerText = 'STATUS: No lyrics to copy'; return; }
    const lrcText = lrcData.map(l => {
        const mins = Math.floor(l.time / 60);
        const secs = l.time % 60;
        const mm = String(mins).padStart(2, '0');
        const ss = String(Math.floor(secs)).padStart(2, '0');
        const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
        return '[' + mm + ':' + ss + '.' + xx + ']' + l.text;
    }).join('\n');
    navigator.clipboard.writeText(lrcText).then(() => {
        if (statusEl) statusEl.innerText = 'STATUS: COPIED TO CLIPBOARD';
    }).catch(() => {
        if (statusEl) statusEl.innerText = 'STATUS: COPY FAILED';
    });
}

function shareURL() {
    if (lrcData.length === 0) { if (statusEl) statusEl.innerText = 'STATUS: No lyrics to share'; return; }
    const lrcText = lrcData.map(l => {
        const mins = Math.floor(l.time / 60);
        const secs = l.time % 60;
        const mm = String(mins).padStart(2, '0');
        const ss = String(Math.floor(secs)).padStart(2, '0');
        const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
        return '[' + mm + ':' + ss + '.' + xx + ']' + l.text;
    }).join('\n');
    const encoded = btoa(unescape(encodeURIComponent(lrcText)));
    const url = window.location.origin + window.location.pathname + '#' + encoded;
    navigator.clipboard.writeText(url).then(() => {
        if (statusEl) statusEl.innerText = 'STATUS: SHARE LINK COPIED';
    }).catch(() => {
        window.location.hash = encoded;
        if (statusEl) statusEl.innerText = 'STATUS: LINK GENERATED';
    });
}

function loadFromHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return false;
    try {
        const lrcText = decodeURIComponent(escape(atob(hash)));
        const lineRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;
        const parsed = [];
        for (const line of lrcText.split('\n')) {
            const match = line.match(lineRegex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                let millis = parseInt(match[3]);
                if (match[3].length === 2) millis *= 10;
                const time = minutes * 60 + seconds + millis / 1000;
                const text = match[4].trim();
                if (text) parsed.push({ time, text });
            }
        }
        if (parsed.length > 0) {
            lrcData = parsed;
            if (statusEl) statusEl.innerText = 'STATUS: LRC LOADED FROM LINK (' + parsed.length + ' lines)';
            return true;
        }
    } catch(e) {}
    return false;
}

// Mount/Unmount
function mountDJMixer() {
    initDJMixer();
    genWaveform('a');
    genWaveform('b');
    setupCrossfader();
    animWaveform();
    loadFromHash();

    // Keyboard shortcuts
    document.addEventListener('keydown', onDJKeydown);

    // YouTube API loader
    if (!window.ytLoaded) {
        window.ytLoaded = true;
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = function() {
            onYouTubeIframeAPIReady();
        };
    } else if (ytReady) {
        onYouTubeIframeAPIReady();
    }
}

function onDJKeydown(e) {
    if (e.ctrlKey && e.key === '1') { e.preventDefault(); togglePlay('a'); }
    if (e.ctrlKey && e.key === '2') { e.preventDefault(); togglePlay('b'); }
    if (e.ctrlKey && e.key === ' ') { e.preventDefault(); playBoth(); }
}

function unmountDJMixer() {
    document.removeEventListener('keydown', onDJKeydown);
    if (lrcSyncRAF) cancelAnimationFrame(lrcSyncRAF);
    lrcActive = false;
}