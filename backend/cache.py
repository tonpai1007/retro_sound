import sqlite3
import time
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lyrics_cache.db')
CACHE_TTL = 7 * 24 * 60 * 60


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS lyrics_cache (
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            lyrics TEXT NOT NULL,
            fetched_at REAL NOT NULL,
            PRIMARY KEY (artist, title)
        )
    ''')
    conn.commit()
    conn.close()


def get_cached(artist, title):
    conn = get_db()
    row = conn.execute(
        'SELECT lyrics, fetched_at FROM lyrics_cache WHERE artist = ? AND title = ?',
        (artist, title)
    ).fetchone()
    conn.close()
    if row is None:
        return None
    if time.time() - row['fetched_at'] > CACHE_TTL:
        return None
    return row['lyrics']


def set_cached(artist, title, lyrics):
    conn = get_db()
    conn.execute(
        'INSERT OR REPLACE INTO lyrics_cache (artist, title, lyrics, fetched_at) VALUES (?, ?, ?, ?)',
        (artist, title, lyrics, time.time())
    )
    conn.commit()
    conn.close()