// APP 2: RETRO v2
let beatTimer2 = null, audioCtx2 = null, reelState2 = 0, beatCounter2 = 0;
const reels2 = ['O','0','@','0'];
const blocks2 = " ▁▂▃▄▅▆▇█";

function sleep2(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function playChiptune2() {
    if (!audioCtx2) audioCtx2 = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx2.createOscillator();
    const gain = audioCtx2.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx2.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx2.currentTime + 0.1);
    gain.gain.setValueAtTime(0.6, audioCtx2.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx2.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx2.destination);
    osc.start(); osc.stop(audioCtx2.currentTime + 0.1);
    if (beatCounter2 % 2 === 0) {
        const bass = audioCtx2.createOscillator();
        const bg = audioCtx2.createGain();
        const notes = [110, 146.83, 164.81, 130.81];
        const note = notes[Math.floor(beatCounter2 / 2) % notes.length];
        bass.type = 'square';
        bass.frequency.setValueAtTime(note, audioCtx2.currentTime);
        bg.gain.setValueAtTime(0.2, audioCtx2.currentTime);
        bg.gain.exponentialRampToValueAtTime(0.001, audioCtx2.currentTime + 0.2);
        bass.connect(bg); bg.connect(audioCtx2.destination);
        bass.start(); bass.stop(audioCtx2.currentTime + 0.2);
    }
}
function updateViz2() {
    reelState2 = (reelState2 + 1) % reels2.length;
    const r = reels2[reelState2];
    const tape = Math.random() > 0.5 ? '▓' : '▒';
    const cassetteEl = document.getElementById('cassette-v2');
    if (cassetteEl) cassetteEl.innerText = '  ┌───────────────┐\n  │  (' + r + ')=====(' + r + ')  │\n  │   ' + tape + tape + tape + tape + tape + tape + tape + tape + tape + '   │\n  └───────────────┘';
    const spec = document.getElementById('spectrum');
    if (spec) {
        spec.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const bar = document.createElement('span');
            bar.innerText = blocks2[Math.floor(Math.random() * 8)];
            bar.style.width = '10px';
            bar.style.textAlign = 'center';
            bar.style.transition = 'height 0.05s linear';
            spec.appendChild(bar);
            spec.appendChild(spec.children[14 - i].cloneNode(true));
        }
    }
}
async function startV2() {
    stopV2();
    const artist = prompt('ARTIST:');
    const title = prompt('TITLE:');
    const bpm = parseInt(prompt('BPM:', '130')) || 130;
    if (!artist || !title) return;
    const ms = 60000 / bpm;
    beatTimer2 = setInterval(() => { updateViz2(); playChiptune2(); beatCounter2++; }, ms);
    const labelEl = document.getElementById('tape-label-v2');
    if (labelEl) labelEl.innerText = artist.toUpperCase().substring(0, 15);
    const lyricsEl = document.getElementById('v2-lyrics');
    if (lyricsEl) lyricsEl.innerHTML = '<span class="crt-loading">> QUERYING DATABASE...</span>';
    try {
        const res = await fetch('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title));
        const data = await res.json();
        if (data.lyrics) {
            const lines = data.lyrics.split('\n');
            if (lyricsEl) lyricsEl.innerHTML = '';
            for (const line of lines) {
                const span = document.createElement('span');
                span.innerHTML = line + '<br>';
                if (lyricsEl) lyricsEl.appendChild(span);
                await sleep2(ms / 2);
            }
        } else {
            if (lyricsEl) lyricsEl.innerHTML = '> TRACK NOT FOUND';
        }
    } catch(e) { if (lyricsEl) lyricsEl.innerHTML = '> NETWORK ERROR'; }
}
function stopV2() { if (beatTimer2) clearInterval(beatTimer2); beatTimer2 = null; beatCounter2 = 0; }

function mountRetroV2() {
    const el = document.getElementById('v2-lyrics');
    if (el && !el._bound) { el.addEventListener('click', startV2); el._bound = true; }
}
function unmountRetroV2() {
    stopV2();
    const el = document.getElementById('v2-lyrics');
    if (el) { el.removeEventListener('click', startV2); el._bound = false; }
}