// ============================================================
//  LRC ENGINE — Parsing, Rendering, Sync Loop
// ============================================================

let lrcData = [];
let lrcActive = false;
let lrcLineElements = [];

function parseLRC(lrcText) {
    const lines = lrcText.split('\n');
    const parsed = [];
    const lineRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;

    for (const line of lines) {
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

    parsed.sort((a, b) => a.time - b.time);
    return parsed;
}

function renderLRC(lines) {
    lyricsText.innerHTML = '';
    lrcLineElements = [];

    if (!lines || lines.length === 0) {
        lyricsText.innerHTML = '> NO LRC DATA LOADED';
        return;
    }

    lines.forEach((line, index) => {
        const div = document.createElement('div');
        div.className = 'lrc-line';
        div.dataset.index = index;

        const words = line.text.split(' ');
        words.forEach((word, wi) => {
            const span = document.createElement('span');
            span.className = 'word';
            span.innerText = word + ' ';
            div.appendChild(span);
        });

        lyricsText.appendChild(div);
        lrcLineElements.push(div);
    });
}

function startSyncLoop() {
    if (syncRAF) cancelAnimationFrame(syncRAF);
    lrcActive = true;

    function syncLoop() {
        if (!currentAudio || !lrcActive || !isPlaying) {
            syncRAF = requestAnimationFrame(syncLoop);
            return;
        }

        const currentTime = currentAudio.currentTime;
        const duration = audioDuration || currentAudio.duration || 1;

        const pct = (currentTime / duration) * 100;
        progressFill.style.width = Math.min(pct, 100) + '%';

        const cur = formatTime(currentTime);
        const dur = formatTime(duration);
        timeDisplay.innerText = `${cur} / ${dur}`;

        if (lrcData.length > 0) {
            let activeIndex = -1;
            for (let i = lrcData.length - 1; i >= 0; i--) {
                if (currentTime >= lrcData[i].time) {
                    activeIndex = i;
                    break;
                }
            }

            lrcLineElements.forEach((el, idx) => {
                el.classList.remove('active', 'sung');
                if (idx < activeIndex) {
                    el.classList.add('sung');
                } else if (idx === activeIndex) {
                    el.classList.add('active');
                    const panel = lyricsText;
                    const elTop = el.offsetTop;
                    const panelScroll = panel.scrollTop;
                    const panelHeight = panel.clientHeight;
                    if (elTop < panelScroll || elTop > panelScroll + panelHeight - 60) {
                        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }
            });
        }

        if (currentAudio.ended) {
            stopBroadcast();
            statusEl.innerText = "STATUS: TRANSMISSION COMPLETE";
            return;
        }

        syncRAF = requestAnimationFrame(syncLoop);
    }
    syncRAF = requestAnimationFrame(syncLoop);
}

function stopSyncLoop() {
    lrcActive = false;
    if (syncRAF) {
        cancelAnimationFrame(syncRAF);
        syncRAF = null;
    }
}