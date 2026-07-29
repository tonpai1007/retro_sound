// APP 1: RETRO CRT v1
let beatTimer1 = null, audioCtx1 = null, reelState1 = 0;
const reels1 = ['O','0','@','0'];
const sleep1 = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function playBeat1() {
    if (!audioCtx1) audioCtx1 = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx1.createOscillator();
    const gain = audioCtx1.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx1.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx1.currentTime + 0.1);
    gain.gain.setValueAtTime(0.8, audioCtx1.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx1.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx1.destination);
    osc.start(); osc.stop(audioCtx1.currentTime + 0.1);
}
function updateCassette1() {
    reelState1 = (reelState1 + 1) % reels1.length;
    const r = reels1[reelState1];
    const tape = Math.random() > 0.5 ? '▓' : '▒';
    const el = document.getElementById('cassette');
    if (el) el.innerText = `  ┌───────────────┐\n  │  (${r})=====(${r})  │\n  │   ${tape}${tape}${tape}${tape}${tape}${tape}${tape}${tape}${tape}   │\n  └───────────────┘`;
}
async function startCrt1() {
    stopCrt1();
    const artist = prompt('ARTIST:');
    const title = prompt('TITLE:');
    const bpm = parseInt(prompt('BPM:', '120')) || 120;
    if (!artist || !title) return;
    const ms = 60000 / bpm;
    beatTimer1 = setInterval(() => { updateCassette1(); playBeat1(); }, ms);
    const lyricsEl = document.getElementById('crt1-lyrics');
    if (lyricsEl) lyricsEl.innerHTML = '<span class="crt-loading">> LOADING...</span>';
    try {
        const res = await fetch(`/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (data.lyrics) {
            const lines = data.lyrics.split('\n');
            if (lyricsEl) lyricsEl.innerHTML = '';
            for (const line of lines) {
                const span = document.createElement('span');
                span.innerHTML = line + '<br>';
                if (lyricsEl) lyricsEl.appendChild(span);
                await sleep1(ms / 2);
            }
        } else {
            if (lyricsEl) lyricsEl.innerHTML = '> LYRICS NOT FOUND';
        }
    } catch(e) { if (lyricsEl) lyricsEl.innerHTML = '> NETWORK ERROR'; }
}
function stopCrt1() { if (beatTimer1) clearInterval(beatTimer1); beatTimer1 = null; }
function mountRetroCrt() {
    const el = document.getElementById('crt1-lyrics');
    if (el) el.addEventListener('click', startCrt1);
}
function unmountRetroCrt() {
    stopCrt1();
}