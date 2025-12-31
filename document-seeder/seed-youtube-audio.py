import os
import sys
import glob
from dotenv import load_dotenv
import yt_dlp
from openai import OpenAI
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

def download_audio(url):
    """
    Downloads audio using yt-dlp.
    We try to get m4a or mp3 at the lowest quality to keep file size < 25MB (OpenAI limit).
    """
    print(f"   ⏳ Downloading audio stream...")
    
    # Configuration to get smallest audio file possible
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': 'temp_audio.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '32', # Low bitrate to save size
        }],
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Get metadata first
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'Unknown YouTube Video')
            video_id = info.get('id', 'unknown')
            thumbnail = info.get('thumbnail', None)
            
            # Find the file we just downloaded
            files = glob.glob("temp_audio.mp3")
            if files:
                return files[0], title, video_id, thumbnail
            
            # Fallback if mp3 conversion failed (maybe no ffmpeg)
            files = glob.glob("temp_audio.*")
            if files:
                return files[0], title, video_id, thumbnail

    except Exception as e:
        print(f"   ❌ Download Error: {e}")
        return None, None, None, None

    return None, None, None, None

def transcribe_audio_with_timestamps(file_path):
    """
    Sends audio file to OpenAI Whisper asking for verbose JSON 
    to get timestamp segments.
    """
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"   🎙️  Transcribing with Whisper ({file_size_mb:.2f} MB)...")

    if file_size_mb > 25:
        print("   ❌ Error: File is larger than OpenAI's 25MB limit.")
        return None

    try:
        audio_file = open(file_path, "rb")
        transcript = openai_client.audio.transcriptions.create(
            model="whisper-1", 
            file=audio_file,
            response_format="verbose_json", # <--- CRITICAL CHANGE FOR TIMESTAMPS
            timestamp_granularities=["segment"]
        )
        return transcript.segments # Returns list of objects (text, start, end)
    except Exception as e:
        print(f"   ❌ Whisper Error: {e}")
        return None

def seed_youtube_audio(url, provider_id):
    print(f"📺 Processing YouTube URL: {url}")
    
    # 1. Download Audio & Metadata
    audio_path, title, video_id, cover_image = download_audio(url)
    
    if not audio_path:
        print("   ❌ Failed to download audio. (Do you have ffmpeg installed?)")
        return

    # 2. Transcribe (Get Segments)
    segments = transcribe_audio_with_timestamps(audio_path)
    
    # Clean up file immediately
    if os.path.exists(audio_path):
        os.remove(audio_path)
    
    if not segments:
        return

    print(f"   📄 Transcript Segments: {len(segments)}")
    print(f"   📄 Title: {title}")

    # 3. Create Document in DB
    doc_payload = {
        "provider_id": provider_id,
        "title": title,
        "source_url": url,
        "cover_image_url": cover_image,
        "media_type": "video" # <--- UPDATED to standard type
    }

    try:
        res = supabase.table("provider_documents").insert(doc_payload).execute()
        if hasattr(res, 'data') and len(res.data) > 0:
            document_id = res.data[0]['id']
        else:
             document_id = res.data[0]['id']
    except Exception as e:
        print(f"   ❌ DB Error: {e}")
        return

    # 4. Custom Chunking & Vectorising
    print(f"   ⚡ Chunking & Vectorising...")
    
    knowledge_rows = []
    current_chunk_text = ""
    chunk_start_time = 0
    
    # Aggregate segments into ~1000 char chunks
    for i, seg in enumerate(segments):
        # Handle Object vs Dict access (OpenAI SDK returns objects)
        text = seg.text if hasattr(seg, 'text') else seg['text']
        start = seg.start if hasattr(seg, 'start') else seg['start']
        end = seg.end if hasattr(seg, 'end') else seg['end']
        
        # Start new chunk timer
        if current_chunk_text == "":
            chunk_start_time = start
            
        current_chunk_text += text + " "
        
        # If chunk is large enough OR last segment
        if len(current_chunk_text) > 1000 or i == len(segments) - 1:
            
            vector = embed_model.get_text_embedding(current_chunk_text)
            
            row = {
                "provider_id": provider_id,
                "document_id": document_id,
                "content": current_chunk_text.strip(),
                "embedding": vector,
                "metadata": {
                    "source": url, 
                    "video_id": video_id,
                    "timestampStart": int(chunk_start_time), # Saved as integer seconds
                    "timestampEnd": int(end)
                }
            }
            knowledge_rows.append(row)
            
            # Reset
            current_chunk_text = ""

    if knowledge_rows:
        try:
            batch_size = 20
            for i in range(0, len(knowledge_rows), batch_size):
                batch = knowledge_rows[i:i + batch_size]
                supabase.table("provider_knowledge").insert(batch).execute()
            print(f"   ✅ Successfully saved {len(knowledge_rows)} chunks with timestamps!")
        except Exception as e:
             print(f"   ❌ DB Insert Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python seed-youtube-audio.py \"<youtube_url>\" <provider_id>")
    else:
        seed_youtube_audio(sys.argv[1], int(sys.argv[2]))