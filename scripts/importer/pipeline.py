#!/usr/bin/env python3
"""
BrainDump Importer Pipeline Orchestrator
Coordinates media downloading, visual frame sampling, Parakeet ASR audio transcription,
and two-stage MiniCPM + Gemma-4 distillation across Video, Carousel, Image, and Text sources.
"""

import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

from .config import (
    DEFAULT_ROUTER_URL,
    MODEL_TEXT,
    MODEL_VIDEO,
    build_carousel_stage2_prompt,
    build_image_stage2_prompt,
    build_text_prompt,
    build_video_stage2_prompt,
    error_log,
    get_carousel_stage1_prompts,
    get_image_stage1_prompts,
    get_video_stage1_prompts,
    log,
)
from .db import save_reflection
from .downloader import detect_platform, download_instagram, download_youtube
from .llm import call_llama_router, clear_llm_context, compute_token_metrics
from .media import (
    encode_image,
    get_video_duration,
    sample_keyframes,
    transcribe_video_audio,
)


# ── Sub-Handler: Video Processing ─────────────────────────────────
def process_video(
    media_info: Dict[str, Any],
    server_url: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Processes video media:
    1. Transcribes audio via Parakeet ASR GGUF.
    2. Samples keyframes via single-pass ffmpeg.
    3. Runs Stage 1 visual OCR / perception with MiniCPM-V-4.6.
    4. Runs Stage 2 distillation with Huihui-gemma-4.
    Returns (result, timing_breakdown, usage_metrics).
    """
    video_path = media_info["media_path"]
    platform = media_info["platform"]
    author = media_info["author"]
    caption = media_info["transcript"] or media_info["caption"] or ""

    duration = get_video_duration(video_path)
    if duration <= 40.0:
        interval = 0.30
        mode_desc = f"Short Reel (ultra-dense {interval}s)"
    elif duration <= 100.0:
        interval = 0.65
        mode_desc = f"Medium Video ({interval}s)"
    else:
        interval = 1.0
        mode_desc = f"Long Video ({interval}s)"
    log(f"Video duration: {duration:.1f}s | Mode: {mode_desc}")

    # 1. Audio Transcription via Parakeet ASR
    if progress_callback:
        progress_callback("Transcribing spoken audio with Parakeet ASR...")
    audio_transcript, t_audio = transcribe_video_audio(video_path)

    # 2. Keyframe Sampling
    if progress_callback:
        progress_callback(f"Sampling video frames ({duration:.0f}s)...")
    t_frames_start = time.time()
    frames = sample_keyframes(video_path, frame_interval_seconds=interval)
    t_frames = round(time.time() - t_frames_start, 1)
    num_frames = len(frames)
    log(f"Stage 1: Sampled {num_frames} frames in {t_frames}s for MiniCPM-V-4.6")

    # 3. Stage 1 Visual OCR / Perception (MiniCPM-V-4.6)
    if progress_callback:
        progress_callback(f"Stage 1/2: MiniCPM scanning {num_frames} video frames...")
    clear_llm_context(server_url, MODEL_VIDEO)

    s1_sys, s1_prompt = get_video_stage1_prompts(platform, author)
    t_s1_start = time.time()
    stage1_res = call_llama_router(
        server_url=server_url,
        model_name=MODEL_VIDEO,
        prompt=s1_prompt,
        images=frames,
        system_instruction=s1_sys,
        response_json=False,
        max_tokens=2500,
    )
    t_stage1 = round(time.time() - t_s1_start, 1)
    stage1_notes = stage1_res.get("text", "").strip()
    stage1_usage = stage1_res.get("_usage", {})
    log(f"Stage 1 complete in {t_stage1}s ({stage1_usage.get('total_tokens', 0):,} tokens). Switching to Gemma-4...")
    clear_llm_context(server_url, MODEL_VIDEO)

    # 4. Stage 2 Synthesis & Distillation (Huihui-gemma-4)
    if progress_callback:
        progress_callback("Stage 2/2: Distilling core wisdom with Gemma-4...")
    stage2_prompt = build_video_stage2_prompt(platform, author, audio_transcript, caption, stage1_notes)

    t_s2_start = time.time()
    stage2_res = call_llama_router(
        server_url=server_url,
        model_name=MODEL_TEXT,
        prompt=stage2_prompt,
        images=None,
        response_json=True,
        max_tokens=2500,
    )
    t_stage2 = round(time.time() - t_s2_start, 1)
    clear_llm_context(server_url, MODEL_TEXT)

    usage = compute_token_metrics(stage1_usage, stage2_res.get("_usage", {}))
    timing = {
        "audio_seconds": t_audio,
        "keyframes_seconds": t_frames,
        "stage1_seconds": t_stage1,
        "stage2_seconds": t_stage2,
        "num_frames": num_frames,
    }
    return stage2_res, timing, usage


# ── Sub-Handler: Carousel Processing ──────────────────────────────
def process_carousel(
    media_info: Dict[str, Any],
    server_url: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Processes Instagram multi-slide carousel media.
    Runs Stage 1 visual OCR across all slides and Stage 2 distillation.
    """
    slides = media_info.get("image_files") or []
    platform = media_info["platform"]
    author = media_info["author"]
    caption = media_info["transcript"] or media_info["caption"] or ""

    if progress_callback:
        progress_callback(f"Stage 1/2: MiniCPM scanning {len(slides)} carousel slides...")

    t_frames_start = time.time()
    frames = []
    for s in slides:
        enc = encode_image(s)
        if enc:
            frames.extend(enc)
    t_frames = round(time.time() - t_frames_start, 1)
    num_slides = len(frames)
    log(f"Stage 1: Prepared {num_slides} carousel slides in {t_frames}s")

    clear_llm_context(server_url, MODEL_VIDEO)
    s1_sys, s1_prompt = get_carousel_stage1_prompts(platform, author, num_slides, caption)

    t_s1_start = time.time()
    stage1_res = call_llama_router(
        server_url=server_url,
        model_name=MODEL_VIDEO,
        prompt=s1_prompt,
        images=frames,
        system_instruction=s1_sys,
        response_json=False,
        max_tokens=2500,
    )
    t_stage1 = round(time.time() - t_s1_start, 1)
    stage1_notes = stage1_res.get("text", "").strip()
    stage1_usage = stage1_res.get("_usage", {})
    log(f"Stage 1 complete in {t_stage1}s ({stage1_usage.get('total_tokens', 0):,} tokens). Switching to Gemma-4...")
    clear_llm_context(server_url, MODEL_VIDEO)

    if progress_callback:
        progress_callback("Stage 2/2: Distilling carousel wisdom with Gemma-4...")
    stage2_prompt = build_carousel_stage2_prompt(platform, author, caption, num_slides, stage1_notes)

    t_s2_start = time.time()
    stage2_res = call_llama_router(
        server_url=server_url,
        model_name=MODEL_TEXT,
        prompt=stage2_prompt,
        images=None,
        response_json=True,
        max_tokens=2500,
    )
    t_stage2 = round(time.time() - t_s2_start, 1)
    clear_llm_context(server_url, MODEL_TEXT)

    usage = compute_token_metrics(stage1_usage, stage2_res.get("_usage", {}))
    timing = {
        "keyframes_seconds": t_frames,
        "stage1_seconds": t_stage1,
        "stage2_seconds": t_stage2,
        "num_slides": num_slides,
    }
    return stage2_res, timing, usage


# ── Sub-Handler: Single Image Processing ──────────────────────────
def process_image(
    media_info: Dict[str, Any],
    server_url: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Processes single static image post.
    Runs Stage 1 visual OCR and Stage 2 distillation.
    """
    img_path = media_info.get("media_path")
    platform = media_info["platform"]
    author = media_info["author"]
    caption = media_info["transcript"] or media_info["caption"] or ""

    if progress_callback:
        progress_callback("Stage 1/2: MiniCPM scanning image typography...")

    t_frames_start = time.time()
    frames = encode_image(img_path) if img_path else []
    t_frames = round(time.time() - t_frames_start, 1)

    clear_llm_context(server_url, MODEL_VIDEO)
    s1_sys, s1_prompt = get_image_stage1_prompts(platform, author, caption)

    t_s1_start = time.time()
    stage1_res = call_llama_router(
        server_url=server_url,
        model_name=MODEL_VIDEO,
        prompt=s1_prompt,
        images=frames,
        system_instruction=s1_sys,
        response_json=False,
        max_tokens=2500,
    )
    t_stage1 = round(time.time() - t_s1_start, 1)
    stage1_notes = stage1_res.get("text", "").strip()
    stage1_usage = stage1_res.get("_usage", {})
    clear_llm_context(server_url, MODEL_VIDEO)

    if progress_callback:
        progress_callback("Stage 2/2: Distilling quote with Gemma-4...")
    stage2_prompt = build_image_stage2_prompt(platform, author, caption, stage1_notes)

    t_s2_start = time.time()
    stage2_res = call_llama_router(
        server_url=server_url,
        model_name=MODEL_TEXT,
        prompt=stage2_prompt,
        images=None,
        response_json=True,
        max_tokens=2500,
    )
    t_stage2 = round(time.time() - t_s2_start, 1)
    clear_llm_context(server_url, MODEL_TEXT)

    usage = compute_token_metrics(stage1_usage, stage2_res.get("_usage", {}))
    timing = {
        "keyframes_seconds": t_frames,
        "stage1_seconds": t_stage1,
        "stage2_seconds": t_stage2,
        "num_slides": 1,
    }
    return stage2_res, timing, usage


# ── Sub-Handler: Text Only Processing ─────────────────────────────
def process_text(
    media_info: Dict[str, Any],
    server_url: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Processes plain text / caption fallback directly with Gemma-4."""
    platform = media_info["platform"]
    author = media_info["author"]
    transcript = media_info.get("transcript") or media_info.get("caption") or ""

    if progress_callback:
        progress_callback(f"Analyzing text with {MODEL_TEXT}...")

    clear_llm_context(server_url, MODEL_TEXT)
    prompt = build_text_prompt(platform, author, transcript)

    t_s2_start = time.time()
    result = call_llama_router(
        server_url=server_url,
        model_name=MODEL_TEXT,
        prompt=prompt,
        images=None,
        response_json=True,
    )
    t_stage2 = round(time.time() - t_s2_start, 1)
    clear_llm_context(server_url, MODEL_TEXT)

    usage = result.get("_usage", {})
    timing = {"stage2_seconds": t_stage2}
    return result, timing, usage


# ── Metrics Printer ───────────────────────────────────────────────
def print_metrics_summary(
    reflection: Dict[str, Any],
    media_type: str,
    dur_str: str,
    proc_elapsed: float,
    t_download: float,
    timing: Dict[str, Any],
    usage: Dict[str, Any],
) -> None:
    """Pretty prints the extracted reflection, duration, and token metrics."""
    print("\n" + "=" * 60)
    print("✨ EXTRACTED MOTIVATION")
    print("=" * 60)
    print(f"Tag:     [{reflection['category'].upper()}]")
    print(f"Author:  @{reflection['author']}")
    print(f"Source:  {reflection['sourceUrl']}")
    print("-" * 60)
    print(f"{reflection['text']}")
    print("-" * 60)
    print("⏱️ DURATION & PERFORMANCE BREAKDOWN:")
    print(f"   • Whole Duration:        {dur_str} ({proc_elapsed}s)")
    print(f"   • Media Download:        {t_download}s")

    if media_type == "video":
        if timing.get("audio_seconds", 0) > 0:
            print(f"   • Audio ASR (Parakeet):  {timing['audio_seconds']}s")
        print(f"   • Keyframe Extraction:   {timing.get('keyframes_seconds', 0)}s ({timing.get('num_frames', 0)} frames)")
        print(f"   • Stage 1 (MiniCPM-V):   {timing.get('stage1_seconds', 0)}s ({usage.get('stage1_tokens', 0):,} tokens)")
        print(f"   • Stage 2 (Gemma-4):     {timing.get('stage2_seconds', 0)}s ({usage.get('stage2_tokens', 0):,} tokens)")
    elif media_type in ("carousel", "image"):
        label = "Carousel Slides" if media_type == "carousel" else "Image"
        print(f"   • {label} Extraction:    {timing.get('keyframes_seconds', 0)}s ({timing.get('num_slides', 0)} cards)")
        print(f"   • Stage 1 (MiniCPM-V):   {timing.get('stage1_seconds', 0)}s ({usage.get('stage1_tokens', 0):,} tokens)")
        print(f"   • Stage 2 (Gemma-4):     {timing.get('stage2_seconds', 0)}s ({usage.get('stage2_tokens', 0):,} tokens)")
    elif timing.get("stage2_seconds", 0) > 0:
        print(f"   • Model Inference:       {timing['stage2_seconds']}s")

    print("-" * 60)
    print(f"📊 Token & Context Metrics [{usage.get('model', MODEL_TEXT)}]:")
    if "stage1_tokens" in usage and "stage2_tokens" in usage:
        print(f"   • Stage 1 (MiniCPM Full Scan): {usage['stage1_tokens']:,} tokens")
        print(f"   • Stage 2 (Gemma-4 Distill):   {usage['stage2_tokens']:,} tokens")
    print(f"   • Prompt Tokens:      {usage.get('prompt_tokens', 0):,}")
    print(f"   • Completion Tokens:  {usage.get('completion_tokens', 0):,}")
    print(f"   • Total Tokens Used:  {usage.get('total_tokens', 0):,}")
    print(f"   • Context Window:     {usage.get('total_tokens', 0):,} / {usage.get('ctx_limit', 0):,} ({usage.get('ctx_percent', 0)}% filled)")
    if usage.get("speed"):
        print(f"   • Inference Speed:    {usage['speed']} tokens/sec")
    print(f"   • Processing Time:    {dur_str} ({proc_elapsed}s)")
    print("=" * 60 + "\n")


# ── Main Entrypoint: Process URL ──────────────────────────────────
def process_url(
    url: str,
    server_url: str = DEFAULT_ROUTER_URL,
    num_frames: int = 8,
    dry_run: bool = False,
    insta_session: Optional[str] = None,
    insta_login: Optional[str] = None,
    keep_temp: bool = False,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Optional[Dict[str, Any]]:
    """Downloads, inspects, invokes router, and saves a single motivation URL."""
    platform, content_id = detect_platform(url)
    if not platform:
        error_log(f"Unsupported URL format (must be Instagram or YouTube): {url}")
        return None

    if progress_callback:
        progress_callback(f"Connecting to {platform.title()}...")

    log(f"Processing {platform.upper()} source: {url}")
    temp_dir = Path(tempfile.mkdtemp(prefix=f"bd_{platform}_"))

    try:
        start_proc_time = time.time()
        if progress_callback:
            progress_callback(f"Downloading media from {platform.title()}...")

        t_dl_start = time.time()
        if platform == "instagram":
            media_info = download_instagram(
                url=url,
                shortcode=content_id or "",
                output_dir=temp_dir,
                session_file=insta_session,
                username=insta_login,
            )
        else:
            media_info = download_youtube(url=url, output_dir=temp_dir)
        t_download = round(time.time() - t_dl_start, 1)

        media_type = media_info["media_type"]
        log(f"{media_type.title()} detected | Downloaded in {t_download}s")

        # Route to dedicated sub-handler
        if media_type == "video" and media_info.get("media_path") and media_info["media_path"].exists():
            result, timing, usage = process_video(media_info, server_url, progress_callback)
        elif media_type == "carousel" and media_info.get("image_files"):
            result, timing, usage = process_carousel(media_info, server_url, progress_callback)
        elif media_type == "image" and media_info.get("media_path") and media_info["media_path"].exists():
            result, timing, usage = process_image(media_info, server_url, progress_callback)
        else:
            result, timing, usage = process_text(media_info, server_url, progress_callback)

        proc_elapsed = round(time.time() - start_proc_time, 1)
        mins = int(proc_elapsed // 60)
        secs = int(proc_elapsed % 60)
        dur_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

        breakdown = {
            "total_seconds": proc_elapsed,
            "total_formatted": dur_str,
            "download_seconds": t_download,
            **timing,
        }
        usage["duration_seconds"] = proc_elapsed
        usage["duration_formatted"] = dur_str
        usage["breakdown"] = breakdown

        reflection = {
            "text": result.get("text", "").strip(),
            "category": result.get("category", "motivation"),
            "author": result.get("author") or media_info.get("author", ""),
            "sourceUrl": url,
            "sourcePlatform": platform,
            "tokenUsage": usage,
        }

        print_metrics_summary(reflection, media_type, dur_str, proc_elapsed, t_download, timing, usage)

        if progress_callback:
            progress_callback("Saving reflection to BrainDump...")

        save_reflection(reflection, dry_run=dry_run)
        return reflection

    except Exception as e:
        error_log(f"Failed to process {url}: {e}")
        raise
    finally:
        clear_llm_context(server_url, MODEL_VIDEO)
        clear_llm_context(server_url, MODEL_TEXT)
        if not keep_temp:
            shutil.rmtree(temp_dir, ignore_errors=True)
