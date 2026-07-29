// APP 6: DOS EDIT
let dosInput, dosOutput, dosFilename, dosSave, dosLine;
let dosTimer = null;

function escHtml(s) {
    return s.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&';
        if (m === '<') return '<';
        return '>';
    });
}

function highlightDos(text) {
    text = escHtml(text);
    const ph = [];
    text = text.replace(/(\/\/[^\n]*)/g, function(m) { ph.push('<span class="syntax-comment">' + m + '</span>'); return '___P' + (ph.length - 1) + '___'; });
    text = text.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, function(m) { ph.push('<span class="syntax-string">' + m + '</span>'); return '___P' + (ph.length - 1) + '___'; });
    var keywords = ['var','let','const','function','if','else','return','for','while','true','false','null','undefined','async','await','new','class'];
    var kwRegex = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'g');
    text = text.replace(kwRegex, '<span class="syntax-keyword">$1</span>');
    text = text.replace(/\b([a-zA-Z_$][\w$]*)\s*\(/g, '<span class="syntax-func">$1</span>(');
    text = text.replace(/\b(\d+\.?\d*)\b/g, '<span class="syntax-number">$1</span>');
    text = text.replace(/___P(\d+)___/g, function(m, idx) { return ph[parseInt(idx)] || m; });
    return text;
}

function syncDos() {
    if (!dosInput) return;
    const text = dosInput.value;
    localStorage.setItem('msdos_edit_file', text);
    if (dosSave) dosSave.innerText = 'SAVED';
    if (dosOutput) {
        dosOutput.innerHTML = highlightDos(text);
        dosOutput.scrollTop = dosInput.scrollTop;
        dosOutput.scrollLeft = dosInput.scrollLeft;
    }
    const t = text.substring(0, dosInput.selectionStart).split('\n');
    if (dosLine) dosLine.innerText = 'Ln ' + t.length + ', Col ' + (t[t.length - 1].length + 1);
}

function mountDosEdit() {
    dosInput = document.getElementById('dos-input');
    dosOutput = document.getElementById('dos-output');
    dosFilename = document.getElementById('dos-filename');
    dosSave = document.getElementById('dos-save');
    dosLine = document.getElementById('dos-line');
    if (!dosInput) return;
    dosInput.addEventListener('input', onDosInput);
    dosInput.addEventListener('scroll', onDosScroll);
    window.addEventListener('load', onDosLoad);
}

function unmountDosEdit() {
    if (dosTimer) { clearTimeout(dosTimer); dosTimer = null; }
    if (dosInput) {
        dosInput.removeEventListener('input', onDosInput);
        dosInput.removeEventListener('scroll', onDosScroll);
        dosInput = null;
    }
    dosOutput = null;
    dosFilename = null;
    dosSave = null;
    dosLine = null;
}

function onDosInput() {
    if (!dosSave) return;
    dosSave.innerText = 'TYPING...';
    if (dosTimer) clearTimeout(dosTimer);
    dosTimer = setTimeout(syncDos, 200);
    if (dosOutput && dosInput) {
        dosOutput.innerHTML = highlightDos(dosInput.value);
        dosOutput.scrollTop = dosInput.scrollTop;
    }
    if (dosInput && dosLine) {
        const t = dosInput.value.substring(0, dosInput.selectionStart).split('\n');
        dosLine.innerText = 'Ln ' + t.length + ', Col ' + (t[t.length - 1].length + 1);
    }
}

function onDosScroll() {
    if (dosOutput && dosInput) {
        dosOutput.scrollTop = dosInput.scrollTop;
        dosOutput.scrollLeft = dosInput.scrollLeft;
    }
}

function onDosLoad() {
    const saved = localStorage.getItem('msdos_edit_file');
    if (dosInput) {
        dosInput.value = saved || '// WELCOME TO DOS EDIT v2 (SPA)\n// Click here and start typing\n\nfunction init() {\n  console.log("Phantom OS loaded");\n}\n';
        syncDos();
    }
}