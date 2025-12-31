import os
import sys
import json
import re
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client
from llama_index.embeddings.openai import OpenAIEmbedding

# 1. SETUP
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
load_dotenv(os.path.join(parent_dir, '.env'))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("PLASMO_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
embed_model = OpenAIEmbedding(model="text-embedding-3-small")

# ⚠️ CONFIGURATION
PROVIDER_ID = 12  # Ensure this matches your data
TARGET_URL = "https://seedlegals.com/resources/what-is-seis-eis-an-essential-read-for-uk-startups/"
OUTPUT_FILE = os.path.join(parent_dir, "web-embed", "seedlegals_mirror.html")

def generate_mirror():
    print(f"🌍 Fetching: {TARGET_URL}")
    
    # 1. FETCH THE LIVE PAGE (With "Stealth" Headers)
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Referer": "https://www.google.com/",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1"
    }

    try:
        response = requests.get(TARGET_URL, headers=headers, timeout=10)
        response.raise_for_status()
        html_content = response.text
    except Exception as e:
        print(f"❌ Failed to fetch URL (Bot Protection): {e}")
        return

    # 2. PARSE TEXT
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Target specific content areas to reduce noise
    content_area = soup.find('div', class_='elementor-section-wrap') or soup.body
    
    clean_sentences = []
    
    print("⚡ Analyzing Page Content...")
    raw_text = content_area.get_text(" ", strip=True) 
    potential_sentences = re.split(r'(?<=[.!?])\s+', raw_text)
    
    for s in potential_sentences:
        clean = s.strip()
        if len(clean) > 30 and len(clean) < 150:
            clean_sentences.append(clean)
    
    clean_sentences = list(set(clean_sentences))[:50]
    print(f"   Found {len(clean_sentences)} candidate sentences.")

    # 3. GENERATE MATCHES
    matches_found = []
    batch_size = 20
    
    print(f"⚡ Matching against Supabase...")

    for i in range(0, len(clean_sentences), batch_size):
        batch = clean_sentences[i:i+batch_size]
        try:
            vectors = embed_model.get_text_embedding_batch(batch)
            
            for j, vector in enumerate(vectors):
                sentence = batch[j]
                
                # LOWERED THRESHOLD TO 0.50
                resp = supabase.rpc("match_provider_knowledge", {
                    "query_embedding": vector,
                    "match_threshold": 0.50, 
                    "match_count": 1,
                    "filter_provider_id": PROVIDER_ID
                }).execute()

                if resp.data:
                    match_data = resp.data[0]
                    # Fetch Metadata
                    details = supabase.table("provider_knowledge")\
                        .select("metadata")\
                        .eq("id", match_data['id'])\
                        .single().execute()
                    
                    if details.data:
                        meta = details.data.get('metadata', {})
                        url = meta.get('source') or meta.get('source_url')
                        ts = meta.get('timestampStart', 0)
                        
                        if url:
                            matches_found.append({
                                "phrase": sentence,
                                "video_url": f"{url}#t={ts}",
                                "confidence": match_data['similarity']
                            })
                            print(f"   ✅ Match found: ({match_data['similarity']:.2f}) -> '{sentence[:30]}...'")
                            
        except Exception as e:
            print(f"   ⚠️ Batch error: {e}")

    print(f"🖌️  Injecting {len(matches_found)} matches into HTML...")

