import os
import yt_dlp
from moviepy import VideoFileClip 

# --- CONFIGURATION ---
YOUTUBE_URLS = [
    "https://www.youtube.com/watch?v=eFAFRAzsdp0",
    "https://www.youtube.com/watch?v=w11ItSwGVi0"
]

LOCAL_VIDEO_PATH = "Emotional_Intelligence_Workshop.mp4" 
OUTPUT_DIR = "audio_output"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def download_youtube_audio(urls):
    print("\n⬇️  Attempting YouTube Download (32k bitrate)...")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '32', # 👈 CHANGED TO 32
        }],
        'outtmpl': f'{OUTPUT_DIR}/%(title)s.%(ext)s',
        'nocheckcertificate': True,
        'ignoreerrors': True,  
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download(urls)
    except Exception as e:
        print(f"❌ YouTube Download Failed: {e}")

def extract_local_audio(video_path):
    if not os.path.exists(video_path):
        print(f"\n⚠️  Could not find local file: {video_path}")
        return

    print(f"\n🎙️  Extracting audio from local file (32k bitrate)...")
    try:
        video = VideoFileClip(video_path)
        base_name = os.path.splitext(os.path.basename(video_path))[0]
        output_path = os.path.join(OUTPUT_DIR, f"{base_name}.mp3")
        
        # 👈 CHANGED TO 32k
        video.audio.write_audiofile(output_path, bitrate="32k") 
        video.close()
        print(f"✅ Saved to: {output_path}")
        
    except Exception as e:
        print(f"❌ Error extracting local audio: {e}")

if __name__ == "__main__":
    if LOCAL_VIDEO_PATH: extract_local_audio(LOCAL_VIDEO_PATH)
    if YOUTUBE_URLS: download_youtube_audio(YOUTUBE_URLS)