// ============================================================
//  AUDIO ENGINE — Context, Oscilloscope, Playback
// ============================================================

let audioCtx = null;
let analyser = null;
let audioSource = null;
let noiseSource = null;
let currentAudio = null;
let isPlaying = false;
let audioDuration = 0;
let syncRAF = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function drawOscilloscope() {
    requestAnimationFrame(drawOscilloscope);
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;

    const bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    const dataArray = new Uint8Array(bufferLength);
    if (analyser) analyser.getByteTimeDomainData(dataArray);

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 4;
    canvasCtx.strokeStyle = '#FFB000';
    canvasCtx.shadowBlur = 10;
    canvasCtx.shadowColor = '#FFB000';
    canvasCtx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        let v;
        if (analyser && (currentAudio || noiseSource)) {
            v = dataArray[i] / 128.0;
        } else {
            v = 1 + Math.sin(i * 0.05 + Date.now() * 0.005) * 0.02;
        }
        const y = (v * canvas.height) / 2;
        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
        x += sliceWidth;
    }
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

function playAudio(url, lrcLines) {
    initAudio();
    stopAllAudio();
    if (speechSynth.speaking) speechSynth.cancel();

    if (lrcLines) {
        lrcData = lrcLines;
        renderLRC(lrcLines);
    }

    currentAudio = new Audio(url);
    currentAudio.crossOrigin = "anonymous";

    currentAudio.addEventListener('loadedmetadata', () => {
        audioDuration = currentAudio.duration;
        timeDisplay.innerText = `00:00 / ${formatTime(audioDuration)}`;
    });

    currentAudio.addEventListener('canplay', () => {
        audioSource = audioCtx.createMediaElementSource(currentAudio);
        audioSource.connect(analyser);
        currentAudio.play();
        isPlaying = true;
        statusEl.innerText = "STATUS: PLAYING (LRC SYNC ACTIVE)";
        startSyncLoop();
    });

    currentAudio.addEventListener('ended', () => {
        stopBroadcast();
        statusEl.innerText = "STATUS: TRANSMISSION COMPLETE";
    });

    currentAudio.addEventListener('error', (e) => {
        statusEl.innerText = "STATUS: AUDIO ERROR";
        lyricsText.innerHTML = '<span style="color:#ff0000;">> AUDIO LOAD FAILED. Check URL or CORS.</span>';
    });
}

function stopAllAudio() {
    if (currentAudio) {
        currentAudio.pause();
        if (audioSource) {
            try { audioSource.disconnect(); } catch(e){}
        }
        currentAudio = null;
        audioSource = null;
    }
    stopNoise();
}

function stopBroadcast() {
    stopAllAudio();
    stopSyncLoop();
    isPlaying = false;
    lrcLineElements.forEach(el => el.classList.remove('active', 'sung'));
    progressFill.style.width = '0%';
    timeDisplay.innerText = '00:00 / 00:00';
    document.getElementById('fetch-btn').disabled = false;
}

function stopNoise() {
    if (noiseSource) {
        try { noiseSource.stop(); } catch(e){}
        try { noiseSource.disconnect(); } catch(e){}
        noiseSource = null;
    }
}