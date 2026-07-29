// ============================================================
//  RADIO ENGINE — Tuning, Numbers Station
// ============================================================

function tuneRadio() {
    const freq = parseInt(tuner.value);
    const freqDecimal = (freq / 10).toFixed(1);
    dialDisplay.innerText = `${freqDecimal} FM`;
    initAudio();
    stopAllAudio();
    if (speechSynth.speaking) speechSynth.cancel();

    if (freq < 920) {
        statusEl.innerText = "STATUS: PHANTOM STATION DETECTED";
        startNumbersStation();
    } else if (freq > 1040) {
        statusEl.innerText = "STATUS: MUSIC BAND. LOAD A TRACK";
    } else {
        statusEl.innerText = "STATUS: DEAD AIR...";
    }
}

function startNumbersStation() {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.08;
    noiseSource.connect(noiseGain);
    noiseGain.connect(analyser);
    noiseSource.start();

    function speakNumbers() {
        if (parseInt(tuner.value) >= 920) return;
        if (speechSynth.speaking) return;
        const utterance = new SpeechSynthesisUtterance();
        const numbers = [];
        for(let i=0; i<5; i++) numbers.push(Math.floor(Math.random() * 10));
        utterance.text = numbers.join("... ");
        utterance.pitch = 0.1;
        utterance.rate = 0.7;
        speechSynth.speak(utterance);
        utterance.onend = () => setTimeout(speakNumbers, 3000);
    }
    speakNumbers();
}