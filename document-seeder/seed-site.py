import os
import sys
import time
import cloudscraper  # <--- The magic fix
import trafilatura
from bs4 import BeautifulSoup
from urllib.parse import urljoin
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

# Initialize the Scraper (pretends to be a real Desktop Chrome browser)
scraper = cloudscraper.create_scraper(browser='chrome')

VISITED_URLS = set()

def get_internal_links(base_url, current_url, html_content):
    if not html_content:
        return []
        
    soup = BeautifulSoup(html_content, 'html.parser')
    links = set()
    
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        
        if href.startswith(('mailto:', 'tel:', 'javascript:', '#')):
            continue

        full_url = urljoin(current_url, href)
        full_url = full_url.split('#')[0].split('?')[0]
        
        if full_url.endswith('/'):
            full_url = full_url[:-1]

        if full_url.startswith(base_url) and full_url not in VISITED_URLS:
            links.add(full_url)
            
    return links

def ingest_url(url, provider_id):
    clean_url_check = url[:-1] if url.endswith('/') else url
    if clean_url_check in VISITED_URLS:
        return []
    
    print(f"🕷️  Crawling: {url}")
    VISITED_URLS.add(clean_url_check)

    # --- CHANGED: Use Cloudscraper instead of Requests ---
    try:
        response = scraper.get(url) # Handles the 403 logic automatically
        if response.status_code != 200:
            print(f"   ❌ Status {response.status_code}: Skipping.")
            return []
        html_content = response.text
    except Exception as e:
        print(f"   ❌ Network Error: {e}")
        return []

    # Extract Clean Text
    main_text = trafilatura.extract(html_content, include_comments=False, include_tables=True)
    
    if not main_text:
        soup = BeautifulSoup(html_content, 'html.parser')
        for script in soup(["script", "style", "nav", "footer"]):
            script.decompose()
        main_text = soup.get_text(separator=' ', strip=True)

    if not main_text or len(main_text) < 50:
        print("   ⚠️  Skipping: Not enough content text found.")
        return get_internal_links(url, url, html_content)

    soup = BeautifulSoup(html_content, 'html.parser')
    page_title = soup.title.string.strip() if soup.title else url

    print(f"   📄 Indexing '{page_title}'...")
    
    doc_payload = {
        "provider_id": provider_id,
        "title": page_title,
        "source_url": url,
        "media_type": "web_page"
    }

    try:
        res = supabase.table("provider_documents").insert(doc_payload).execute()
        document_id = res.data[0]['id']
    except Exception as e:
        print(f"   ❌ DB Error: {e}")
        return []

    # Vectorise
    try:
        text_splitter = SentenceSplitter(chunk_size=1024, chunk_overlap=50)
        nodes = text_splitter.split_text(main_text)
        
        knowledge_rows = []
        for node in nodes:
            vector = embed_model.get_text_embedding(node)
            row = {
                "provider_id": provider_id,
                "document_id": document_id,
                "content": node,
                "embedding": vector,
                "metadata": {"source": url}
            }
            knowledge_rows.append(row)

        if knowledge_rows:
            batch_size = 10
            for i in range(0, len(knowledge_rows), batch_size):
                batch = knowledge_rows[i:i + batch_size]
                supabase.table("provider_knowledge").insert(batch).execute()
                
            print(f"   ✅ Saved {len(knowledge_rows)} chunks.")
            
    except Exception as e:
         print(f"   ❌ DB/Vector Error: {e}")

    return get_internal_links(url, url, html_content)

def crawl_site(start_url, provider_id):
    if start_url.endswith('/'):
        start_url = start_url[:-1]
        
    print(f"🚀 Starting Cloudscraper Crawl for: {start_url}")
    
    queue = [start_url]
    
    while queue:
        current_url = queue.pop(0)
        found_links = ingest_url(current_url, provider_id)
        
        for link in found_links:
            check_link = link[:-1] if link.endswith('/') else link
            if check_link not in VISITED_URLS and link not in queue:
                queue.append(link)
        
        time.sleep(2.0) # increased sleep slightly to be safer

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python seed-site.py <start_url> <provider_id>")
    else:
        start_arg = sys.argv[1]
        id_arg = int(sys.argv[2])
        crawl_site(start_arg, id_arg)