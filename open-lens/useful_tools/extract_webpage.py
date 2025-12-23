import os
import cloudscraper
from bs4 import BeautifulSoup
from pathlib import Path
import re

# --- CONFIGURATION ---
TARGET_URL = "https://seedlegals.com/resources/non-diluting-shares-explained-and-why-you-should-never-ever-issue-them-to-anyone/"

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "web_output"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def clean_filename(title):
    # Remove special chars to make it filesystem safe
    clean = re.sub(r'[\\/*?:"<>|]', "", title)
    return clean[:100].strip()

def extract_text_from_url(url):
    print(f"🌍 Fetching: {url} ...")
    
    # Create a scraper instance (mimics a real browser)
    scraper = cloudscraper.create_scraper()

    try:
        # Use scraper.get instead of requests.get
        response = scraper.get(url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')

        # 1. Get Title
        title = soup.title.string if soup.title else "Untitled_Webpage"
        print(f"   📄 Found Title: {title}")

        # 2. Remove Junk Elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe', 'svg']):
            element.decompose()

        # 3. Extract Text (Targeting main content areas first)
        content_area = (
            soup.find('main') or 
            soup.find('article') or 
            soup.find('div', class_='entry-content') or 
            soup.find('div', class_='post-content') or
            soup.body
        )
        
        if content_area:
            text = content_area.get_text(separator='\n')
        else:
            text = soup.get_text(separator='\n')

        # 4. Clean Whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        clean_text = '\n\n'.join(chunk for chunk in chunks if chunk)

        # 5. Save to File
        filename = f"{clean_filename(title)}.txt"
        filepath = OUTPUT_DIR / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"URL: {url}\n")
            f.write(f"TITLE: {title}\n")
            f.write("-" * 20 + "\n\n")
            f.write(clean_text)
            
        print(f"✅ Saved text to: {filepath}")

    except Exception as e:
        print(f"❌ Error extracting {url}: {e}")

if __name__ == "__main__":
    extract_text_from_url(TARGET_URL)