# 4. ROBUST JAVASCRIPT INJECTION (Floating Player + Fix for Hyphens)
    script_content = f"""
    <script>
    const MATCH_MAP = {json.dumps(matches_found)};
    
    document.addEventListener("DOMContentLoaded", function() {{
        console.log("🚀 SeedLegals Smart Embed Active");

        // 1. INJECT CSS FOR THE FLOATING PLAYER
        const style = document.createElement('style');
        style.innerHTML = `
            .sl-smart-link {{
                border-bottom: 2px solid #00bfa5;
                background-color: rgba(0, 191, 165, 0.15);
                cursor: pointer;
                color: #000;
                transition: all 0.2s ease;
            }}
            .sl-smart-link:hover {{ 
                background-color: #00bfa5; 
                color: white;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }}
            .sl-smart-link::after {{
                content: " ▶";
                font-size: 0.8em;
                color: #00bfa5; 
            }}
            .sl-smart-link:hover::after {{ color: white; }}

            /* The Floating Modal */
            #sl-video-modal {{
position: fixed;
                bottom: 20px;
                right: 20px;
                width: 400px;
                height: 250px;
                background: black; /* Changed to black so any tiny gap isn't white */
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                border-radius: 12px;
                z-index: 99999;
                display: none;
                overflow: hidden;
                animation: slideUp 0.3s ease-out;
            }}
#sl-video-modal iframe {{ 
                width: 100%; 
                height: 100%; 
                border: none; 
                display: block; /* <--- CRITICAL FIX */
                margin: 0;
                padding: 0;
            }}
                        #sl-close-btn {{
                position: absolute;
                top: 10px;
                right: 10px;
                background: rgba(0,0,0,0.6);
                color: white;
                border: none;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                cursor: pointer;
                font-weight: bold;
                line-height: 24px;
                text-align: center;
                font-family: sans-serif;
                z-index: 100000;
            }}
            @keyframes slideUp {{
                from {{ transform: translateY(20px); opacity: 0; }}
                to {{ transform: translateY(0); opacity: 1; }}
            }}
        `;
        document.head.appendChild(style);

        // 2. CREATE THE MODAL CONTAINER
        const modal = document.createElement('div');
        modal.id = 'sl-video-modal';
        modal.innerHTML = `
            <button id="sl-close-btn">×</button>
            <div id="sl-iframe-container" style="width:100%; height:100%;"></div>
        `;
        document.body.appendChild(modal);

        document.getElementById('sl-close-btn').onclick = () => {{
            modal.style.display = 'none';
            document.getElementById('sl-iframe-container').innerHTML = ''; 
        }};

        const getEmbedUrl = (url) => {{
            if (url.includes('player.vimeo.com')) return url;
            const videoId = url.match(/vimeo\\.com\\/(\\d+)/);
            if (!videoId) return url;
            const timeMatch = url.match(/#t=(\\d+)/);
            const timeParam = timeMatch ? `#t=${{timeMatch[1]}}s` : '';
            return `https://player.vimeo.com/video/${{videoId[1]}}?autoplay=1&title=0&byline=0${{timeParam}}`;
        }};

        const normalize = (str) => str.replace(/\\s+/g, ' ').trim();

        const contentWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while(node = contentWalker.nextNode()) textNodes.push(node);

        MATCH_MAP.forEach(match => {{
            if (!match.phrase) return;
            const targetPhrase = normalize(match.phrase);

            for(let n of textNodes) {{
                const parent = n.parentElement;
                if (!parent || parent.tagName.match(/SCRIPT|STYLE|A|BUTTON|NOSCRIPT/)) continue;
                if (parent.getAttribute('data-sl-scanned') === 'true') continue;

                const currentText = normalize(n.nodeValue);
                
                if(currentText.includes(targetPhrase) && targetPhrase.length > 0) {{
                    
                    const openVideo = (e) => {{
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const embedUrl = getEmbedUrl(match.video_url);
                        console.log("Playing:", embedUrl);
                        
                        const container = document.getElementById('sl-iframe-container');
                        container.innerHTML = `<iframe src="${{embedUrl}}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
                        
                        const modal = document.getElementById('sl-video-modal');
                        modal.style.display = 'block';
                    }};

                    if (currentText === targetPhrase) {{
                        // Case A: Exact Match
                        const span = document.createElement('span');
                        span.className = 'sl-smart-link';
                        span.textContent = match.phrase;
                        span.onclick = openVideo;
                        parent.replaceChild(span, n);
                        parent.setAttribute('data-sl-scanned', 'true');
                    }} else {{
                        // Case B: Partial Match
                        const safePhrase = match.phrase.replace(/[.*+?^${{}}()|[\\]\\\\]/g, '\\\\$&');
                        const re = new RegExp(safePhrase, 'i');
                        
                        // FIX: Use underscores so JS variable is valid
                        const matchId = 'sl_match_' + Math.floor(Math.random() * 100000);
                        window[matchId] = openVideo; 
                        
                        const newHTML = parent.innerHTML.replace(re, (m) => {{
                            return `<span class="sl-smart-link" onclick="${{matchId}}(event)">${{m}}</span>`;
                        }});
                        
                        parent.innerHTML = newHTML;
                        parent.setAttribute('data-sl-scanned', 'true');
                    }}
                    break; 
                }}
            }}
        }});
    }});
    </script>
    """

    # Add <base> tag to fix images/css
    base_tag = f"<base href='{TARGET_URL}'>"
    if "<head>" in html_content:
        final_html = html_content.replace("<head>", f"<head>{base_tag}")
    else:
        final_html = f"{base_tag}{html_content}"

    if "</body>" in final_html:
        final_html = final_html.replace("</body>", script_content + "</body>")
    else:
        final_html = final_html + script_content

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(final_html)

    print(f"\n🎉 DONE! Mirror saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_mirror()