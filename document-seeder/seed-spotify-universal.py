import os
import sys
import requests
import feedparser
import cloudscraper
from bs4 import BeautifulSoup
from difflib import SequenceMatcher
from dotenv import load_dotenv
from openai import OpenAI
from pydub import AudioSegment
from llama_index.embeddings.openai import OpenAIEmbedding
from supabase import create_client, Client

# 1. Setup
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY or not OPENAI_API_KEY:
    print("Error: Database or OpenAI keys missing.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
embed_model = OpenAIEmbedding(model="text-embedding-3-small")
openai_client = OpenAI(api_key=OPENAI_API_KEY)
scraper = cloudscraper.create_scraper(browser='chrome')

def clean_text(text):
    if not text: return ""
    return text.replace(" | Spotify", "").strip()

def get_spotify_metadata(url):
    print(f"   🔎 Scraping Spotify Metadata...")
    try:
        response = scraper.get(url)
        if response.status_code != 200:
            return None, None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        og_title = soup.find("meta", property="og:title")
        ep_title = og_title["content"] if og_title else ""
        page_title = soup.title.string if soup.title else ""
        
        show_name = ""
        if not ep_title and page_title:
            if " - " in page_title:
                parts = page_title.split(" - ")
                ep_title = parts[0].strip()
                show_name = parts[1].split("|")[0].strip()
        
        if not show_name:
             show_name = page_title.split(" - ")[-1].split("|")[0].strip() if " - " in page_title else page_title.split("|")[0].strip()

        ep_title = clean_text(ep_title)
        
        if not ep_title:
            return None, None
            
        print(f"      📍 Detected Episode: {ep_title[:50]}...")
        print(f"      📍 Detected Show:    {show_name}")
        return show_name, ep_title

    except Exception as e:
        print(f"   ❌ Scraping Error: {e}")
        return None, None

def find_rss_feed(show_name):
    print(f"   📡 Searching Directory for '{show_name}'...")
    clean_name = show_name.split(':')[0].strip()
    try:
        search_url = f"https://itunes.apple.com/search?term={clean_name}&media=podcast&limit=5"
        res = requests.get(search_url).json()
        if res['resultCount'] == 0: return None
            
        best_feed = None
        best_ratio = 0
        for result in res['results']:
            ratio = SequenceMatcher(None, show_name.lower(), result['collectionName'].lower()).ratio()
            if ratio > 0.8: return result['feedUrl']
            if ratio > best_ratio:
                best_ratio = ratio
                best_feed = result['feedUrl']
        return best_feed
    except Exception as e:
        return None

def find_audio_url(feed_url, target_title):
    print(f"   📖 Parsing RSS Feed...")
    feed = feedparser.parse(feed_url)
    target_lower = target_title.lower()
    
    best_entry = None
    best_score = 0
    
    for entry in feed.entries:
        rss_title_lower = entry.title.lower()
        if target_lower in rss_title_lower or rss_title_lower in target_lower:
            return get_mp3_link(entry), entry.title
        ratio = SequenceMatcher(None, target_lower, rss_title_lower).ratio()
        if ratio > best_score:
            best_score = ratio
            best_entry = entry

    if best_entry and best_score > 0.65:
        return get_mp3_link(best_entry), best_entry.title
    return None, None

def get_mp3_link(entry):
    for link in entry.links:
        if link.type == 'audio/mpeg' or link.href.endswith('.mp3'):
            return link.href
    return None

def download_and_compress(mp3_url):
    print(f"   ⬇️  Downloading Audio...")
    raw_filename = "temp_raw.mp3"
    compressed_filename = "temp_compressed.mp3"
    try:
        with requests.get(mp3_url, stream=True) as r:
            r.raise_for_status()
            with open(raw_filename, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        
        file_size_mb = os.path.getsize(raw_filename) / (1024 * 1024)
        print(f"      📦 Compressing {file_size_mb:.1f}MB file...")
        
        audio = AudioSegment.from_file(raw_filename)
        audio = audio.set_channels(1)
        audio.export(compressed_filename, format="mp3", bitrate="32k")
        
        os.remove(raw_filename)
        return compressed_filename
    except Exception as e:
        if os.path.exists(raw_filename): os.remove(raw_filename)
        return None

# --- UPDATED: Use verbose_json to get timestamps ---
def transcribe_with_timestamps(file_path):
    print(f"   🎙️  Transcribing (Verbose)...")
    try:
        with open(file_path, "rb") as audio_file:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file,
                response_format="verbose_json", # <--- CRITICAL CHANGE
                timestamp_granularities=["segment"]
            )
        return transcript.segments # Returns list of objects with start, end, text
    except Exception as e:
        print(f"      ❌ Transcription Error: {e}")
        return None

def get_canonical_url(url):
    """
    Follows redirects to find the real Spotify URL.
    """
    try:
        response = requests.head(url, allow_redirects=True)
        final_url = response.url
        # Clean specific Spotify tracking params
        if "spotify.com" in final_url and "?" in final_url:
            return final_url.split('?')[0]
        return final_url
    except:
        return url

def seed_spotify_universal(url, provider_id):
    # 0. Resolve the true URL immediately
    final_url = get_canonical_url(url)
    print(f"🎧 Processing Spotify URL: {final_url}")
    
    # 1. Metadata
    show_name, ep_title = get_spotify_metadata(final_url)
    if not show_name or not ep_title: return

    # 2. RSS Feed
    feed_url = find_rss_feed(show_name)
    if not feed_url: return

    # 3. Audio Link
    mp3_url, rss_title = find_audio_url(feed_url, ep_title)
    if not mp3_url: return

    # 4. Download & Compress
    local_file = download_and_compress(mp3_url)
    if not local_file: return

    # 5. Transcribe (Get Segments)
    segments = transcribe_with_timestamps(local_file)
    if os.path.exists(local_file): os.remove(local_file)
    if not segments: return

    # 6. Database
    print(f"   💾 Saving Document...")
    try:
        # Check duplicate
        existing = supabase.table("provider_documents").select("id").eq("source_url", final_url).execute()
        if existing.data:
            print("      ⚠️ Document already exists. Skipping.")
            return

        res = supabase.table("provider_documents").insert({
            "provider_id": provider_id,
            "title": rss_title,
            "source_url": final_url, # Saves the CLEAN url
            "media_type": "audio"    # Standardized type
        }).execute()
        
        doc_id = res.data[0]['id'] if res.data else None
    except Exception as e:
        print(f"   ❌ DB Error: {e}")
        return
# 7. CHUNKING WITH TIMESTAMPS
    print(f"   ⚡ Processing {len(segments)} segments...")
    
    rows = []
    
    current_chunk_text = ""
    chunk_start_time = 0
    
    # We aggregate small Whisper segments into larger chunks (~1000 chars)
    for i, seg in enumerate(segments):
        # FIX: Use dot notation for OpenAI objects
        text = seg.text  # was seg['text']
        start = seg.start # was seg['start']
        end = seg.end     # was seg['end']
        
        # If starting a new chunk, set the start time
        if current_chunk_text == "":
            chunk_start_time = start
            
        current_chunk_text += text + " "
        
        # If chunk is big enough OR it's the last segment
        if len(current_chunk_text) > 1000 or i == len(segments) - 1:
            
            # Embed
            vec = embed_model.get_text_embedding(current_chunk_text)
            
            # Save
            rows.append({
                "provider_id": provider_id,
                "document_id": doc_id,
                "content": current_chunk_text.strip(),
                "embedding": vec,
                "metadata": {
                    "source": final_url,
                    "timestampStart": int(chunk_start_time), # Save as integer seconds
                    "timestampEnd": int(end)
                }
            })
            
            # Reset
            current_chunk_text = ""
    
    # Batch Insert
    if rows:
        batch_size = 20
        print(f"   💾 Inserting {len(rows)} chunks with timestamps...")
        for i in range(0, len(rows), batch_size):
            try:
                supabase.table("provider_knowledge").insert(rows[i:i+batch_size]).execute()
            except Exception as e:
                print(f"Error inserting batch: {e}")
                
        print(f"   ✅ Success! Saved {len(rows)} timestamped chunks.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python seed-spotify-universal.py \"<url>\" <provider_id>")
    else:
        seed_spotify_universal(sys.argv[1], int(sys.argv[2]))