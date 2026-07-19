#!/usr/bin/env python3
"""
BrainDump Motivation Importer CLI
Imports motivational wisdom, lessons, and principles from Instagram (reels/posts/carousels)
and YouTube (shorts/videos) via local llama-server in router mode.
"""

import argparse
import sys
from pathlib import Path

# Add scripts directory to sys.path so 'importer' package can be imported directly
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

# Re-export public API for complete backwards compatibility
from importer import (  # noqa: F401
    CATEGORY_CRITERIA_TEXT,
    DEFAULT_ROUTER_URL,
    MODEL_CONTEXT_LIMITS,
    MODEL_TEXT,
    MODEL_VIDEO,
    VALID_CATEGORIES,
    call_llama_router,
    clean_quote_text,
    clean_vtt_subtitles,
    clear_llm_context,
    compute_token_metrics,
    detect_platform,
    download_instagram,
    download_youtube,
    encode_image,
    error_log,
    get_firestore_client,
    get_parakeet_model_path,
    get_video_duration,
    log,
    process_carousel,
    process_image,
    process_text,
    process_url,
    process_video,
    run_listener_loop,
    sample_keyframes,
    save_reflection,
    transcribe_video_audio,
)


def main():
    parser = argparse.ArgumentParser(
        description="BrainDump Motivation Importer (Local llama-server router mode)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("urls", nargs="*", help="Instagram or YouTube URLs to import.")
    parser.add_argument("--file", "-f", type=str, help="Text file with URLs to process (one per line).")
    parser.add_argument(
        "--listen",
        action="store_true",
        help="Run as a daemon worker listening to Firestore 'importQueue' for jobs.",
    )
    parser.add_argument(
        "--server",
        type=str,
        default=DEFAULT_ROUTER_URL,
        help=f"llama-server router URL (default: {DEFAULT_ROUTER_URL}).",
    )
    parser.add_argument(
        "--frames",
        type=int,
        default=8,
        help="Number of video keyframes to sample for MiniCPM-V-4.6 (default: 8).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run download and inference without saving to Firestore.",
    )
    parser.add_argument(
        "--insta-session",
        type=str,
        help="Path to instaloader session file for authenticated Instagram downloads.",
    )
    parser.add_argument(
        "--insta-login",
        type=str,
        help="Instagram username to login interactively.",
    )
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Preserve temporary downloaded media files for inspection.",
    )

    args = parser.parse_args()

    if args.listen:
        run_listener_loop(
            process_fn=process_url,
            server_url=args.server,
            num_frames=max(4, min(args.frames, 16)),
            insta_session=args.insta_session,
            insta_login=args.insta_login,
        )
        return

    all_urls = list(args.urls)
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            error_log(f"URL file not found: {args.file}")
            sys.exit(1)
        for line in file_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                all_urls.append(line)

    if not all_urls:
        parser.print_help()
        print("\nExamples:")
        print("  scripts/import_motivation.py --listen")
        print("  scripts/import_motivation.py https://www.instagram.com/reel/C8XYZ123/")
        print("  scripts/import_motivation.py https://www.youtube.com/shorts/ABC123XYZ")
        print("  scripts/import_motivation.py --file urls.txt --dry-run\n")
        sys.exit(1)

    log(f"Starting import of {len(all_urls)} URL(s) using router at {args.server}...")
    success_count = 0
    fail_count = 0

    for idx, url in enumerate(all_urls, 1):
        log(f"\n[{idx}/{len(all_urls)}] ──────────────────────────────────────────")
        try:
            res = process_url(
                url=url,
                server_url=args.server,
                num_frames=args.frames,
                dry_run=args.dry_run,
                insta_session=args.insta_session,
                insta_login=args.insta_login,
                keep_temp=args.keep_temp,
            )
            if res:
                success_count += 1
            else:
                fail_count += 1
        except Exception as e:
            error_log(f"Error processing {url}: {e}")
            fail_count += 1

    log("\n" + "=" * 50)
    log(f"Batch import completed: {success_count} succeeded, {fail_count} failed.")
    log("=" * 50)


if __name__ == "__main__":
    main()
