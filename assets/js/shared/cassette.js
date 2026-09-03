const reels = ['O', '0', '@', '0'];
const blocks = " ▁▂▃▄▅▆▇█";

export function updateCassette(elId, tapeId) {
  const state = window._cassetteState || (window._cassetteState = { idx: 0 });
  state.idx = (state.idx + 1) % reels.length;
  const r = reels[state.idx];
  const tape = Math.random() > 0.5 ? '▓' : '▒';
  const cassetteEl = document.getElementById(elId);
  if (cassetteEl) {
    cassetteEl.innerText = `  ┌───────────────┐\n  │  (${r})=====(${r})  │\n  │   ${tape}${tape}${tape}${tape}${tape}${tape}${tape}${tape}${tape}   │\n  └───────────────┘`;
  }
  if (tapeId) {
    const tapeEl = document.getElementById(tapeId);
    if (tapeEl) tapeEl.innerText = tape.repeat(9);
  }
}

export function updateSpectrum(elId) {
  const spec = document.getElementById(elId);
  if (!spec) return;
  spec.innerHTML = '';
  for (let i = 0; i < 15; i++) {
    const bar = document.createElement('span');
    bar.innerText = blocks[Math.floor(Math.random() * 8)];
    bar.style.width = '10px';
    bar.style.textAlign = 'center';
    bar.style.transition = 'height 0.05s linear';
    spec.appendChild(bar);
    spec.appendChild(spec.children[14 - i].cloneNode(true));
  }
}

export function playBeep(audioCtx, freq = 150, decay = 0.1, vol = 0.8) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + decay);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + decay);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + decay);
}

export function playChiptuneBeat(audioCtx, beatCounter) {
  playBeep(audioCtx, 150, 0.1, 0.6);
  if (beatCounter % 2 === 0) {
    const bass = audioCtx.createOscillator();
    const bg = audioCtx.createGain();
    const notes = [110, 146.83, 164.81, 130.81];
    const note = notes[Math.floor(beatCounter / 2) % notes.length];
    bass.type = 'square';
    bass.frequency.setValueAtTime(note, audioCtx.currentTime);
    bg.gain.setValueAtTime(0.2, audioCtx.currentTime);
    bg.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    bass.connect(bg);
    bg.connect(audioCtx.destination);
    bass.start();
    bass.stop(audioCtx.currentTime + 0.2);
  }
}
