import time
import sys
import os
import shutil
import requests
import textwrap

# --- ANSI Color Codes ---
class Color:
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    DIM = '\033[2m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def slow_type(text, color=Color.GREEN, speed=0.02):
    """Types out text letter by letter with a blinking cursor."""
    for char in text:
        sys.stdout.write(f"{color}{char}{Color.RESET}")
        sys.stdout.flush()
        time.sleep(speed)
    
    # Blinking cursor effect at the end of the line
    for _ in range(2):
        sys.stdout.write(f"{Color.YELLOW}█{Color.RESET}")
        sys.stdout.flush()
        time.sleep(0.2)
        sys.stdout.write("\b \b") # Backspace the cursor
        sys.stdout.flush()
        time.sleep(0.2)
    print() # Move to next line

def fetch_lyrics(artist, title):
    """Calls the lyrics.ovh API to get real song lyrics."""
    url = f"https://api.lyrics.ovh/v1/{artist}/{title}"
    try:
        # Show a loading message
        print(f"{Color.DIM}Fetching lyrics from API...{Color.RESET}")
        response = requests.get(url, timeout=10)
        response.raise_for_status() # Check for HTTP errors
        
        data = response.json()
        lyrics = data.get('lyrics', '')
        
        if not lyrics:
            return None
        return lyrics.strip()
    except requests.exceptions.RequestException as e:
        return None

def draw_editor_ui(filename="lyrics.txt"):
    """Draws the top border for the editor."""
    terminal_size = shutil.get_terminal_size()
    width = min(terminal_size.columns, 70)

    print(f"{Color.DIM}┌─[ {Color.CYAN}{Color.BOLD}{filename}{Color.RESET}{Color.DIM} ]──( {Color.YELLOW}API FETCH{Color.DIM} ){'─' * (width - 28)}┐{Color.RESET}")
    print(f"{Color.DIM}│{Color.RESET}{' ' * (width - 1)}{Color.DIM}│{Color.RESET}")

def main():
    clear_screen()
    
    print(f"{Color.BOLD}{Color.MAGENTA}Terminal Lyric Fetcher{Color.RESET}")
    artist = input(f"{Color.CYAN}Enter Artist Name: {Color.RESET}")
    title = input(f"{Color.CYAN}Enter Song Title: {Color.RESET}")
    
    clear_screen()
    
    # 1. Fetch the lyrics
    lyrics = fetch_lyrics(artist, title)
    
    if not lyrics:
        # If API fails or song isn't found
        draw_editor_ui("error.txt")
        print(f"{Color.DIM}│ {Color.RESET}", end="")
        slow_type(f"Error: Could not find lyrics for '{title}' by '{artist}'.", color=Color.RED, speed=0.03)
        print(f"{Color.DIM}│ {Color.RESET}", end="")
        slow_type("Check your spelling or try another song.", color=Color.RED, speed=0.03)
        print(f"{Color.DIM}└{'─' * 68}┘{Color.RESET}")
        return

    # 2. Set up the Editor UI
    filename = f"{artist.replace(' ', '_')}_{title.replace(' ', '_')}.txt"
    draw_editor_ui(filename)
    
    # 3. Print lyrics with typing effect
    terminal_size = shutil.get_terminal_size()
    max_width = min(terminal_size.columns - 4, 65) # Keep lines inside the box
    
    # Split lyrics into lines, and wrap long lines so they fit in the terminal
    raw_lines = lyrics.split('\n')
    wrapped_lines = []
    for line in raw_lines:
        if line.strip() == "":
            wrapped_lines.append("")
        else:
            wrapped_lines.extend(textwrap.wrap(line, width=max_width))

    print(f"{Color.DIM}│ {Color.RESET}", end="")
    
    for line in wrapped_lines:
        if line == "":
            print(f"{Color.DIM}│{Color.RESET}")
            print(f"{Color.DIM}│ {Color.RESET}", end="")
            time.sleep(0.1)
        else:
            slow_type(line, color=Color.GREEN, speed=0.015)
            print(f"{Color.DIM}│ {Color.RESET}", end="")
            time.sleep(0.05)

    # 4. Close the UI box
    print(f"{Color.DIM}└{'─' * 68}┘{Color.RESET}")
    print(f"{Color.MAGENTA}-- LYRICS LOADED --{Color.RESET}  {Color.DIM}Press Ctrl+C to exit.{Color.RESET}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Color.RED}\n[Exited Editor]{Color.RESET}")