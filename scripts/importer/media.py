#!/usr/bin/env python3
"""
BrainDump Importer Media Processing
Provides single-pass ffmpeg keyframe sampling, duration calculation,
base64 image encoding, and sub-second Parakeet ASR audio transcription.
"""

import base64
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import List, Optional, Tuple

from .config import PROJECT_ROOT, error_log, log


# ── Video Duration ─────────────────────────────────────────────────
def get_video_duration(video_path: Path) -> float:
    """Returns video duration in seconds via ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()
        return float(out)
    except Exception:
        return 30.0


# ── Single-Pass Keyframe Extraction ────────────────────────────────
def sample_keyframes(
    video_path: Path,
    frame_interval_seconds: Optional[float] = None,
) -> List[str]:
    """
    Samples keyframes across the video using single-pass ffmpeg and returns
    base64-encoded JPEG data URLs.
    - Short reel (<= 40s): interval ~0.30s (approx 55-65 frames for an 18-20s reel).
    - Medium video (40s-100s): interval ~0.65s.
    - Long video (> 100s): interval ~1.0s.
    """
    duration = get_video_duration(video_path)
    if frame_interval_seconds is None:
        if duration <= 40.0:
            frame_interval_seconds = 0.30
        elif duration <= 100.0:
            frame_interval_seconds = 0.65
        else:
            frame_interval_seconds = 1.0

    frame_interval_seconds = max(frame_interval_seconds, 0.2)
    fps_val = 1.0 / frame_interval_seconds

    temp_frame_dir = Path(tempfile.mkdtemp(prefix="frames_"))
    frames_b64: List[str] = []

    try:
        # Single-pass extraction via fps filter
        cmd = [
            "ffmpeg",
            "-y",
            "-v", "error",
            "-i", str(video_path),
            "-vf", f"fps={fps_val:.4f},scale=512:-1",
            "-q:v", "3",
            str(temp_frame_dir / "frame_%04d.jpg"),
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

        frame_files = sorted(list(temp_frame_dir.glob("frame_*.jpg")))

        # Clamp between 10 frames and 180 frames (safe for 64k context)
        if len(frame_files) > 180:
            step = len(frame_files) / 180
            indices = [int(i * step) for i in range(180)]
            frame_files = [frame_files[i] for i in indices]

        for ff in frame_files:
            if ff.stat().st_size > 0:
                b64_data = base64.b64encode(ff.read_bytes()).decode("utf-8")
                frames_b64.append(f"data:image/jpeg;base64,{b64_data}")

        # Fallback to single middle frame if video couldn't be sampled
        if not frames_b64 and duration > 0:
            fallback_frame = temp_frame_dir / "mid_frame.jpg"
            cmd_fb = [
                "ffmpeg",
                "-y",
                "-ss", f"{duration / 2:.2f}",
                "-i", str(video_path),
                "-vframes", "1",
                "-vf", "scale=512:-1",
                str(fallback_frame),
            ]
            subprocess.run(cmd_fb, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if fallback_frame.exists() and fallback_frame.stat().st_size > 0:
                b64_data = base64.b64encode(fallback_frame.read_bytes()).decode("utf-8")
                frames_b64.append(f"data:image/jpeg;base64,{b64_data}")

        log(f"Sampled {len(frames_b64)} keyframes from video ({duration:.1f}s) in single-pass")
        return frames_b64
    finally:
        shutil.rmtree(temp_frame_dir, ignore_errors=True)


# ── Base64 Image Encoder ───────────────────────────────────────────
def encode_image(image_path: Path) -> List[str]:
    """Encodes a single image file into base64 data URL."""
    try:
        b64_data = base64.b64encode(image_path.read_bytes()).decode("utf-8")
        ext = image_path.suffix.lstrip(".").lower() or "jpeg"
        if ext == "jpg":
            ext = "jpeg"
        return [f"data:image/{ext};base64,{b64_data}"]
    except Exception as e:
        error_log(f"Failed to encode image {image_path}: {e}")
        return []


# ── Parakeet ASR Speech-to-Text ────────────────────────────────────
def get_parakeet_model_path() -> Optional[Path]:
    """Finds downloaded parakeet-unified-en-0.6b GGUF in HuggingFace cache or local paths."""
    search_paths = [
        Path.home() / ".cache" / "huggingface" / "hub",
        Path.home() / ".cache" / "llama.cpp",
        PROJECT_ROOT / "scripts" / "models",
    ]
    for sp in search_paths:
        if sp.exists():
            matches = list(sp.glob("**/parakeet-unified-en-0.6b-*.gguf"))
            if matches:
                matches.sort(key=lambda p: (0 if "Q4_K_M" in p.name else (1 if "Q8_0" in p.name else 2)))
                return matches[0]
    return None


def transcribe_video_audio(video_path: Path) -> Tuple[str, float]:
    """
    Extracts 16kHz mono audio from video via ffmpeg and transcribes speech
    using transcribe_cpp and Parakeet GGUF.
    Returns (transcript_text, elapsed_seconds).
    """
    t_start = time.time()
    try:
        model_path = get_parakeet_model_path()
        if not model_path or not model_path.exists():
            log("Parakeet GGUF model not found in HuggingFace cache. Skipping speech transcription.", prefix="ℹ️")
            return "", 0.0

        try:
            import transcribe_cpp
        except ImportError:
            log("transcribe_cpp module not installed ('pip install transcribe-cpp'). Skipping ASR.", prefix="⚠️")
            return "", 0.0

        # Extract 16kHz mono float32 PCM directly via ffmpeg stdout
        cmd = [
            "ffmpeg",
            "-v", "error",
            "-y",
            "-i", str(video_path),
            "-vn",
            "-ar", "16000",
            "-ac", "1",
            "-f", "f32le",
            "-",
        ]
        pcm_bytes = subprocess.check_output(cmd)
        if len(pcm_bytes) < 16000 * 4 * 0.4:  # Under 0.4s of audio
            return "", round(time.time() - t_start, 2)

        log(f"Transcribing audio with Parakeet GGUF ({model_path.name})...")
        res = transcribe_cpp.transcribe(model_path, pcm_bytes, backend="auto")
        transcript = res.text.strip()
        elapsed = round(time.time() - t_start, 2)
        if transcript:
            log(f"Audio transcription complete in {elapsed}s: \"{transcript[:80]}{'...' if len(transcript)>80 else ''}\"")
        else:
            log(f"Audio transcription complete in {elapsed}s (no spoken words detected)")
        return transcript, elapsed
    except Exception as e:
        log(f"Audio transcription failed: {e}", prefix="⚠️")
        return "", round(time.time() - t_start, 2)
