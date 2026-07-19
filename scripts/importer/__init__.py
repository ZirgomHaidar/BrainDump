"""
BrainDump Motivation Importer Package
Provides modular tools for downloading media, transcribing speech with Parakeet ASR,
sampling video frames, distilling quotes with MiniCPM-V-4.6 and Huihui-gemma-4,
and syncing with Firestore.
"""

from .config import (
    CATEGORY_CRITERIA_TEXT,
    DEFAULT_ROUTER_URL,
    MODEL_CONTEXT_LIMITS,
    MODEL_TEXT,
    MODEL_VIDEO,
    VALID_CATEGORIES,
    error_log,
    log,
)
from .db import (
    get_firestore_client,
    run_listener_loop,
    save_reflection,
)
from .downloader import (
    clean_vtt_subtitles,
    detect_platform,
    download_instagram,
    download_youtube,
)
from .llm import (
    call_llama_router,
    clean_quote_text,
    clear_llm_context,
    compute_token_metrics,
)
from .media import (
    encode_image,
    get_parakeet_model_path,
    get_video_duration,
    sample_keyframes,
    transcribe_video_audio,
)
from .pipeline import (
    process_carousel,
    process_image,
    process_text,
    process_url,
    process_video,
)

__all__ = [
    "DEFAULT_ROUTER_URL",
    "MODEL_TEXT",
    "MODEL_VIDEO",
    "MODEL_CONTEXT_LIMITS",
    "VALID_CATEGORIES",
    "CATEGORY_CRITERIA_TEXT",
    "log",
    "error_log",
    "detect_platform",
    "clean_vtt_subtitles",
    "download_instagram",
    "download_youtube",
    "get_video_duration",
    "sample_keyframes",
    "encode_image",
    "get_parakeet_model_path",
    "transcribe_video_audio",
    "call_llama_router",
    "clear_llm_context",
    "clean_quote_text",
    "compute_token_metrics",
    "get_firestore_client",
    "save_reflection",
    "run_listener_loop",
    "process_url",
    "process_video",
    "process_carousel",
    "process_image",
    "process_text",
]
