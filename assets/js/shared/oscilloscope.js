export function drawOscilloscope(canvas, analyser, color = '#FFB000') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth * 2;
  const h = canvas.offsetHeight * 2;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const bufferLength = analyser ? analyser.frequencyBinCount : 1024;
  const dataArray = new Uint8Array(bufferLength);
  if (analyser) analyser.getByteTimeDomainData(dataArray);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  ctx.beginPath();

  const sliceWidth = canvas.width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    let v;
    if (analyser) {
      v = dataArray[i] / 128.0;
    } else {
      v = 1 + Math.sin(i * 0.05 + Date.now() * 0.005) * 0.02;
    }
    const y = (v * canvas.height) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

export function startOscLoop(canvas, analyser, color = '#FFB000') {
  let raf = null;
  function loop() {
    drawOscilloscope(canvas, analyser, color);
    raf = requestAnimationFrame(loop);
  }
  loop();
  return () => cancelAnimationFrame(raf);
}
