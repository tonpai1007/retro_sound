// ============================================================
//  SHARE ENGINE — Export, Copy, Share URL
// ============================================================

function exportLRC() {
    if (lrcData.length === 0) {
        statusEl.innerText = "STATUS: No lyrics to export";
        return;
    }

    const lrcText = lrcData.map(l => {
        const mins = Math.floor(l.time / 60);
        const secs = l.time % 60;
        const mm = String(mins).padStart(2, '0');
        const ss = String(Math.floor(secs)).padStart(2, '0');
        const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
        return `[${mm}:${ss}.${xx}]${l.text}`;
    }).join('\n');

    const blob = new Blob([lrcText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${document.getElementById('artist').value || 'lyrics'}_${document.getElementById('title').value || 'track'}.lrc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusEl.innerText = `STATUS: EXPORTED ${lrcData.length} lines`;
}

function copyLRC() {
    if (lrcData.length === 0) {
        statusEl.innerText = "STATUS: No lyrics to copy";
        return;
    }

    const lrcText = lrcData.map(l => {
        const mins = Math.floor(l.time / 60);
        const secs = l.time % 60;
        const mm = String(mins).padStart(2, '0');
        const ss = String(Math.floor(secs)).padStart(2, '0');
        const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
        return `[${mm}:${ss}.${xx}]${l.text}`;
    }).join('\n');

    navigator.clipboard.writeText(lrcText).then(() => {
        statusEl.innerText = "STATUS: COPIED TO CLIPBOARD";
    }).catch(() => {
        statusEl.innerText = "STATUS: COPY FAILED";
    });
}

function shareURL() {
    if (lrcData.length === 0) {
        statusEl.innerText = "STATUS: No lyrics to share";
        return;
    }

    const lrcText = lrcData.map(l => {
        const mins = Math.floor(l.time / 60);
        const secs = l.time % 60;
        const mm = String(mins).padStart(2, '0');
        const ss = String(Math.floor(secs)).padStart(2, '0');
        const xx = String(Math.floor((secs % 1) * 100)).padStart(2, '0');
        return `[${mm}:${ss}.${xx}]${l.text}`;
    }).join('\n');

    const encoded = btoa(unescape(encodeURIComponent(lrcText)));
    const url = window.location.origin + window.location.pathname + '#' + encoded;

    navigator.clipboard.writeText(url).then(() => {
        statusEl.innerText = "STATUS: SHARE LINK COPIED";
    }).catch(() => {
        window.location.hash = encoded;
        statusEl.innerText = "STATUS: LINK GENERATED (check address bar)";
    });
}

function loadFromHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return false;

    try {
        const lrcText = decodeURIComponent(escape(atob(hash)));
        const parsed = parseLRC(lrcText);
        if (parsed.length > 0) {
            lrcData = parsed;
            renderLRC(lrcData);
            statusEl.innerText = `STATUS: LRC LOADED FROM LINK (${lrcData.length} lines)`;
            return true;
        }
    } catch(e) {
        // Invalid hash data, ignore
    }
    return false;
}