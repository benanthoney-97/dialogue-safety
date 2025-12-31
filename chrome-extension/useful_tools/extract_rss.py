import os
import feedparser
import requests
from pathlib import Path
import re

# --- CONFIGURATION ---
# The Hungry Podcast RSS Feed (Example)
RSS_URL = "https://anchor.fm/s/51ed48f0/podcast/rss"
DOWNLOAD_LIMIT = 3  # How many recent episodes to download?

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "audio_output"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def clean_filename(title):
    # Remove special chars to make it filesystem safe
    clean = re.sub(r'[\\/*?:"<>|]', "", title)
    return clean[:100]  # Truncate if too long

def download_audio(url, title):
    filename = f"{clean_filename(title)}.mp3"
    filepath = OUTPUT_DIR / filename
    
    if os.path.exists(filepath):
        print(f"⏩ Skipping (already exists): {filename}")
        return

    print(f"⬇️  Downloading: {title}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"✅ Saved to: {filepath}")
    except Exception as e:
        print(f"❌ Error downloading {title}: {e}")

def process_feed(rss_url):
    print(f"📡 Parsing RSS Feed: {rss_url} ...")
    feed = feedparser.parse(rss_url)
    
    if feed.bozo:
        print("⚠️  Warning: Potential trouble parsing this feed (it might be malformed).")

    print(f"🎙️  Podcast: {feed.feed.get('title', 'Unknown Title')}")
    print(f"   Found {len(feed.entries)} episodes. Downloading the latest {DOWNLOAD_LIMIT}...\n")
    
    # Loop through the first 'DOWNLOAD_LIMIT' entries
    for i, entry in enumerate(feed.entries[:DOWNLOAD_LIMIT]):
        title = entry.title
        audio_url = None
        
        # Find the audio link in 'enclosures' or 'links'
        for link in entry.links:
            if link.type == 'audio/mpeg':
                audio_url = link.href
                break
        
        if audio_url:
            download_audio(audio_url, title)
        else:
            print(f"⚠️  No audio found for: {title}")

if __name__ == "__main__":
    process_feed(RSS_URL)
    print("\n✨ RSS Extraction Complete! Run 'transcribe.py' next.")