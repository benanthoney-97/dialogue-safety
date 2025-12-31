import os
import yt_dlp
from pathlib import Path
import re

# --- CONFIGURATION ---
# Output folder
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "audio_output"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def clean_filename(title):
    # Remove special chars
    clean = re.sub(r'[\\/*?:"<>|]', "", title)
    return clean[:100]

def progress_hook(d):
    if d['status'] == 'downloading':
        print(f"   ⬇️  {d.get('_percent_str', '0%')} | {d.get('_eta_str', '00:00')} left", end='\r')
    if d['status'] == 'finished':
        print(f"\n   ✅ Download complete. Processing audio...")

def download_media(url):
    print(f"🌍 Fetching metadata for: {url}")

    # Configuration for yt-dlp
    ydl_opts = {
        'format': 'bestaudio/best',  # Get best audio
        'outtmpl': str(OUTPUT_DIR / '%(title)s.%(ext)s'), # Save path
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True,
        # 'password': 'YOUR_PASSWORD', # Uncomment if downloading private Vimeo videos
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'Unknown Title')
            print(f"🎉 Successfully saved: {title}.mp3")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    url = input("🔗 Enter YouTube or Vimeo URL: ").strip()
    if url:
        download_media(url)
    else:
        print("❌ No URL provided.")