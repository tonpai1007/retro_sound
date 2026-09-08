#!/usr/bin/env python3
# ============================================================
#  CRT SIGNAL TERMINAL — Native Python TUI (stdlib only)
#  Run:  python tui.py            (inside tui.bat:  tui.bat native)
#  No third-party dependencies: urllib + ANSI escapes only.
# ============================================================
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import platform
import datetime

HISTORY_FILE = os.path.join(os.path.expanduser('~'), '.crt_signal_tui_history')
THEME_FILE = os.path.join(os.path.expanduser('~'), '.crt_signal_tui_theme')
LYRICS_API = 'https://api.lyrics.ovh/v1'
ITUNES_API = 'https://itunes.apple.com/search'
PROMPT = 'C:\\CRT_SIGNAL>'

WEB_APPS = {
    'retro-crt':  ('RETRO CRT',  '/#retro-crt'),
    'retro-v2':   ('AMBER',      '/#retro-v2'),
    'retro-yt':   ('YT MUSIC',   '/#retro-yt'),
    'signal-v4':  ('SIGNAL v4',  '/#signal-v4'),
    'signal-v5':  ('LRC SYNC',   '/#signal-v5'),
    'dos-edit':   ('DOS EDIT',   '/#dos-edit'),
    'dj-mixer':   ('DJ MIXER',   '/#dj-mixer'),
}
APP_ALIASES = {
    'crt': 'retro-crt', 'crt1': 'retro-crt', '1': 'retro-crt',
    'amber': 'retro-v2', '2': 'retro-v2',
    'yt': 'retro-yt', 'youtube': 'retro-yt', '3': 'retro-yt',
    'radio': 'signal-v4', 'signal4': 'signal-v4', '4': 'signal-v4',
    'lrc': 'signal-v5', 'lrcsync': 'signal-v5', '5': 'signal-v5',
    'dos': 'dos-edit', 'edit': 'dos-edit', '6': 'dos-edit',
    'dj': 'dj-mixer', '7': 'dj-mixer',
    'shell': 'tui', '8': 'tui',
}
COMMAND_ALIASES = {
    '?': 'help', 'cls': 'clear', 'quit': 'exit', 'logout': 'exit',
    'play': 'lyrics', 'song': 'lyrics', 'find': 'search',
    'ls': 'apps', 'dir': 'apps', 'cd': 'open', 'run': 'open',
}

# ---------------- Phosphor themes (ANSI) ----------------
THEMES = {
    'amber': {'fg': '38;5;214', 'hi': '38;5;220', 'ok': '38;5;46',  'err': '38;5;196', 'dim': '38;5;240'},
    'green': {'fg': '38;5;40',  'hi': '38;5;48',  'ok': '38;5;48',  'err': '38;5;196', 'dim': '38;5;240'},
    'cyan':  {'fg': '38;5;51',  'hi': '38;5;87',  'ok': '38;5;48',  'err': '38;5;196', 'dim': '38;5;240'},
    'white': {'fg': '38;5;255', 'hi': '38;5;231', 'ok': '38;5;48',  'err': '38;5;196', 'dim': '38;5;240'},
}
current_theme = 'amber'
history = []


# ---------------- Terminal plumbing ----------------
def enable_vt():
    """Enable ANSI VT processing on Windows terminals."""
    if os.name == 'nt':
        os.system('')  # activates ANSI in conhost on Win10+
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


def paint(text, role=None, bold=False):
    c = THEMES[current_theme]
    code = c.get(role, c['fg']) if role else c['fg']
    prefix = '\033[1;' if bold else '\033[0;'
    return prefix + code + 'm' + text + '\033[0m'


def out(text='', role=None, bold=False):
    print(paint(text, role, bold))


def err(text):
    print(paint('X ' + text, 'err'))


def dim(text):
    print(paint(text, 'dim'))


def clear_screen():
    print('\033[2J\033[H', end='')


def set_theme(name):
    global current_theme
    if name not in THEMES:
        return False
    current_theme = name
    try:
        with open(THEME_FILE, 'w') as f:
            f.write(name)
    except OSError:
        pass
    return True


def load_theme():
    global current_theme
    try:
        with open(THEME_FILE) as f:
            name = f.read().strip()
        if name in THEMES:
            current_theme = name
    except OSError:
        pass


def load_history():
    global history
    try:
        with open(HISTORY_FILE, encoding='utf-8') as f:
            history = [ln.rstrip('\n') for ln in f][-100:]
    except OSError:
        history = []


def save_history():
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            f.write('\n'.join(history[-100:]) + ('\n' if history else ''))
    except OSError:
        pass


# ---------------- Network helpers (stdlib) ----------------
def http_json(url, timeout=10):
    req = urllib.request.Request(url, headers={'User-Agent': 'CRT-Signal-TUI/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8', 'replace'))


