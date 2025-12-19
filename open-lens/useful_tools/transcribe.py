import os
import json
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

# --- CONFIGURATION ---

# 1. Load Environment Variables
# We assume .env is one level up (in the project root)
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# 2. Get API Key safely
api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    print("❌ ERROR: Could not find OPENAI_API_KEY in your .env file.")
    print(f"ℹ️  Looking for .env at: {env_path.resolve()}")
    exit(1)

client = OpenAI(api_key=api_key)

INPUT_DIR = "audio_output"
OUTPUT_DIR = "transcripts"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def transcribe_file(filepath):
    filename = os.path.basename(filepath)
    print(f"🎤 Transcribing: {filename}...")
    
    try:
        audio_file = open(filepath, "rb")
        transcript = client.audio.transcriptions.create(
            model="whisper-1", 
            file=audio_file, 
            response_format="verbose_json", 
            timestamp_granularities=["segment"]
        )
        
        output_path = os.path.join(OUTPUT_DIR, f"{filename}.json")
        
        with open(output_path, 'w') as f:
            data = {
                "filename": filename,
                "text": transcript.text,
                "segments": [
                    {
                        "start": seg.start,
                        "end": seg.end,
                        "text": seg.text.strip()
                    } 
                    for seg in transcript.segments
                ]
            }
            json.dump(data, f, indent=2)
            
        print(f"✅ Saved transcript to: {output_path}")

    except Exception as e:
        print(f"❌ Error: {e}")

# --- EXECUTION ---
if __name__ == "__main__":
    print(f"📂 Scanning '{INPUT_DIR}' for audio files...")
    
    # Check if input dir exists
    if not os.path.exists(INPUT_DIR):
        print(f"❌ Error: Input directory '{INPUT_DIR}' not found.")
        exit(1)

    files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".mp3")]
    
    if not files:
        print("⚠️ No MP3 files found. Did you run extract_audio.py?")
    
    for file in files:
        full_path = os.path.join(INPUT_DIR, file)
        transcribe_file(full_path)
        
    print("\n✨ All transcripts generated!")