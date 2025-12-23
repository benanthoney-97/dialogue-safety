import os
from moviepy import VideoFileClip 

# --- CONFIGURATION ---
LOCAL_VIDEO_PATH = "Emotional_Intelligence_Workshop.mp4" 
OUTPUT_DIR = "audio_output"

# Ensure output directory exists
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def extract_local_audio(video_path):
    if not os.path.exists(video_path):
        print(f"\n⚠️  Could not find local file: {video_path}")
        print("   -> Make sure the file is in the same folder as this script, or provide the full path.")
        return

    print(f"\n🎙️  Extracting audio from local file (32k bitrate)...")
    try:
        video = VideoFileClip(video_path)
        
        # Create output filename based on input video name
        base_name = os.path.splitext(os.path.basename(video_path))[0]
        output_path = os.path.join(OUTPUT_DIR, f"{base_name}.mp3")
        
        # Write audio file
        video.audio.write_audiofile(output_path, bitrate="32k") 
        
        video.close()
        print(f"✅ Saved to: {output_path}")
        
    except Exception as e:
        print(f"❌ Error extracting local audio: {e}")

if __name__ == "__main__":
    if LOCAL_VIDEO_PATH:
        extract_local_audio(LOCAL_VIDEO_PATH)
    else:
        print("⚠️ No file path provided in LOCAL_VIDEO_PATH.")