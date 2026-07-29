// ============================================================
//  APP — Main Controller, DOM Refs, Event Handlers
// ============================================================

let backendAvailable = false;

// --- DOM REFS ---
const lyricsText = document.getElementById('lyrics-text');
const dialDisplay = document.getElementById('dial-display');
const tuner = document.getElementById('tuner');
const statusEl = document.getElementById('status');
const timeDisplay = document.getElementById('time-display');
const progressFill = document.getElementById('progress-fill');
const canvas = document.getElementById('oscilloscope');
const canvasCtx = canvas.getContext('2d');
const lrcTextarea = document.getElementById('lrc-textarea');
const lrcModal = document.getElementById('lrc-modal');

// --- STATE ---
let speechSynth = window.speechSynthesis;

// ============================================================
//  BACKEND DETECTION
// ============================================================
async function detectBackend() {
    try {
        const resp = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
        backendAvailable = resp.ok;
    } catch(e) {
        backendAvailable = false;
    }
}

function lyricsApiUrl(artist, title) {
    if (backendAvailable) {
        return `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    }
    return `https://api.lyrics.ovh/v1/${artist}/${title}`;
}

function previewApiUrl(artist, title) {
    if (backendAvailable) {
        return `/api/preview?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    }
    return `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`;
}

function audioProxyUrl(url) {
    if (backendAvailable) {
        return `/api/audio/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
}

// ============================================================
//  MAIN ACTIONS
// ============================================================
async function fetchAndPlay() {
    if (parseInt(tuner.value) <= 1040) {
        lyricsText.innerHTML = '<span style="color:#ff0000;">> TUNE RADIO ABOVE 104.0 FM FIRST!</span>';
        return;
    }

    initAudio();
    stopAllAudio();
    if (speechSynth.speaking) speechSynth.cancel();

    const artist = document.getElementById('artist').value.trim();
    const title = document.getElementById('title').value.trim();
    if(!artist || !title) return;

    document.getElementById('fetch-btn').disabled = true;
    statusEl.innerText = "STATUS: SCANNING FREQUENCIES...";
    lyricsText.innerHTML = '<span class="loading">> FETCHING LYRICS & PREVIEW...</span>';

    try {
        const lyricRes = await fetch(lyricsApiUrl(artist, title));
        const lyricData = await lyricRes.json();

        if(lyricData.error || !lyricData.lyrics) {
            lyricsText.innerHTML = '<span style="color:#ff0000;">> LYRICS NOT FOUND</span>';
            document.getElementById('fetch-btn').disabled = false;
            return;
        }

        const itunesRes = await fetch(previewApiUrl(artist, title));
        const itunesData = await itunesRes.json();

        if(!itunesData.results || !itunesData.results[0].previewUrl) {
            lyricsText.innerHTML = '<span style="color:#ff0000;">> AUDIO PREVIEW NOT FOUND</span>';
            document.getElementById('fetch-btn').disabled = false;
            return;
        }

        let previewUrl = itunesData.results[0].previewUrl;
        if (backendAvailable) {
            previewUrl = previewUrl.replace(/^https:\/\//, '/api/audio/proxy?url=');
        }

        statusEl.innerText = "STATUS: SIGNAL LOCKED";

        if (lrcData.length === 0) {
            // If backend is available, use server-side LRC generation for better accuracy
            if (backendAvailable) {
                try {
                    const lrcRes = await fetch('/api/lrc/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lyrics: lyricData.lyrics, duration: 30 })
                    });
                    const lrcResult = await lrcRes.json();
                    if (lrcResult.lrc && lrcResult.lrc.length > 0) {
                        lrcData = lrcResult.lrc;
                        renderLRC(lrcData);
                    } else {
                        // Backend returned empty LRC — fall back to client-side timer spacing
                        statusEl.innerText = 'STATUS: Backend LRC empty, using timer sync';
                        const plainLines = lyricData.lyrics.split('\n').filter(l => l.trim());
                        const totalDuration = 30;
                        const interval = totalDuration / plainLines.length;
                        lrcData = plainLines.map((text, i) => ({
                            time: i * interval,
                            text: text.trim()
                        }));
                        renderLRC(lrcData);
                    }
                } catch(e) {
                    // Backend LRC generation call failed — fall back to client-side timer spacing
                    statusEl.innerText = 'STATUS: Backend LRC gen failed, using timer sync';
                    const plainLines = lyricData.lyrics.split('\n').filter(l => l.trim());
                    const totalDuration = 30;
                    const interval = totalDuration / plainLines.length;
                    lrcData = plainLines.map((text, i) => ({
                        time: i * interval,
                        text: text.trim()
                    }));
                    renderLRC(lrcData);
                }
            } else {
                // No backend available — use client-side timer spacing
                const plainLines = lyricData.lyrics.split('\n').filter(l => l.trim());
                const totalDuration = 30;
                const interval = totalDuration / plainLines.length;
                lrcData = plainLines.map((text, i) => ({
                    time: i * interval,
                    text: text.trim()
                }));
                renderLRC(lrcData);
            }
        }

        playAudio(previewUrl, null);
        document.getElementById('fetch-btn').disabled = false;

    } catch (err) {
        lyricsText.innerHTML = '<span style="color:#ff0000;">> NETWORK ERROR</span>';
        document.getElementById('fetch-btn').disabled = false;
    }
}

function playFromURL() {
    const url = document.getElementById('audio-url').value.trim();
    if (!url) return;

    const ytRegex = /^[a-zA-Z0-9_-]{11}$/;
    if (ytRegex.test(url)) {
        statusEl.innerText = "STATUS: YT DETECTED (AUDIO ONLY)";
        lyricsText.innerHTML = '<span class="loading">> YOUTUBE AUDIO requires iframe API. Use direct MP3 URL for LRC sync.</span>';
        return;
    }

    if (lrcData.length === 0) {
        lyricsText.innerHTML = '<span style="color:#ff0000;">> No LRC data loaded. Press LRC to paste timestamped lyrics first.</span>';
        return;
    }

    const proxiedUrl = audioProxyUrl(url);
    playAudio(proxiedUrl, null);
    statusEl.innerText = "STATUS: STREAMING FROM URL";
}

// ============================================================
//  LRC EDITOR MODAL
// ============================================================
function openLRCEditor() {
    if (lrcData.length > 0) {
        lrcTextarea.value = lrcData.map(l => {
            const mins = Math.floor(l.time / 60);
            const secs = l.time % 60;
            const mm = String(mins).padStart(2, '0');
            const ss = String(Math.floor(secs)).padStart(2, '0');
            const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
            return `[${mm}:${ss}.${xx}]${l.text}`;
        }).join('\n');
    } else {
        lrcTextarea.value = `[00:04.50]Ticking away the moments that make up a dull day
[00:08.00]Fritter and waste the hours in an offhand way
[00:12.00]Kicking around on a piece of ground in your hometown
[00:16.00]Waiting for someone or something to show you the way`;
    }
    lrcModal.classList.add('open');
}

function closeLRCEditor() {
    lrcModal.classList.remove('open');
}

function applyLRC() {
    const text = lrcTextarea.value.trim();
    if (!text) {
        lrcData = [];
        renderLRC([]);
        closeLRCEditor();
        return;
    }

    const parsed = parseLRC(text);
    if (parsed.length === 0) {
        const lines = text.split('\n').filter(l => l.trim());
        const interval = 3;
        lrcData = lines.map((line, i) => ({
            time: i * interval,
            text: line.trim()
        }));
    } else {
        lrcData = parsed;
    }

    renderLRC(lrcData);
    statusEl.innerText = `STATUS: LRC LOADED (${lrcData.length} lines)`;
    closeLRCEditor();
}

// ============================================================
//  UTILITIES
// ============================================================
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================
//  CLOCK
// ============================================================
function updateClock() {
    const d = new Date();
    document.getElementById('clock').innerText = d.toLocaleTimeString('en-US', {hour12: false});
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
//  RESIZE HANDLER
// ============================================================
window.addEventListener('resize', () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
});

// ============================================================
//  KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lrcModal.classList.contains('open')) {
        closeLRCEditor();
    }
});

// ============================================================
//  INIT
// ============================================================
console.log("PHANTOM SIGNAL v5 — LRC SYNC ENGINE INITIALIZED");
console.log("Tip: Press LRC to paste timestamped lyrics, then LOAD a track.");
detectBackend();
drawOscilloscope();