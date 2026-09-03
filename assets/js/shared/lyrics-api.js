const LYRICS_API = 'https://api.lyrics.ovh/v1';
let backendAvailable = false;

export async function detectBackend() {
  try {
    const resp = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
    backendAvailable = resp.ok;
  } catch (e) {
    backendAvailable = false;
  }
}

export async function fetchLyrics(artist, title) {
  const url = `${LYRICS_API}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.lyrics) return data.lyrics;
    return null;
  } catch (e) {
    return null;
  }
}

export async function generateLRC(lyrics, duration) {
  if (backendAvailable) {
    try {
      const resp = await fetch('/api/lrc/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics, duration: duration || 30 })
      });
      const data = await resp.json();
      if (data.lrc && data.lrc.length > 0) return data.lrc;
    } catch (e) {}
  }
  return null;
}

export function exportLRC(lrcData) {
  const text = lrcData.map((l) => {
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

export function copyLRC(lrcData) {
  const text = lrcData.map((l) => {
    const m = Math.floor(l.time / 60);
    const s = l.time % 60;
    return '[' + String(m).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0') + '.' +
      String(Math.floor((s % 1) * 100)).padStart(2, '0') + ']' + l.text;
  }).join('\n');
  navigator.clipboard.writeText(text);
}

export function shareURL(lrcData) {
  const text = lrcData.map((l) => {
    const m = Math.floor(l.time / 60);
    const s = l.time % 60;
    return '[' + String(m).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0') + '.' +
      String(Math.floor((s % 1) * 100)).padStart(2, '0') + ']' + l.text;
  }).join('\n');
  const encoded = btoa(unescape(encodeURIComponent(text)));
  const url = window.location.origin + window.location.pathname + '#' + encoded;
  navigator.clipboard.writeText(url);
}
