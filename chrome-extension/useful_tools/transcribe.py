import os
import json
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

# Try importing pydub for compression
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    print("⚠️ Warning: 'pydub' not installed. Large files (>25MB) will fail.")

# --- CONFIGURATION ---

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load Environment Variables
env_path = PROJECT_ROOT / '.env'
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("❌ ERROR: Could not find OPENAI_API_KEY in your .env file.")
    exit(1)

client = OpenAI(api_key=api_key)

# Directories
INPUT_DIR = PROJECT_ROOT / "audio_output"
OUTPUT_DIR = PROJECT_ROOT / "transcripts"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def compress_audio(filepath):
    """
    Compresses audio to ensure it is under the 25MB limit.
    Returns the path to the temporary compressed file.
    """
    if not PYDUB_AVAILABLE:
        raise Exception("pydub library is required to compress large files. Run: pip3 install pydub")

    print(f"   📉 File > 25MB. Compressing audio to shrink size...")
    
    try:
        audio = AudioSegment.from_file(filepath)
        
        # Convert to Mono (1 channel)
        audio = audio.set_channels(1)
        
        # Export as a temporary MP3 with 32k bitrate (More aggressive compression)
        # 32k is sufficient for speech recognition and creates very small files
        temp_path = filepath.with_suffix('.temp.mp3')
        audio.export(temp_path, format="mp3", bitrate="32k")
        
        new_size = os.path.getsize(temp_path)
        print(f"   ✅ Compressed: {new_size / 1024 / 1024:.2f} MB")
        
        # Safety check: If still > 25MB, warn the user (rare with 32k)
        if new_size > 25 * 1024 * 1024:
             print("   ⚠️ WARNING: File is STILL over 25MB even after compression. OpenAI might reject it.")
        
        return temp_path
    except Exception as e:
        print(f"   ❌ Compression failed: {e}")
        if "ffmpeg" in str(e).lower() or "no such file" in str(e).lower():
            print("      (Make sure you have installed ffmpeg: 'brew install ffmpeg')")
        return None

def transcribe_file(filepath):
    filename = os.path.basename(filepath)
    print(f"🎤 Transcribing: {filename}...")

    # Check file size (limit is strictly 26,214,400 bytes)
    file_size = os.path.getsize(filepath)
    limit_bytes = 25 * 1024 * 1024 
    
    actual_filepath = filepath
    is_temp_file = False

    # If file is too big, attempt compression
    if file_size > limit_bytes:
        print(f"   ⚠️ File size {file_size / 1024 / 1024:.2f}MB exceeds 25MB limit.")
        compressed_path = compress_audio(filepath)
        if compressed_path:
            actual_filepath = compressed_path
            is_temp_file = True
        else:
            print("   ⏩ Skipping this file due to size limit.")
            return

    try:
        audio_file = open(actual_filepath, "rb")
        
        transcript = client.audio.transcriptions.create(
            model="whisper-1", 
            file=audio_file, 
            response_format="verbose_json", 
            timestamp_granularities=["segment"]
        )
        
        # Determine output filename (strip .temp if needed)
        original_filename = filename.replace(".temp.mp3", ".mp3")
        output_filename = f"{original_filename}.json"
        output_path = OUTPUT_DIR / output_filename
        
        with open(output_path, 'w') as f:
            data = {
                "filename": original_filename,
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
        print(f"❌ Error processing {filename}: {e}")
    
    finally:
        # Cleanup temp file
        if is_temp_file and os.path.exists(actual_filepath):
            os.remove(actual_filepath)
            print("   🧹 Cleaned up temporary compressed file.")

# --- EXECUTION ---
if __name__ == "__main__":
    print(f"📂 Scanning '{INPUT_DIR}' for audio files...")

    if not os.path.exists(INPUT_DIR):
        print(f"❌ Error: Input directory not found at {INPUT_DIR}")
        exit(1)

    # Find all MP3 files
    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith('.mp3')]

    if not files:
        print("⚠️  No .mp3 files found in the output folder.")
    else:
        print(f"🔎 Found {len(files)} files to transcribe.")
        
        for file in files:
            full_path = INPUT_DIR / file
            # Skip temp files if they were left over
            if ".temp.mp3" in file:
                continue
            transcribe_file(full_path)
            
        print("\n✨ All files processed!")