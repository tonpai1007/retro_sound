export function parseLRC(lrcText) {
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

export function lrcFromPlain(lyrics, duration) {
  const plainLines = String(lyrics || '').split('\n').filter(l => l.trim());
  if (plainLines.length === 0) return [];
  const totalDuration = duration || 30;
  const interval = totalDuration / plainLines.length;
  return plainLines.map((text, i) => ({
    time: i * interval,
    text: text.trim()
  }));
}

export function renderLRC(lines, container) {
  container.innerHTML = '';
  if (!lines || lines.length === 0) {
    container.innerHTML = '> NO LRC DATA LOADED';
    return [];
  }

  const elems = [];
  lines.forEach((line, index) => {
    const div = document.createElement('div');
    div.className = 'lrc-line';
    div.dataset.index = index;

    const words = line.text.split(' ');
    words.forEach((word) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.innerText = word + ' ';
      div.appendChild(span);
    });

    container.appendChild(div);
    elems.push(div);
  });
  return elems;
}

export function startSyncLoop(lrcData, lineElems, getCurrentTime, onEnd) {
  let raf = null;
  function sync() {
    const currentTime = getCurrentTime();
    if (lrcData.length > 0) {
      let activeIndex = -1;
      for (let i = lrcData.length - 1; i >= 0; i--) {
        if (currentTime >= lrcData[i].time) {
          activeIndex = i;
          break;
        }
      }

      lineElems.forEach((el, idx) => {
        el.classList.remove('active', 'sung');
        if (idx < activeIndex) el.classList.add('sung');
        else if (idx === activeIndex) {
          el.classList.add('active');
          const panel = el.parentElement;
          const elTop = el.offsetTop;
          const panelScroll = panel.scrollTop;
          const panelHeight = panel.clientHeight;
          if (elTop < panelScroll || elTop > panelScroll + panelHeight - 60) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }
      });
    }
    raf = requestAnimationFrame(sync);
  }
  sync();
  return () => cancelAnimationFrame(raf);
}
