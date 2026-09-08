import os
import sys
import json
import time
import socket
import ipaddress
import logging
import requests
from urllib.parse import urlparse
from flask import Flask, request, jsonify, send_from_directory, Response
from cache import get_cached, set_cached, init_db

app = Flask(__name__, static_folder='..', static_url_path='')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

init_db()

LYRICS_API = 'https://api.lyrics.ovh/v1'
ITUNES_API = 'https://itunes.apple.com/search'

ALLOWED_HOSTS = {
    'api.lyrics.ovh', 'itunes.apple.com', 'audio-ssl.itunes.apple.com',
    'audio-ssl.mzstatic.com', 'music.apple.com', 'audiocdn.apple.com',
}

# Rate limiting: max requests per window per IP
RATE_LIMIT = 30
RATE_WINDOW = 60  # seconds
request_log = {}


def _is_safe_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    if parsed.port not in (None, 80, 443):
        return False
    if not parsed.hostname:
        return False

    if parsed.hostname in ALLOWED_HOSTS:
        return True

    try:
        addresses = [ipaddress.ip_address(parsed.hostname.strip('[]'))]
    except ValueError:
        try:
            addresses = [ipaddress.ip_address(item[4][0])
                         for item in socket.getaddrinfo(parsed.hostname, None)]
        except socket.gaierror:
            return False

    for addr in addresses:
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified):
            return False
    return True


def _check_rate_limit(ip):
    now = time.time()
    if ip not in request_log:
        request_log[ip] = []
    # Remove old entries outside the window
    request_log[ip] = [t for t in request_log[ip] if now - t < RATE_WINDOW]
    if len(request_log[ip]) >= RATE_LIMIT:
        return False
    request_log[ip].append(now)
    return True


@app.before_request
def before_request():
    # Skip rate limiting for health checks
    if request.path == '/api/health':
        return
    ip = request.remote_addr
    if not _check_rate_limit(ip):
        logger.warning(f'Rate limit exceeded for {ip}')
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429
    logger.info(f'{request.method} {request.path} from {ip}')


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/lyrics')
def get_lyrics():
    artist = request.args.get('artist', '').strip()
    title = request.args.get('title', '').strip()
    if not artist or not title:
        return jsonify({'error': 'Missing artist or title'}), 400

    cached = get_cached(artist, title)
    if cached is not None:
        return jsonify({'lyrics': cached, 'cached': True})

    try:
        resp = requests.get(f'{LYRICS_API}/{artist}/{title}', timeout=10)
        resp.raise_for_status()
        data = resp.json()
        lyrics = data.get('lyrics', '')
        if not lyrics:
            return jsonify({'error': 'Lyrics not found'}), 404
        set_cached(artist, title, lyrics)
        return jsonify({'lyrics': lyrics, 'cached': False})
    except requests.exceptions.RequestException:
        return jsonify({'error': 'Lyrics service unavailable'}), 502


@app.route('/api/preview')
def get_preview():
    artist = request.args.get('artist', '').strip()
    title = request.args.get('title', '').strip()
    if not artist or not title:
        return jsonify({'error': 'Missing artist or title'}), 400

    try:
        resp = requests.get(ITUNES_API, params={
            'term': f'{artist} {title}',
            'entity': 'song',
            'limit': 1
        }, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = data.get('results', [])
        if not results or not results[0].get('previewUrl'):
            return jsonify({'error': 'Preview not found'}), 404
        return jsonify({'previewUrl': results[0]['previewUrl']})
    except requests.exceptions.RequestException:
        return jsonify({'error': 'Preview service unavailable'}), 502


@app.route('/api/search')
def search_songs():
    term = request.args.get('term', '').strip()
    if not term:
        return jsonify({'error': 'Missing term'}), 400

    try:
        resp = requests.get(ITUNES_API, params={
            'term': term,
            'entity': 'song',
            'limit': 5
        }, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for r in data.get('results', []):
            results.append({
                'artist': r.get('artistName', ''),
                'title': r.get('trackName', ''),
                'album': r.get('collectionName', ''),
                'previewUrl': r.get('previewUrl', '')
            })
        return jsonify({'results': results})
    except requests.exceptions.RequestException:
        return jsonify({'error': 'Search service unavailable'}), 502


@app.route('/api/lrc/generate', methods=['POST'])
def generate_lrc():
    body = request.get_json()
    if not body or 'lyrics' not in body:
        return jsonify({'error': 'Missing lyrics field'}), 400

    plain_lines = body['lyrics'].split('\n')
    plain_lines = [l.strip() for l in plain_lines if l.strip()]
    total_duration = body.get('duration', 30)
    interval = total_duration / len(plain_lines) if plain_lines else 3

    lrc_lines = []
    for i, text in enumerate(plain_lines):
        lrc_lines.append({
            'time': round(i * interval, 2),
            'text': text
        })
    return jsonify({'lrc': lrc_lines})


@app.route('/api/audio/proxy')
def audio_proxy():
    url = request.args.get('url', '')
    if not _is_safe_url(url):
        return jsonify({'error': 'Invalid url parameter'}), 400

    try:
        resp = requests.get(url, stream=True, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0'
        })
        resp.raise_for_status()

        content_type = resp.headers.get('Content-Type', 'audio/mpeg')
        return Response(
            resp.iter_content(chunk_size=8192),
            content_type=content_type,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Accept-Ranges': 'bytes'
            }
        )
    except requests.exceptions.RequestException:
        return jsonify({'error': 'Proxy request failed'}), 502


@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)


BANNER = r"""
  ___  ___  ___  _ __ ___   ___  _ __  _   _ _ __  ___  ___
 / __|/ __|| _ \| '  \___| / _ \| '  \| | | | '  \/ __|/ _ \
 \__ \ (_ ||  _/| |) |--> | (_) | |) | |_| | |) | (__|  __/
 |___/\___/|_|  | .__/|___|\___/| .__/\__,_| .__/ \___|\___|
                |_|                     |_|      |_|
                           CRT SIGNAL v1.0
"""

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(BANNER)
    print(f"  [CRT BOOT]  Phosphor array initialized")
    print(f"  [API]       Lyrics cache     -> /api/lyrics")
    print(f"  [API]       LRC generator    -> /api/lrc/generate")
    print(f"  [API]       Audio proxy      -> /api/audio/proxy")
    print(f"  [API]       iTunes preview   -> /api/preview")
    print(f"  [API]       Song search      -> /api/search")
    print(f"  [API]       Health check     -> /api/health")
    print(f"\n  Server listening on http://0.0.0.0:{port}")
    print(f"  Open http://localhost:{port} in your browser\n")
    app.run(host='0.0.0.0', port=port, debug=False)