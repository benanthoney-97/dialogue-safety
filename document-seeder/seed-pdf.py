import os
import sys
import json
import nest_asyncio
from dotenv import load_dotenv
from llama_parse import LlamaParse  # <--- NEW IMPORT
from llama_index.core.node_parser import MarkdownNodeParser
from llama_index.embeddings.openai import OpenAIEmbedding
from supabase import create_client, Client

# 0. Apply nest_asyncio (Required for LlamaParse in some envs)
nest_asyncio.apply()

# 1. Load Environment Variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LLAMA_CLOUD_API_KEY = os.getenv("LLAMA_CLOUD_API_KEY") # <--- NEW KEY

if not SUPABASE_URL or not SUPABASE_KEY or not LLAMA_CLOUD_API_KEY:
    print("Error: Missing keys (Supabase or LlamaCloud) in .env")
    sys.exit(1)

# 2. Initialize Clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
embed_model = OpenAIEmbedding(model="text-embedding-3-small")

def seed_pdf(file_path: str, provider_id: int):
    print(f"🔵 Starting LlamaParse Ingest for: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return

    # --- Step 1: Parse PDF with LlamaParse (Cloud) ---
    # result_type="markdown" is best for RAG because it keeps structure
    parser = LlamaParse(
        api_key=LLAMA_CLOUD_API_KEY,
        result_type="markdown",
        verbose=True
    )
    
    # This sends the file to the cloud and returns parsed markdown text
    documents = parser.load_data(file_path)
    print(f"   ✅ LlamaParse returned {len(documents)} document objects.")

    # --- Step 2: Create 'provider_documents' Record ---
    file_name = os.path.basename(file_path)
    
    document_payload = {
        "provider_id": provider_id,
        "title": file_name,
        "source_url": file_path, 
        "media_type": "pdf"
    }

    try:
        response = supabase.table("provider_documents").insert(document_payload).execute()
        new_doc = response.data[0]
        document_id = new_doc['id']
        print(f"   ✅ Created Document ID: {document_id}")
    except Exception as e:
        print(f"❌ Error inserting document: {e}")
        return

    # --- Step 3: Chunking (Specialized for Markdown) ---
    # Since LlamaParse gives us Markdown, we use MarkdownNodeParser 
    # This chunks intelligently by headers (#, ##) rather than just random sentences.
    node_parser = MarkdownNodeParser()
    nodes = node_parser.get_nodes_from_documents(documents)
    
    print(f"   ⚡ Split into {len(nodes)} semantic chunks...")

    knowledge_rows = []

    for i, node in enumerate(nodes):
        content = node.get_content()
        
        if not content.strip():
            continue # Skip empty chunks

        # Create Embedding
        vector = embed_model.get_text_embedding(content)
        
        # Extract Metadata
        metadata = node.metadata 
        
        # Prepare Row
        row = {
            "provider_id": provider_id,
            "document_id": document_id,
            "content": content,
            "embedding": vector,
            "metadata": json.loads(json.dumps(metadata))
        }
        knowledge_rows.append(row)
        
        # Batch Insert (Safety check for large docs)
        if len(knowledge_rows) >= 10:
            supabase.table("provider_knowledge").insert(knowledge_rows).execute()
            sys.stdout.write(f"\r      Inserted chunks {i+1}/{len(nodes)}")
            sys.stdout.flush()
            knowledge_rows = []

    # Insert remaining
    if knowledge_rows:
        supabase.table("provider_knowledge").insert(knowledge_rows).execute()

    print(f"\n✅ Successfully ingested {file_name} using LlamaParse!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python pdf-seeder.py <path_to_pdf> <provider_id>")
    else:
        seed_pdf(sys.argv[1], int(sys.argv[2]))