# ---------------- Banner ----------------
BANNER = r"""
  ██████╗ ███████╗████████╗    ███████╗██╗  ██╗███████╗██╗     ██╗
  ██╔══██╗██╔════╝╚══██╔══╝    ██╔════╝██║  ██║██╔════╝██║     ██║
  ██████╔╝█████╗     ██║       ███████╗███████║█████╗  ██║     ██║
  ██╔══██╗██╔══╝     ██║       ╚════██║██╔══██║██╔══╝  ██║     ██║
  ██║  ██║███████╗   ██║       ███████║██║  ██║███████╗███████╗██║
  ╚═╝  ╚═╝╚══════╝   ╚═╝       ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝
"""


def print_banner():
    print()
    out(BANNER, 'hi', bold=True)
    dim('CRT SIGNAL TERMINAL v1.0 (native python) · ttys0 · phosphor=' + current_theme)
    out('Type HELP for commands, APPS to list software, EXIT to detach.')
    print()


# ---------------- Commands ----------------
def cmd_help(args):
    if args:
        q = args[0].lower()
        q = COMMAND_ALIASES.get(q, q)
        c = COMMANDS.get(q)
        if not c:
            err('no such command: ' + args[0])
            return
        out(q + ' - ' + c['desc'], 'ok')
        print('  usage: ', end='')
        out(c['usage'], 'ok')
        return
    out('AVAILABLE COMMANDS', 'ok', bold=True)
    print(paint('-' * 58, 'dim'))
    for name, c in COMMANDS.items():
        print('  ' + paint(name.ljust(13), 'ok') + paint(c['desc'], 'dim'))
    print(paint('-' * 58, 'dim'))
    dim('Keys: UP/DOWN history · CTRL+C abort/exit')


def cmd_apps(args):
    out('INSTALLED APPS (web)', 'ok', bold=True)
    for i, (app, (label, path)) in enumerate(WEB_APPS.items(), 1):
        print('  [' + str(i) + '] ' + paint(app.ljust(12), 'ok') + paint(label + '  (open ' + app + ')', 'dim'))
    print('  [8] ' + paint('tui'.ljust(12), 'ok') + paint('THIS TERMINAL (you are here)', 'dim'))


def cmd_open(args):
    if not args:
        err('usage: open APP_NAME  (run "apps" to list)')
        return
    name = APP_ALIASES.get(args[0].lower(), args[0].lower())
    if name == 'tui':
        out('> already running natively. Use "web" to launch the browser suite.')
        return
    if name not in WEB_APPS:
        err('unknown app: ' + args[0])
        return
    label, path = WEB_APPS[name]
    out('> opening ' + name + ' in your browser...')
    port = os.environ.get('CRT_PORT', '8080')
    url = 'http://localhost:' + port + path
    try:
        import webbrowser
        webbrowser.open(url)
        dim('  ' + url)
    except Exception as e:
        err('could not open browser: ' + str(e))


def cmd_lyrics(args):
    if len(args) < 2:
        err('usage: lyrics ARTIST TITLE')
        return
    artist, title = args[0], ' '.join(args[1:])
    dim('> querying lyrics database for "' + artist + ' - ' + title + '"...')
    url = LYRICS_API + '/' + urllib.parse.quote(artist, safe='') + '/' + urllib.parse.quote(title, safe='')
    try:
        data = http_json(url)
        lyrics = data.get('lyrics') or ''
    except Exception:
        lyrics = ''
    if not lyrics:
        err('LYRICS NOT FOUND (or network unreachable)')
        return
    lines = lyrics.split('\n')
    dim('> found ' + str(len(lines)) + ' lines - streaming... [CTRL+C to abort]')
    try:
        for line in lines:
            print(paint(line if line else ' ', 'fg'))
            time.sleep(0.03)
        dim('> end of track.')
    except KeyboardInterrupt:
        print()
        dim('^C aborted.')


def cmd_search(args):
    term = ' '.join(args).strip()
    if not term:
        err('usage: search TERM...')
        return
    dim('> searching iTunes for "' + term + '"...')
    url = ITUNES_API + '?entity=song&limit=5&term=' + urllib.parse.quote(term)
    try:
        data = http_json(url)
    except Exception:
        err('search failed (network error)')
        return
    results = data.get('results') or []
    if not results:
        err('no results found')
        return
    out('TOP RESULTS', 'ok', bold=True)
    for i, r in enumerate(results, 1):
        artist = r.get('artistName', '?')
        track = r.get('trackName', '?')
        album = r.get('collectionName', '')
        print('  [' + str(i) + '] ' + paint(artist, 'ok') + ' - ' + track + paint('  (' + album + ')', 'dim'))
    dim('run: lyrics ARTIST TITLE')


def cmd_history(args):
    if args and args[0] in ('clear', '-c'):
        history.clear()
        save_history()
        out('> command history wiped.')
        return
    if not history:
        dim('(no history yet)')
        return
    for i, h in enumerate(history, 1):
        print('  ' + str(i).rjust(3) + '  ' + paint(h, 'dim'))


