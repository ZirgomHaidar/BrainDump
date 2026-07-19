#!/usr/bin/env python3
"""
BrainDump Importer Configuration & Constants
Defines model names, context limits, category classification criteria,
and prompt templates for visual perception and distillation.
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict

# ── Paths & Endpoints ──────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
LOCAL_CACHE_FILE = PROJECT_ROOT / "scripts" / "motivations_imported.json"
DEFAULT_ROUTER_URL = os.environ.get("LLAMA_SERVER_URL", "http://127.0.0.1:8080")

# ── Model Config ───────────────────────────────────────────────────
MODEL_VIDEO = "MiniCPM-V-4.6"
MODEL_TEXT = "Huihui-gemma-4"

MODEL_CONTEXT_LIMITS: Dict[str, int] = {
    "MiniCPM-V-4.6": 64128,
    "Huihui-gemma-4": 64128,
    "openbmb/MiniCPM-V-4.6-Thinking-gguf:F16": 64128,
    "huihui-ai/Huihui-gemma-4-E2B-it-qat-q4_0-unquantized-abliterated-GGUF:Q4_K": 64128,
}

VALID_CATEGORIES = {"motivation", "lesson", "principle", "experience"}

# ── Category Classification Criteria ───────────────────────────────
CATEGORY_CRITERIA_TEXT = """CATEGORY CLASSIFICATION CRITERIA (Choose exactly ONE):
- 'motivation': Energy, drive, discipline, grit, taking immediate action, urgency, ambition, performing under pressure (e.g. "Pressure changes everything", "Just start today", "Ugly action beats perfection").
- 'principle': Universal codes of conduct, ethical contrasts, timeless mental models, rules to live by (e.g. "Pride says... Wisdom says...", "Help others shine, but never dim your own glow").
- 'lesson': Realizations gained from learning curves, reframing mistakes or failure, counter-intuitive truths (e.g. "There is no secret ingredient", "If you focus on the past, you won’t see what lies ahead").
- 'experience': First-person personal reflections, self-comparison, inner journey, subjective lived mindset using 'I', 'me', 'my' (e.g. "The only rival I have is who I was last year", "I don't care who's doing better than me")."""


# ── Logging Helpers ────────────────────────────────────────────────
def log(msg: str, prefix: str = "ℹ️"):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {prefix} {msg}")


def error_log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ Error: {msg}", file=sys.stderr)


# ── Prompt Templates ───────────────────────────────────────────────
DEFAULT_SYSTEM_INSTRUCTION = (
    "You are an elite wisdom and quote curator for BrainDump.\n"
    "CORE DIRECTIVE: Extract the actual key words, on-screen text, quotes, or spoken dialogue directly from the media. DO NOT summarize, explain, or review what the video or clip is doing.\n\n"
    "GENERAL EXTRACTION RULES:\n"
    "1. EXTRACT REAL PIECES & QUOTES DIRECTLY: If the media displays on-screen text, typography, subtitles, or mantras, extract those exact words and sequence.\n"
    "2. NO THIRD-PERSON SUMMARIES OR META-TALK: NEVER describe what the video or creator is doing. Absolutely FORBIDDEN starting phrases:\n"
    "   - 'This sequence highlights...'\n"
    "   - 'This video shows / emphasizes...'\n"
    "   - 'In this clip...'\n"
    "   - 'The author / speaker argues...'\n"
    "   START IMMEDIATELY with the words of the message or quote itself.\n"
    "3. DEDUPLICATION: If an ending phrase repeats across multiple consecutive frames, include it only ONCE at the end.\n"
    "4. FALLBACK ONLY: Only if the media has NO on-screen text, quotes, or dialogue, state the underlying principle directly in 1st/2nd person ('Help others shine, but never dim your own glow.').\n\n"
    f"{CATEGORY_CRITERIA_TEXT}\n\n"
    "5. OUTPUT STRICT VALID JSON ONLY:\n"
    "{\n"
    '  "text": "The exact on-screen words/quote or direct principle",\n'
    '  "category": "motivation" | "principle" | "lesson" | "experience",\n'
    '  "author": "Creator or speaker handle/name"\n'
    "}\n"
)


def get_video_stage1_prompts(platform: str, author: str):
    sys_prompt = (
        "You are an expert video perception and transcription engine.\n"
        "TASK: Inspect these video frames spanning the entire video. Transcribe all visible on-screen text, titles, animated captions, quotes, and key points in chronological order.\n"
        "Be thorough. Include exact words and full sentences shown on screen."
    )
    user_prompt = (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        "Transcribe all visible on-screen text, animated subtitles, typography, and quotes from these video frames in chronological order."
    )
    return sys_prompt, user_prompt


def get_carousel_stage1_prompts(platform: str, author: str, num_slides: int, caption: str):
    sys_prompt = (
        "You are an expert visual perception and OCR engine.\n"
        f"TASK: Inspect these {num_slides} carousel slides in chronological order (Slide 1 to Slide {num_slides}).\n"
        "Transcribe all visible on-screen text, titles, subtitles, quotes, and core visual comparisons from each slide.\n"
        "Be thorough. Transcribe every slide so no information is lost."
    )
    user_prompt = (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        f"Post Caption:\n{caption}\n\n"
        f"Transcribe all on-screen text, titles, quotes, and visual cards from each of these {num_slides} carousel slides in order."
    )
    return sys_prompt, user_prompt


def get_image_stage1_prompts(platform: str, author: str, caption: str):
    sys_prompt = (
        "You are an expert visual perception and transcription engine.\n"
        "TASK: Transcribe all visible on-screen text, typography, quotes, and titles from this image."
    )
    user_prompt = (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        f"Post Caption:\n{caption}\n\n"
        "Transcribe all on-screen text, typography, and quotes from this image verbatim."
    )
    return sys_prompt, user_prompt


def build_video_stage2_prompt(
    platform: str, author: str, audio_transcript: str, caption: str, visual_notes: str
) -> str:
    return (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        f"Spoken Audio Dialogue (via Parakeet ASR):\n{audio_transcript or '(No speech detected)'}\n\n"
        f"Post Caption / Context:\n{caption}\n\n"
        f"Detailed On-Screen Text & Notes from Video:\n{visual_notes}\n\n"
        f"DIRECTIVES:\n"
        f"1. UNIFIED SYNTHESIS & SENSE-MAKING: Synthesize the core wisdom, quote, or principle from BOTH the spoken audio dialogue and on-screen visual text as equal sources of truth.\n"
        f"   - Correct obvious speech-to-text acoustic mishearings/typos (e.g. 'Others food' -> 'Others fold') so quotes make complete grammatical and contextual sense.\n"
        f"2. DEDUPLICATE REPETITIONS & STUTTERS: Eliminate stuttered words or echo repetitions (e.g. 'Pressure changes everything. Pressure.' -> 'Pressure changes everything.'). If dialogue states a concept and then repeats it rhetorically, retain the cleanest, punchiest form.\n"
        f"3. PRESERVE COMPLETE WISDOM: Preserve the full sequence of rules, contrast pairs, or lessons in full rather than discarding lines.\n"
        f"4. LINE BREAK FORMATTING: Put each distinct statement, contrast pair, or thought on its own line using newline characters ('\\n'). Separate thought transitions with an empty line ('\\n\\n'). DO NOT output a single dense, unpunctuated wall of text. DO NOT use bullet points (no '•', no '-', no '*').\n"
        f"5. NO THIRD-PERSON SUMMARIES OR META-TALK: Start immediately with the actual words of the quote.\n"
        f"6. CATEGORY CLASSIFICATION:\n"
        f"{CATEGORY_CRITERIA_TEXT}\n"
        f"7. Return strict JSON with fields: 'text', 'category', 'author'."
    )


def build_carousel_stage2_prompt(
    platform: str, author: str, caption: str, num_slides: int, visual_notes: str
) -> str:
    return (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        f"Post Caption:\n{caption}\n\n"
        f"Detailed On-Screen Text & Notes across all {num_slides} Carousel Slides:\n{visual_notes}\n\n"
        f"DIRECTIVES:\n"
        f"1. Extract and synthesize the wisdom from ALL slides into a clean, structured layout:\n"
        f"   - Header Line: The overarching title / motto (from Slide 1 and 2 in UPPERCASE).\n"
        f"   - Empty Line (double newline '\\n\\n').\n"
        f"   - Clean Lines: Put each core takeaway, quote, or rule on its own separate line using newline characters ('\\n'). DO NOT use bullet points (no '•', no '-', no '*'). Just clean, separate lines.\n"
        f"2. DO NOT output as a single continuous paragraph or wall of text. YOU MUST USE CLEAN NEWLINES BETWEEN POINTS.\n"
        f"3. NO THIRD-PERSON SUMMARIES OR META-TALK: Never say 'This carousel shows...' or 'The author explains...'. Start directly with the headline.\n"
        f"4. CATEGORY CLASSIFICATION:\n"
        f"{CATEGORY_CRITERIA_TEXT}\n"
        f"5. Return strict JSON with fields: 'text', 'category', 'author'."
    )


def build_image_stage2_prompt(
    platform: str, author: str, caption: str, visual_notes: str
) -> str:
    return (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        f"Post Caption:\n{caption}\n\n"
        f"Image Visual Notes:\n{visual_notes}\n\n"
        f"DIRECTIVES:\n"
        f"1. Extract the core quote, principle, or wisdom directly from the image text and caption.\n"
        f"2. If the image contains multiple rules, contrasts, or points, preserve them all with line breaks ('\\n').\n"
        f"3. NO THIRD-PERSON SUMMARIES OR META-TALK: Start directly with the actual message.\n"
        f"4. CATEGORY CLASSIFICATION:\n"
        f"{CATEGORY_CRITERIA_TEXT}\n"
        f"5. Return strict JSON with fields: 'text', 'category', 'author'."
    )


def build_text_prompt(platform: str, author: str, transcript: str) -> str:
    return (
        f"Source Platform: {platform.title()}\n"
        f"Author / Creator: {author}\n"
        f"Post Text / Transcript:\n{transcript}\n\n"
        f"DIRECTIVES:\n"
        f"1. Extract the direct quote, lesson, or principle without third-person meta-commentary.\n"
        f"2. Line break formatting: Put distinct thoughts on separate lines ('\\n'). DO NOT use bullet points.\n"
        f"3. CATEGORY CLASSIFICATION:\n"
        f"{CATEGORY_CRITERIA_TEXT}\n"
        f"4. Return strict JSON with fields: 'text', 'category', 'author'."
    )
