# Retro Sound

A collection of retro-themed, CRT-styled web applications and a Python terminal lyric fetcher. Unified by a phosphor amber / neon green aesthetic with scanline overlays, Vignette effects, and the VT323 monospace font.

## Apps

| App | Description |
|-----|-------------|
| **Phantom Signal v5** | LRC-synced karaoke with oscilloscope visualization, radio tuner, and phantom numbers station |
| **MS-DOS EDIT** | Browser-based text editor with syntax highlighting, save, and find |
| **CRT Player** | Retro CRT lyrics display |
| **YouTube Audio** | YouTube audio player in CRT theme |

## Project Structure

```
retro_sound/
├── index.html                  # Workstation launcher
├── crt-theme.css               # Shared CRT theme CSS
├── api_lyric_gen.py            # Standalone terminal lyric fetcher
├── apps/
│   ├── lrc-sync/index.html     # Phantom Signal v5 (LRC Sync)
│   ├── dos-edit/index.html     # MS-DOS EDIT emulator
│   ├── crt-player/index.html   # CRT lyrics display
│   ├── youtube-player/index.html  # YouTube audio player
│   └── legacy/                 # Previous versions (v4, retro_v2)
├── assets/
│   └── js/
│       ├── lrc-engine.js       # LRC parsing, rendering, sync loop
│       ├── audio-engine.js     # Audio context, oscilloscope, playback
│       ├── radio-engine.js     # Radio tuning, numbers station
│       ├── share.js            # Export, copy, share URL
│       └── app.js              # Main controller, backend integration
└── backend/
    ├── server.py               # Flask API server
    ├── cache.py                # SQLite lyrics caching
    ├── requirements.txt        # Python dependencies
    └── lyrics_cache.db         # Auto-created SQLite database
```

## Quick Start

### Standalone (no backend)
Open `index.html` or any app HTML file directly in a browser by double-clicking it or using a local server:
```bash
# Option 1: Open directly (works for most apps)
# Just double-click index.html or right-click > Open with browser

# Option 2: Use a simple HTTP server (recommended for full functionality)
python -m http.server 8080
# Then open http://localhost:8080
```
> **Note:** The standalone mode works out of the box. Lyrics are fetched from public APIs (lyrics.ovh).

### With Backend (Optional)
The Flask backend provides lyrics caching, CORS-free audio proxy, and LRC generation.
```bash
cd backend
pip install -r requirements.txt
python server.py
```
Then open `http://localhost:5000`. The backend provides:
- Lyrics caching (SQLite, 7-day TTL)
- CORS-free audio proxy
- LRC generation from plain text
- iTunes preview proxy

 ## Features

- **LRC Sync** — Karaoke-style word-by-word highlighting synced to audio playback
- **Oscilloscope** — Real-time audio waveform visualization
- **Radio Tuner** — Scan FM bands; phantom numbers station below 92 FM
- **LRC Editor** — Paste timestamped lyrics or generate timer-based sync from plain text
- **Export/Share** — Download `.lrc` files, copy to clipboard, or generate shareable URLs
- **Backend Proxy** — Solves CORS issues, caches lyrics, proxies audio streams

## Catalog

See **[CATALOG.md](CATALOG.md)** for a detailed reference of each app.