def cmd_theme(args):
    if not args:
        out('PHOSPHOR THEMES', 'ok', bold=True)
        for name in THEMES:
            mark = paint('  <- active', 'dim') if name == current_theme else ''
            print('  ' + paint(name, 'ok') + paint('  theme ' + name, 'dim') + mark)
        return
    name = args[0].lower()
    if not set_theme(name):
        err('unknown theme: ' + args[0] + '  (amber, green, cyan, white)')
        return
    clear_screen()
    print_banner()
    out('> phosphor retuned to ' + name + '. The whole tube shifts...')


def cmd_sysinfo(args):
    rows = [
        ('HOST', platform.platform()),
        ('PYTHON', sys.version.split()[0]),
        ('MACHINE', platform.machine()),
        ('CPU CORES', str(os.cpu_count() or '?')),
        ('TERMINAL', os.environ.get('TERM_PROGRAM') or os.environ.get('TERM') or 'console'),
        ('THEME', current_theme),
        ('HISTORY', str(len(history)) + ' command(s) persisted'),
        ('CWD', os.getcwd()),
    ]
    out('SYSTEM INFORMATION', 'ok', bold=True)
    for k, v in rows:
        print('  ' + paint(k.ljust(13), 'ok') + paint(v, 'dim'))


def cmd_echo(args):
    out(' '.join(args))


def cmd_date(args):
    out(datetime.datetime.now().strftime('%a %b %d %H:%M:%S %Y'))


def cmd_whoami(args):
    out('crt-operator@ttys0 ' + paint('(uid=1337, phosphor=' + current_theme + ')', 'dim'))


def cmd_clear(args):
    clear_screen()
    print_banner()


def cmd_web(args):
    cmd_open(['retro-crt'])


def cmd_banner(args):
    clear_screen()
    print_banner()


def cmd_exit(args):
    dim('> detaching ttys0...')
    save_history()
    sys.exit(0)


COMMANDS = {
    'help':    {'desc': 'Show help, or details for one command',    'usage': 'help [COMMAND]',   'fn': cmd_help},
    'apps':    {'desc': 'List installed CRT SIGNAL apps',           'usage': 'apps',             'fn': cmd_apps},
    'open':    {'desc': 'Open a web app in your browser',           'usage': 'open APP_NAME',    'fn': cmd_open},
    'web':     {'desc': 'Open the browser workstation (launcher)',  'usage': 'web',              'fn': cmd_web},
    'lyrics':  {'desc': 'Fetch and stream song lyrics',             'usage': 'lyrics ARTIST TITLE', 'fn': cmd_lyrics},
    'search':  {'desc': 'Search songs on iTunes',                   'usage': 'search TERM...',   'fn': cmd_search},
    'theme':   {'desc': 'Retune the phosphor color',                'usage': 'theme [amber|green|cyan|white]', 'fn': cmd_theme},
    'echo':    {'desc': 'Print text back to the terminal',          'usage': 'echo TEXT',        'fn': cmd_echo},
    'date':    {'desc': 'Show current date and time',               'usage': 'date',             'fn': cmd_date},
    'whoami':  {'desc': 'Identify current terminal user',           'usage': 'whoami',           'fn': cmd_whoami},
    'sysinfo': {'desc': 'Show host / terminal system info',         'usage': 'sysinfo',          'fn': cmd_sysinfo},
    'history': {'desc': 'Show command history (or clear it)',       'usage': 'history [clear]',  'fn': cmd_history},
    'clear':   {'desc': 'Clear the terminal screen',                'usage': 'clear',            'fn': cmd_clear},
    'banner':  {'desc': 'Reprint the TUI banner',                   'usage': 'banner',           'fn': cmd_banner},
    'exit':    {'desc': 'Save history and leave the terminal',      'usage': 'exit',             'fn': cmd_exit},
}


def main():
    enable_vt()
    load_theme()
    load_history()
    clear_screen()
    print_banner()
    print(paint(PROMPT + ' ', 'ok'), end='', flush=True)
    while True:
        try:
            line = input()
        except (KeyboardInterrupt, EOFError):
            print()
            cmd_exit([])
        line = line.strip()
        print(paint(PROMPT + ' ' + line, 'ok'))
        if not line:
            print(paint(PROMPT + ' ', 'ok'), end='', flush=True)
            continue
        history.append(line)
        if len(history) > 100:
            history.pop(0)
        parts = line.split()
        cmd_name = parts[0].lower()
        args = parts[1:]
        cmd_name = COMMAND_ALIASES.get(cmd_name, cmd_name)
        cmd = COMMANDS.get(cmd_name)
        if not cmd:
            err('unknown command: ' + parts[0] + '  (type HELP)')
        else:
            try:
                cmd['fn'](args)
            except KeyboardInterrupt:
                print()
                dim('^C')
        print(paint(PROMPT + ' ', 'ok'), end='', flush=True)


if __name__ == '__main__':
    main()