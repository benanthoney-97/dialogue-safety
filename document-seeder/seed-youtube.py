import os
import sys
import re
import cloudscraper
# --- CHANGED: Standard Import Style ---
from youtube_transcript_api import YouTubeTranscriptApi
# --------------------------------------
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.openai import OpenAIEmbedding
from supabase import create_client, Client

# 1. Setup
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Database keys missing.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
embed_model = OpenAIEmbedding(model="text-embedding-3-small")
scraper = cloudscraper.create_scraper(browser='chrome')

def get_video_id(url):
    """
    Extracts the 'v' parameter from a YouTube URL.
    """
    video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', url)
    if video_id_match:
        return video_id_match.group(1)
    return None

def get_video_metadata(video_id):
    """
    Fetches Title and Thumbnail URL.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        response = scraper.get(url)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            title_tag = soup.find("meta", property="og:title")
            title = title_tag["content"] if title_tag else soup.title.string.replace(" - YouTube", "")
            
            thumbnail = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
            
            return title, thumbnail
    except Exception as e:
        print(f"   ⚠️ Could not scrape metadata: {e}")
    
    return f"YouTube Video {video_id}", None

def seed_youtube(url, provider_id):
    print(f"📺 Processing YouTube URL: {url}")
    
    video_id = get_video_id(url)
    if not video_id:
        print("   ❌ Invalid YouTube URL")
        return

    # 2. Fetch Transcript
    print(f"   ⏳ Fetching transcript for ID: {video_id}...")
    full_text = ""
    try:
        # Using the imported class directly
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([item['text'] for item in transcript_list])
    except Exception as e:
        # Use simple string matching to handle specific error types without importing them
        err_msg = str(e)
        if "TranscriptsDisabled" in err_msg:
            print("   ❌ Subtitles are disabled for this video.")
        elif "NoTranscriptFound" in err_msg:
            print("   ❌ No English subtitles found.")
        else:
            print(f"   ❌ Transcript Error: {e}")
        return

    if not full_text or len(full_text) < 50:
        print("   ❌ Transcript is too short or empty.")
        return

    # 3. Get Metadata
    title, cover_image = get_video_metadata(video_id)
    print(f"   📄 Found: '{title}'")

    # 4. Create Document in DB
    doc_payload = {
        "provider_id": provider_id,
        "title": title,
        "source_url": url,
        "cover_image_url": cover_image,
        "media_type": "youtube"
    }

    try:
        res = supabase.table("provider_documents").insert(doc_payload).execute()
        # Handle Supabase V2 response format
        if hasattr(res, 'data') and len(res.data) > 0:
            document_id = res.data[0]['id']
        else:
            print(f"   ❌ DB Error: No ID returned. Response: {res}")
            return
            
    except Exception as e:
        print(f"   ❌ DB Insert Error: {e}")
        return

    # 5. Chunk and Vectorise
    print(f"   ⚡ Chunking {len(full_text)} characters...")
    
    text_splitter = SentenceSplitter(chunk_size=1024, chunk_overlap=50)
    nodes = text_splitter.split_text(full_text)
    
    knowledge_rows = []
    for node in nodes:
        vector = embed_model.get_text_embedding(node)
        
        row = {
            "provider_id": provider_id,
            "document_id": document_id,
            "content": node,
            "embedding": vector,
            "metadata": {"source": url, "video_id": video_id}
        }
        knowledge_rows.append(row)

    if knowledge_rows:
        try:
            batch_size = 20
            for i in range(0, len(knowledge_rows), batch_size):
                batch = knowledge_rows[i:i + batch_size]
                supabase.table("provider_knowledge").insert(batch).execute()
            print(f"   ✅ Successfully saved {len(knowledge_rows)} chunks!")
        except Exception as e:
             print(f"   ❌ DB Vector Insert Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python seed-youtube.py \"<youtube_url>\" <provider_id>")
    else:
        seed_youtube(sys.argv[1], int(sys.argv[2]))