import os
import sys
import requests
import feedparser
import cloudscraper
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

if not SUPABASE_URL or not SUPABASE_KEY or not OPENAI_API_KEY:
    print("Error: Database or OpenAI keys missing.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
embed_model = OpenAIEmbedding(model="text-embedding-3-small")
scraper = cloudscraper.create_scraper(browser='chrome')

def get_feed_url(base_url):
    """
    Intelligently finds the RSS feed for a Substack URL.
    """
    base_url = base_url.rstrip('/')
    
    # If user already gave the feed URL
    if base_url.endswith("/feed") or base_url.endswith(".xml"):
        return base_url
    
    # Try standard Substack feed location
    return f"{base_url}/feed"

def extract_image(entry):
    """
    Substack hides cover images in different places. We try them all.
    """
    # 1. Media Content (Standard RSS)
    if 'media_content' in entry:
        for media in entry.media_content:
            if 'url' in media and 'image' in media.get('medium', 'image'):
                return media['url']
    
    # 2. Enclosures
    if 'links' in entry:
        for link in entry.links:
            if link.get('rel') == 'enclosure' and 'image' in link.get('type', ''):
                return link['href']
                
    # 3. Parse HTML Content for first <img>
    if 'content' in entry:
        content_html = entry.content[0].value
        soup = BeautifulSoup(content_html, 'html.parser')
        img = soup.find('img')
        if img and img.get('src'):
            return img['src']
            
    return None

def clean_html_content(html_content):
    """
    Converts article HTML to clean text for embedding.
    Removes 'Subscribe' buttons and footer junk.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove junk tags
    for tag in soup(['script', 'style', 'button']):
        tag.decompose()
        
    # Remove common Substack footer classes (often 'subscription-widget-wrap')
    for div in soup.find_all("div", class_=lambda x: x and "subscribe" in x):
        div.decompose()

    text = soup.get_text(separator=' ')
    
    # Compress whitespace
    return " ".join(text.split())

def seed_substack(url, provider_id):
    feed_url = get_feed_url(url)
    print(f"📰 Processing Substack: {url}")
    print(f"   📡 Fetching Feed: {feed_url}...")
    
    try:
        # We use cloudscraper to fetch the XML because standard requests might get 403
        xml_response = scraper.get(feed_url).text
        feed = feedparser.parse(xml_response)
    except Exception as e:
        print(f"   ❌ Failed to fetch feed: {e}")
        return

    if not feed.entries:
        print("   ❌ No entries found. Is this a valid Substack URL?")
        return

    print(f"   ✅ Found {len(feed.entries)} articles. Processing...")

    count = 0
    for entry in feed.entries:
        # Limit to recent 20 to avoid blasting the DB (optional)
        if count >= 20: break 
        
        title = entry.title
        link = entry.link
        
        # Get content (Substack usually puts full HTML in 'content', summary in 'description')
        if 'content' in entry:
            raw_html = entry.content[0].value
        elif 'summary_detail' in entry:
            raw_html = entry.summary_detail.value
        else:
            raw_html = ""

        clean_text = clean_html_content(raw_html)
        
        if len(clean_text) < 200:
            print(f"      ⚠️  Skipping '{title}' (Content too short/Paywalled)")
            continue

        cover_image = extract_image(entry)
        
        print(f"      📄 Seeding: {title[:50]}...")

        # 1. DB Insert
        doc_payload = {
            "provider_id": provider_id,
            "title": title,
            "source_url": link,
            "cover_image_url": cover_image,
            "media_type": "document" # Use 'document' so it triggers text highlighting
        }

        try:
            res = supabase.table("provider_documents").insert(doc_payload).execute()
            doc_id = res.data[0]['id'] if res.data else None
            
            # If doc_id is None, it might be a duplicate or error
            if not doc_id: 
                # Optional: Handle duplicate logic here
                continue

        except Exception as e:
            # Often fails on unique constraint if you run it twice. Just skip.
            # print(f"      ⚠️  DB Insert/Skip: {e}") 
            continue

        # 2. Vectorise
        nodes = SentenceSplitter(chunk_size=1024, chunk_overlap=50).split_text(clean_text)
        
        rows = []
        for node in nodes:
            vec = embed_model.get_text_embedding(node)
            rows.append({
                "provider_id": provider_id,
                "document_id": doc_id,
                "content": node,
                "embedding": vec,
                "metadata": {"source": link, "author": entry.get('author', 'Substack')}
            })

        if rows:
            batch_size = 20
            for i in range(0, len(rows), batch_size):
                supabase.table("provider_knowledge").insert(rows[i:i+batch_size]).execute()
            count += 1
            
    print(f"   ✅ Successfully seeded {count} articles!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python seed-substack.py \"<substack_url>\" <provider_id>")
    else:
        seed_substack(sys.argv[1], int(sys.argv[2]))