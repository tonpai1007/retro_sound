/* ============================================================
 *  CRT SIGNAL TERMINAL — Text-mode shell app for CRT SIGNAL OS
 *  Loaded by index.html (blocking, in <head>) so that
 *  mountTui() / unmountTui() exist before the SPA router runs.
 * ============================================================ */
(function () {
    'use strict';

    /* ---------- App registry (name -> SPA data-app id) ---------- */
    var APP_ALIASES = {
        'retro-crt':  ['retro-crt', 'crt', 'crt1', '1'],
        'retro-v2':   ['retro-v2', 'amber', '2'],
        'retro-yt':   ['retro-yt', 'yt', 'youtube', '3'],
        'signal-v4': ['signal-v4', 'radio', 'signal4', '4'],
        'signal-v5': ['signal-v5', 'lrc', 'lrcsync', '5'],
        'dos-edit':   ['dos-edit', 'dos', 'edit', '6'],
        'dj-mixer':   ['dj-mixer', 'dj', '7'],
        'tui':        ['tui', 'shell', '8']
    };

    var TUI_BANNER =
        '  \u2588\u2588\u2588\u2557 \u2588\u2588\u2557  \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557\n' +
        '  \u2588\u2588\u2551  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d \u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\n' +
        '  \u2588\u2588\u2551  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551 \u2588\u2588\u2551      \u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\n' +
        '  \u2588\u2588\u2551  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d \u2588\u2588\u2551      \u2588\u2588\u2551\u255a\u2588\u2588\u2557\u2588\u2588\u2551\n' +
        '  \u255a\u2550\u255d  \u255a\u2550\u2550  \u2550\u255d\u255a\u2550\u2550\u2550\u2550\u255d  \u255a\u2550\u255d      \u255a\u2550\u255d \u255a\u255a\u2550\u2550\u255d';

    /* ---------- State ---------- */
    var outputEl = null;
    var inputEl = null;
    var statusEl = null;
    var mounted = false;
    var streamToken = 0; // used to cancel streaming output

    /* ---------- Command history (persisted across reloads) ---------- */
    var HISTORY_KEY = 'crt_tui_history';
    var history = [];
    var histPos = 0;
    try {
        var savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        if (Object.prototype.toString.call(savedHistory) === '[object Array]') {
            history = savedHistory.slice(-100);
        }
    } catch (e) { history = []; }
    histPos = history.length;

    function saveHistory() {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-100))); } catch (e) {}
    }

    /* ---------- Phosphor themes (live CSS variable retuning) ---------- */
    var THEME_KEY = 'phantom_tui_theme';
    var currentTheme = 'amber';
    var THEMES = {
        amber: { phosphor: '#FFB000', glow: 'rgba(255,176,0,0.7)',  dim: 'rgba(255,176,0,0.3)',  screen: '#0a0500' },
        green: { phosphor: '#33ff00', glow: 'rgba(51,255,0,0.7)',   dim: 'rgba(51,255,0,0.3)',   screen: '#000a00' },
        cyan:  { phosphor: '#00ffff', glow: 'rgba(0,255,255,0.7)',  dim: 'rgba(0,255,255,0.3)',  screen: '#000a0a' },
        white: { phosphor: '#e8e8e8', glow: 'rgba(232,232,232,0.7)', dim: 'rgba(232,232,232,0.3)', screen: '#050505' }
    };

    function applyTheme(name) {
        var t = THEMES[name];
        if (!t) return false;
        var root = document.documentElement.style;
        root.setProperty('--phosphor', t.phosphor);
        root.setProperty('--phosphor-glow', t.glow);
        root.setProperty('--phosphor-dim', t.dim);
        root.setProperty('--screen-bg', t.screen);
        try { localStorage.setItem(THEME_KEY, name); } catch (e) {}
        currentTheme = name;
        return true;
    }

    function loadTheme() {
        var saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
        if (saved && THEMES[saved]) {
            applyTheme(saved);
            return saved;
        }
        return 'amber';
    }

    function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    function esc(s) {
        // Entities are built via concatenation so editors/formatters
        // cannot decode them back into literal characters.
        return String(s)
            .replace(/&/g, '&' + 'amp;')
            .replace(/</g, '&' + 'lt;')
            .replace(/>/g, '&' + 'gt;');
    }

    function print(text, cls) {
        if (!outputEl) return;
        var div = document.createElement('div');
        div.className = 'tui-line' + (cls ? ' tui-' + cls : '');
        div.innerHTML = (text === '' || text === undefined) ? '\u00a0' : text;
        outputEl.appendChild(div);
        outputEl.scrollTop = outputEl.scrollHeight;
        // Keep DOM from growing unbounded
        while (outputEl.children.length > 800) {
            outputEl.removeChild(outputEl.firstChild);
        }
    }

    function resolveApp(name) {
        var n = String(name || '').toLowerCase();
        for (var app in APP_ALIASES) {
            if (APP_ALIASES.hasOwnProperty(app) && APP_ALIASES[app].indexOf(n) !== -1) {
                return app;
            }
        }
        return null;
    }

    function switchApp(app) {
        if (typeof window.showApp === 'function') {
            window.showApp(app);
            return true;
        }
        return false;
    }

    /* ---------- Commands ---------- */
    var COMMANDS = {
        help: {
            desc: 'Show help, or details for one command',
            usage: 'help [COMMAND]',
            fn: function (args) {
                if (args.length) {
                    var q = args[0].toLowerCase();
                    if (COMMAND_ALIASES.hasOwnProperty(q)) q = COMMAND_ALIASES[q];
                    var target = COMMANDS[q];
                    if (!target) { print('X no such command: ' + esc(args[0]), 'err'); return; }
                    print('<span class="tui-green">' + q + '</span> <span class="tui-dim">\u2014 ' + esc(target.desc) + '</span>');
                    print('  usage: <span class="tui-green">' + esc(target.usage) + '</span>');
                    return;
                }
                print('<span class="tui-green">AVAILABLE COMMANDS</span>');
                print('<span class="tui-dim">' + '-'.repeat(58) + '</span>');
                Object.keys(COMMANDS).forEach(function (name) {
                    var c = COMMANDS[name];
                    var pad = ' '.repeat(Math.max(1, 14 - name.length));
                    print('  <span class="tui-green">' + name + '</span>' + pad + '<span class="tui-dim">' + esc(c.desc) + '</span>');
                });
                print('<span class="tui-dim">' + '-'.repeat(58) + '</span>');
                print('<span class="tui-dim">Keys: \u2191/\u2193 history \u00b7 TAB complete \u00b7 CTRL+L clear \u00b7 CTRL+C abort \u00b7 F1 help</span>');
            }
        },
        apps: {
            desc: 'List installed CRT SIGNAL apps',
            usage: 'apps',
            fn: function () {
                print('<span class="tui-green">INSTALLED APPS</span>');
                Object.keys(APP_ALIASES).forEach(function (app, i) {
                    print('  [' + (i + 1) + '] <span class="tui-green">' + app + '</span>  <span class="tui-dim">(open ' + app + ')</span>');
                });
            }
        },
        open: {
            desc: 'Launch an app by name (try: apps)',
            usage: 'open APP_NAME',
            fn: function (args) {
                if (!args.length) { print('usage: open APP_NAME  (run "apps" to list)', 'err'); return; }
                var app = resolveApp(args[0]);
                if (!app) { print('X unknown app: ' + esc(args[0]), 'err'); return; }
                print('> launching <span class="tui-green">' + app + '</span> ...');
                if (switchApp(app)) {
                    print('> <span class="tui-dim">detached. TUI shell suspended in background.</span>');
                } else {
                    print('X failed to launch (router unavailable)', 'err');
                }
            }
        },
        lyrics: {
            desc: 'Fetch and stream song lyrics',
            usage: 'lyrics ARTIST TITLE',
            fn: function (args) {
                return cmdLyrics(args);
            }
        },
        echo: {
            desc: 'Print text back to the terminal',
            usage: 'echo TEXT',
            fn: function (args) { print(esc(args.join(' '))); }
        },
        date: {
            desc: 'Show current date and time',
            usage: 'date',
            fn: function () { print(esc(new Date().toString())); }
        },
        whoami: {
            desc: 'Identify current terminal user',
            usage: 'whoami',
            fn: function () { print('crt-operator@ttys0 <span class="tui-dim">(uid=1337, phosphor=amber)</span>'); }
        },
        sysinfo: {
            desc: 'Show host / terminal system info',
            usage: 'sysinfo',
            fn: function () {
                var nav = navigator;
                var backend = (typeof backendAvailable !== 'undefined') ? backendAvailable : false;
                var rows = [
                    ['HOST', nav.platform || 'unknown'],
                    ['BROWSER', (nav.userAgent || '').replace(/^Mozilla\/[0-9.]+ /, '').substring(0, 48)],
                    ['LANGUAGE', nav.language || 'unknown'],
                    ['CPU THREADS', String(nav.hardwareConcurrency || '?')],
                    ['SCREEN', screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x'],
                    ['VIEWPORT', window.innerWidth + 'x' + window.innerHeight],
                    ['ONLINE', nav.onLine ? 'YES' : 'NO'],
                    ['BACKEND', backend ? 'CONNECTED (cache enabled)' : 'STANDALONE (direct API)'],
                    ['HISTORY', history.length + ' command(s) persisted']
                ];
                print('<span class="tui-green">SYSTEM INFORMATION</span>');
                rows.forEach(function (row) {
                    var pad = ' '.repeat(Math.max(1, 14 - row[0].length));
                    print('  <span class="tui-green">' + row[0] + '</span>' + pad + '<span class="tui-dim">' + esc(row[1]) + '</span>');
                });
            }
        },
        search: {
            desc: 'Search songs on iTunes (feed results into lyrics)',
            usage: 'search TERM...',
            fn: function (args) {
                return cmdSearch(args);
            }
        },
        copy: {
            desc: 'Copy text to the system clipboard',
            usage: 'copy TEXT',
            fn: function (args) {
                var text = args.join(' ');
                if (!text) { print('usage: copy TEXT', 'err'); return; }
                if (!navigator.clipboard || !navigator.clipboard.writeText) {
                    print('X clipboard unavailable in this context', 'err');
                    return;
                }
                navigator.clipboard.writeText(text).then(function () {
                    print('> copied ' + text.length + ' character(s) to clipboard');
                }).catch(function () {
                    print('X clipboard write rejected', 'err');
                });
            }
        },
        history: {
            desc: 'Show command history (or clear it)',
            usage: 'history [clear]',
            fn: function (args) {
                if (args.length && (args[0] === 'clear' || args[0] === '-c')) {
                    history = [];
                    histPos = 0;
                    saveHistory();
                    print('> command history wiped.');
                    return;
                }
                if (!history.length) { print('<span class="tui-dim">(no history yet)</span>'); return; }
                history.forEach(function (h, i) {
                    print('  ' + String(i + 1).padStart(3) + '  ' + esc(h));
                });
            }
        },
        clear: {
            desc: 'Clear the terminal screen',
            usage: 'clear',
            fn: function () { clearScreen(); }
        },
        banner: {
            desc: 'Reprint the TUI banner',
            usage: 'banner',
            fn: function () { printBanner(); }
        },
        theme: {
            desc: 'Retune the phosphor color of the whole tube',
            usage: 'theme [amber|green|cyan|white]',
            fn: function (args) {
                if (!args.length) {
                    print('<span class="tui-green">PHOSPHOR THEMES</span>');
                    Object.keys(THEMES).forEach(function (name) {
                        var active = (currentTheme === name) ? '  <span class="tui-dim"><- active</span>' : '';
                        print('  <span class="tui-green">' + name + '</span>  <span class="tui-dim">theme ' + name + '</span>' + active);
                    });
                    return;
                }
                var name = args[0].toLowerCase();
                if (!THEMES[name]) {
                    print('X unknown theme: ' + esc(args[0]) + '  <span class="tui-dim">(amber, green, cyan, white)</span>', 'err');
                    return;
                }
                applyTheme(name);
                print('> phosphor retuned to <span class="tui-green">' + name + '</span>. The whole tube shifts...');
            }
        },
        exit: {
            desc: 'Leave the TUI and return to RETRO CRT',
            usage: 'exit',
            fn: function () {
                print('> detaching ttys0...');
                if (!switchApp('retro-crt')) {
                    print('X router unavailable', 'err');
                }
            }
        }
    };

    var COMMAND_ALIASES = {
        '?': 'help',
        'cls': 'clear',
        'quit': 'exit',
        'logout': 'exit',
        'play': 'lyrics',
        'song': 'lyrics',
        'ls': 'apps',
        'dir': 'apps',
        'cd': 'open',
        'run': 'open'
    };

    function cmdSearch(args) {
        var term = args.join(' ').trim();
        if (!term) {
            print('usage: search TERM...  (e.g. search queen bohemian)', 'err');
            return Promise.resolve();
        }
        var token = ++streamToken;
        print('> searching iTunes for "' + esc(term) + '"...', 'dim');
        setStatus('SEARCHING...');
        return fetch('/api/search?term=' + encodeURIComponent(term))
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (data) {
                if (token !== streamToken) return;
                setStatus('IDLE');
                var results = data && data.results;
                if (!results || !results.length) {
                    print('X no results found', 'err');
                    return;
                }
                print('<span class="tui-green">TOP RESULTS</span>');
                results.forEach(function (r, i) {
                    var line = '  [' + (i + 1) + '] ' + esc(r.artist) + ' - ' + esc(r.title);
                    if (r.album) line += '  <span class="tui-dim">(' + esc(r.album) + ')</span>';
                    print(line);
                });
                print('<span class="tui-dim">run: lyrics ARTIST TITLE</span>');
            });
    }

    function cmdLyrics(args) {
        if (args.length < 2) {
            print('usage: lyrics ARTIST TITLE', 'err');
            return Promise.resolve();
        }
        var artist = args[0];
        var title = args.slice(1).join(' ');
        var token = ++streamToken;

        print('> querying lyrics database for "' + esc(artist) + ' \u2014 ' + esc(title) + '"...', 'dim');
        setStatus('QUERYING...');

        return fetch('/api/lyrics?artist=' + encodeURIComponent(artist) + '&title=' + encodeURIComponent(title))
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (data) {
                if (token !== streamToken) return null;
                var lyrics = data && data.lyrics;
                if (lyrics) {
                    print('> served from ' + (data.cached ? '<span class="tui-dim">local cache</span>' : '<span class="tui-dim">upstream API</span>'));
                    return lyrics;
                }
                setStatus('FETCHING...');
                return fetch('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title))
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .catch(function () { return null; })
                    .then(function (d) {
                        if (token !== streamToken) return null;
                        return (d && d.lyrics) || null;
                    });
            })
            .then(function (lyrics) {
                if (token !== streamToken) return;
                if (!lyrics) {
                    setStatus('IDLE');
                    print('X LYRICS NOT FOUND (or network unreachable)', 'err');
                    return;
                }
                var lines = lyrics.split('\n');
                print('> found ' + lines.length + ' lines \u2014 streaming... <span class="tui-dim">[CTRL+C to abort]</span>', 'dim');
                setStatus('STREAMING ' + artist.toUpperCase() + ' \u2014 ' + title.toUpperCase());
                var chain = Promise.resolve();
                lines.forEach(function (line) {
                    chain = chain.then(function () {
                        if (token !== streamToken) return;
                        print(esc(line));
                        return sleep(35);
                    });
                });
                return chain.then(function () {
                    if (token !== streamToken) return;
                    setStatus('IDLE');
                    print('> end of track.', 'dim');
                });
            })
            .catch(function () {
                if (token !== streamToken) return;
                setStatus('IDLE');
                print('X NETWORK ERROR', 'err');
            });
    }

    /* ---------- Input handling ---------- */
    function runCommand(raw) {
        var line = String(raw || '').trim();
        print('<span class="tui-amber">C:\\CRT_SIGNAL' + '\u003e' + '</span> ' + esc(line), 'cmd');
        if (!line) return;

        history.push(line);
        if (history.length > 100) history.shift();
        histPos = history.length;
        saveHistory();

        var parts = line.split(/\s+/);
        var cmdName = parts[0].toLowerCase();
        var args = parts.slice(1);

        if (COMMAND_ALIASES.hasOwnProperty(cmdName)) cmdName = COMMAND_ALIASES[cmdName];
        var cmd = COMMANDS[cmdName];
        if (!cmd) {
            print('X unknown command: ' + esc(parts[0]) + '  <span class="tui-dim">(type HELP)</span>', 'err');
            return;
        }
        cmd.fn(args);
    }

    function complete() {
        var value = inputEl.value;
        var parts = value.split(/\s+/);
        if (parts.length <= 1) {
            var prefix = parts[0] || '';
            var matches = Object.keys(COMMANDS).filter(function (c) {
                return prefix && c.indexOf(prefix.toLowerCase()) === 0;
            });
            if (matches.length === 1) {
                inputEl.value = matches[0] + ' ';
            } else if (matches.length > 1) {
                print('<span class="tui-amber">C:\\CRT_SIGNAL' + '\u003e' + '</span> ' + esc(value), 'cmd');
                print(matches.join('  '), 'dim');
            }
        } else if (parts[0].toLowerCase() === 'open') {
            var prefix2 = parts[parts.length - 1].toLowerCase();
            var apps = Object.keys(APP_ALIASES).filter(function (a) {
                return prefix2 && a.indexOf(prefix2) === 0;
            });
            if (apps.length === 1) {
                parts[parts.length - 1] = apps[0];
                inputEl.value = parts.join(' ');
            } else if (apps.length > 1) {
                print('<span class="tui-amber">C:\\CRT_SIGNAL' + '\u003e' + '</span> ' + esc(value), 'cmd');
                print(apps.join('  '), 'dim');
            }
        }
    }

    function clearScreen() {
        streamToken++; // cancel any streaming
        if (outputEl) outputEl.innerHTML = '';
        setStatus('IDLE');
    }

    function printBanner() {
        print('<span class="tui-amber">' + TUI_BANNER + '</span>');
        print('<span class="tui-dim">CRT SIGNAL TERMINAL v1.0 \u00b7 ttys0 \u00b7 phosphor=amber \u00b7 ' + Object.keys(COMMANDS).length + ' commands loaded</span>');
        print('Type <span class="tui-green">HELP</span> for a list of commands, <span class="tui-green">APPS</span> to list software.');
        print('');
    }

    function setStatus(text) {
        if (statusEl) statusEl.innerText = text;
    }

    function bindEvents() {
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var v = inputEl.value;
                inputEl.value = '';
                runCommand(v);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (histPos > 0) {
                    histPos--;
                    inputEl.value = history[histPos] || '';
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (histPos < history.length) {
                    histPos++;
                    inputEl.value = history[histPos] || '';
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                complete();
            } else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                clearScreen();
                printBanner();
            } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                streamToken++;
                print('^C', 'dim');
                setStatus('IDLE');
            } else if (e.key === 'F1') {
                e.preventDefault();
                COMMANDS.help.fn([]);
            }
        });

        // Click anywhere on the terminal to focus the input
        var win = document.getElementById('tui-window');
        if (win) {
            win.addEventListener('click', function () {
                if (mounted) inputEl.focus();
            });
        }
    }

    var eventsBound = false;

    /* ---------- Lifecycle hooks called by the SPA router ---------- */
    function mountTui() {
        outputEl = document.getElementById('tui-output');
        inputEl = document.getElementById('tui-input');
        statusEl = document.getElementById('tui-status');
        if (!outputEl || !inputEl) return;
        mounted = true;
        if (!eventsBound) {
            bindEvents();
            eventsBound = true;
        }
        currentTheme = loadTheme();
        outputEl.innerHTML = '';
        printBanner();
        setStatus('IDLE');
        inputEl.focus();
    }

    function unmountTui() {
        mounted = false;
        streamToken++; // cancel any streaming lyrics
    }

    // Export to global scope for index.html router
    window.mountTui = mountTui;
    window.unmountTui = unmountTui;
})();