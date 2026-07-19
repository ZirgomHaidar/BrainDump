#!/usr/bin/env python3
"""
BrainDump Importer Media Downloader
Handles downloading media from Instagram (reels/carousels/posts) and YouTube (shorts/videos)
along with subtitle extraction and natural slide ordering.
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from .config import error_log, log

try:
    import instaloader
except ImportError:
    instaloader = None

try:
    import yt_dlp
except ImportError:
    yt_dlp = None


# ── URL Classification ─────────────────────────────────────────────
def detect_platform(url: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (platform, content_id)
    platform: 'instagram' or 'youtube'
    """
    url_clean = url.strip()

    # Instagram
    insta_match = re.search(r"instagram\.com/(?:share/)?(?:reels?|p|tv)/([A-Za-z0-9_-]+)", url_clean)
    if insta_match:
        return "instagram", insta_match.group(1)

    # YouTube
    yt_match = re.search(
        r"(?:youtube\.com/(?:watch\?v=|shorts/|embed/)|youtu\.be/)([A-Za-z0-9_-]{11})",
        url_clean,
    )
    if yt_match:
        return "youtube", yt_match.group(1)

    return None, None


# ── Subtitle / Transcript Cleaner ─────────────────────────────────
def clean_vtt_subtitles(vtt_path: Path) -> str:
    """Extract clean speech text from WebVTT or SRT subtitle files."""
    if not vtt_path.exists():
        return ""
    try:
        content = vtt_path.read_text(encoding="utf-8", errors="ignore")
        lines = []
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("WEBVTT") or "-->" in line:
                continue
            if re.match(r"^\d+$", line) or re.match(r"^[0-9a-fA-F-]+$", line):
                continue
            cleaned = re.sub(r"<[^>]+>", "", line)
            if cleaned and (not lines or lines[-1] != cleaned):
                lines.append(cleaned)
        return " ".join(lines)
    except Exception as e:
        log(f"Failed to parse subtitle file {vtt_path}: {e}", prefix="⚠️")
        return ""


# ── Instagram Downloader ───────────────────────────────────────────
def download_instagram(
    url: str,
    shortcode: str,
    output_dir: Path,
    session_file: Optional[str] = None,
    username: Optional[str] = None,
) -> Dict[str, Any]:
    """Downloads an Instagram post, carousel, or reel via instaloader."""
    if instaloader is None:
        raise RuntimeError("instaloader Python package is not installed.")

    L = instaloader.Instaloader(
        dirname_pattern=str(output_dir),
        download_pictures=True,
        download_videos=True,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=True,
        compress_json=False,
    )

    if session_file and os.path.exists(session_file):
        log(f"Loading Instagram session from {session_file}...")
        L.load_session_from_file(username or "", session_file)
    elif username:
        log(f"Logging into Instagram as {username}...")
        L.interactive_login(username)

    log(f"Fetching Instagram post {shortcode}...")
    post = instaloader.Post.from_shortcode(L.context, shortcode)
    L.download_post(post, target=output_dir)

    def extract_slide_number(path: Path) -> int:
        m = re.search(r"_(\d+)\.(?:jpg|jpeg|png|mp4)$", path.name, re.IGNORECASE)
        return int(m.group(1)) if m else 0

    video_files = sorted(list(output_dir.glob("*.mp4")), key=extract_slide_number)
    image_files = sorted(
        [f for f in output_dir.glob("*.jpg") if not f.name.endswith("_thumb.jpg")]
        + list(output_dir.glob("*.png")),
        key=extract_slide_number,
    )

    caption = post.caption or ""
    author = post.owner_username or ""

    if len(image_files) > 1:
        media_type = "carousel"
    elif video_files:
        media_type = "video"
    elif image_files:
        media_type = "image"
    else:
        media_type = "text"

    return {
        "platform": "instagram",
        "url": url,
        "author": author,
        "media_type": media_type,
        "media_path": video_files[0] if video_files else (image_files[0] if image_files else None),
        "image_files": image_files,
        "video_files": video_files,
        "caption": caption,
        "transcript": caption,
    }


# ── YouTube Downloader ─────────────────────────────────────────────
def download_youtube(url: str, output_dir: Path) -> Dict[str, Any]:
    """Downloads a YouTube video or Short and extracts subtitles via yt-dlp."""
    if yt_dlp is None:
        raise RuntimeError("yt_dlp Python package is not installed.")

    ydl_opts = {
        "outtmpl": str(output_dir / "%(id)s.%(ext)s"),
        "format": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-orig"],
        "quiet": True,
        "no_warnings": True,
    }

    log(f"Downloading YouTube media from {url}...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    author = info.get("uploader") or info.get("channel") or ""
    title = info.get("title") or ""
    description = info.get("description") or ""

    video_files = list(output_dir.glob("*.mp4")) or list(output_dir.glob("*.mkv")) or list(output_dir.glob("*.webm"))
    video_path = video_files[0] if video_files else None

    transcript = ""
    sub_files = list(output_dir.glob("*.vtt")) or list(output_dir.glob("*.srt"))
    if sub_files:
        transcript = clean_vtt_subtitles(sub_files[0])

    combined_text = f"Title: {title}\nDescription: {description[:500]}"
    if transcript:
        combined_text += f"\nSpoken Transcript: {transcript}"

    return {
        "platform": "youtube",
        "url": url,
        "author": author,
        "media_type": "video" if video_path else "text",
        "media_path": video_path,
        "caption": title,
        "transcript": combined_text,
    }
