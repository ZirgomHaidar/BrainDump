#!/usr/bin/env python3
"""
BrainDump Importer LLM Client & Post-Processing
Handles requests to llama-server router API, KV context slot clearing,
token metrics aggregation, and clean quote text post-processing.
"""

import json
import re
import time
from typing import Any, Dict, List, Optional

import requests

from .config import (
    DEFAULT_ROUTER_URL,
    DEFAULT_SYSTEM_INSTRUCTION,
    MODEL_CONTEXT_LIMITS,
    MODEL_TEXT,
    MODEL_VIDEO,
    VALID_CATEGORIES,
    error_log,
    log,
)


# ── Text Post-Processing ───────────────────────────────────────────
def clean_quote_text(text: str) -> str:
    """
    Consolidated text cleaner:
    - Strips code fences (```json ... ```)
    - Strips meta prefixes ('This sequence highlights...', 'The core lesson is...')
    - Strips bullet markers ('•', '-', '*')
    - Deduplicates consecutive duplicate lines
    - Strips wrapping outer quotes and bolding
    """
    t = text.strip()
    if not t:
        return t

    # Strip code block fences
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()

    # Strip meta narrative intros
    meta_prefixes = [
        r"^(?:This\s+(?:sequence|reel|video|clip|post|image|quote|edit|short|interview)|The\s+(?:video|clip|image|author|speaker|creator|post)|In\s+this\s+(?:sequence|clip|video|post|short))\s+(?:highlights|shows|emphasizes|depicts|demonstrates|illustrates|presents|explores|focuses\s+on|is\s+about|reminds\s+us\s+that|teaches\s+that|shares|discusses|features)[^.:!?]*[:\-–—]?\s*",
        r"^(?:The\s+core\s+lesson\s+is:?|The\s+main\s+lesson\s+is:?|Core\s+lesson:?|Key\s+takeaway:?|Takeaway:?|Lesson:?|Principle:?|The\s+message\s+is:?)\s*",
    ]
    for pattern in meta_prefixes:
        t = re.sub(pattern, "", t, flags=re.IGNORECASE).strip()

    # Strip bullet markers ('•', '-', '*') at line starts
    t = re.sub(r"(?m)^\s*[•\-*]\s*", "", t)

    # Deduplicate consecutive identical lines
    if "\n" in t:
        lines = [line.strip() for line in t.split("\n")]
        deduped = []
        for line in lines:
            if not deduped or (line and line.lower() != deduped[-1].lower()):
                deduped.append(line)
        t = "\n".join(deduped)

    # Clean outer quotes
    if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
        t = t[1:-1].strip()

    # Strip wrapping bold markdown
    if t.startswith("**") and t.endswith("**") and t.count("**") == 2:
        t = t[2:-2].strip()

    return t.strip(" *\"'\n\r")


# ── Server Health & Liveness ──────────────────────────────────────
def is_server_alive(server_url: str = DEFAULT_ROUTER_URL, timeout: float = 2.0) -> bool:
    """Checks whether the llama-server router is reachable and responding."""
    base = server_url.rstrip("/")
    for probe_path in ("/health", "/v1/models"):
        try:
            resp = requests.get(f"{base}{probe_path}", timeout=timeout)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
    return False


def wait_for_server(
    server_url: str = DEFAULT_ROUTER_URL,
    poll_interval: float = 3.0,
    max_wait_seconds: Optional[float] = None,
    progress_callback: Optional[Any] = None,
) -> bool:
    """
    Blocks until llama-server router is alive and responding.
    Returns True when alive, or False if max_wait_seconds is exceeded.
    """
    if is_server_alive(server_url):
        return True

    log(f"llama-server at {server_url} is currently offline. Waiting for server to come alive...", prefix="⏳")
    if progress_callback:
        progress_callback("Waiting for local AI server to come online...")

    t0 = time.time()
    logged_wait = False

    while True:
        if is_server_alive(server_url):
            log(f"llama-server at {server_url} is active and ready! Resuming processing.", prefix="🚀")
            return True

        elapsed = time.time() - t0
        if max_wait_seconds and elapsed >= max_wait_seconds:
            error_log(f"Timed out after {max_wait_seconds}s waiting for llama-server at {server_url}.")
            return False

        if not logged_wait and elapsed >= 10:
            log(f"Still waiting for llama-server ({elapsed:.0f}s elapsed)... Start it with: ./scripts/start-llama-router.sh", prefix="ℹ️")
            logged_wait = True

        time.sleep(poll_interval)


# ── KV Context Clearing ───────────────────────────────────────────
def clear_llm_context(server_url: str, model_name: str) -> None:
    """
    Clears the KV cache slots for a model on llama-server to reclaim VRAM.
    Checks /slots and POSTs action=erase to active slots.
    """
    try:
        slots_url = f"{server_url.rstrip('/')}/slots"
        resp = requests.get(slots_url, timeout=3)
        if resp.status_code != 200:
            return

        slots_data = resp.json()
        if not isinstance(slots_data, list):
            return

        for slot in slots_data:
            slot_id = slot.get("id")
            slot_model = slot.get("model", "")
            if slot_id is not None and (not slot_model or model_name.lower() in slot_model.lower()):
                try:
                    requests.post(
                        f"{slots_url}/{slot_id}",
                        json={"action": "erase"},
                        timeout=3,
                    )
                except Exception:
                    pass
    except Exception:
        pass


# ── Token Metrics Computation ─────────────────────────────────────
def compute_token_metrics(
    stage1_usage: Dict[str, Any],
    stage2_usage: Dict[str, Any],
    model_video: str = MODEL_VIDEO,
    model_text: str = MODEL_TEXT,
) -> Dict[str, Any]:
    """Combines token usage from Stage 1 perception and Stage 2 distillation."""
    s1_tot = stage1_usage.get("total_tokens", 0)
    s2_tot = stage2_usage.get("total_tokens", 0)
    combined = s1_tot + s2_tot
    ctx_limit = MODEL_CONTEXT_LIMITS.get(model_video, 64128)

    return {
        "model": f"{model_video} (Stage 1) -> {model_text} (Stage 2)",
        "stage1_tokens": s1_tot,
        "stage2_tokens": s2_tot,
        "total_tokens": combined,
        "ctx_limit": ctx_limit,
        "ctx_percent": round((combined / ctx_limit) * 100, 2) if ctx_limit else 0.0,
        "prompt_tokens": stage1_usage.get("prompt_tokens", 0) + stage2_usage.get("prompt_tokens", 0),
        "completion_tokens": stage1_usage.get("completion_tokens", 0) + stage2_usage.get("completion_tokens", 0),
        "speed": stage2_usage.get("speed") or stage1_usage.get("speed"),
    }


# ── Llama Router Client ───────────────────────────────────────────
def call_llama_router(
    server_url: str = DEFAULT_ROUTER_URL,
    model_name: str = MODEL_TEXT,
    prompt: str = "",
    images: Optional[List[str]] = None,
    system_instruction: Optional[str] = None,
    response_json: bool = True,
    max_tokens: int = 2500,
    temperature: float = 0.15,
) -> Dict[str, Any]:
    """Sends chat completion request to llama-server router API."""
    endpoint = f"{server_url.rstrip('/')}/v1/chat/completions"

    if not system_instruction:
        system_instruction = DEFAULT_SYSTEM_INSTRUCTION

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_instruction},
    ]

    if images:
        user_content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
        for img_url in images:
            user_content.append({"type": "image_url", "image_url": {"url": img_url}})
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": prompt})

    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if response_json:
        payload["response_format"] = {"type": "json_object"}

    log(f"Dispatching inference to llama-server router [model: {model_name}]...")
    t0 = time.time()
    resp = None
    max_retries = 3

    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(endpoint, json=payload, timeout=600)
            break
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                log(f"Connection to llama-server failed ({e}). Waiting for server to become available (attempt {attempt}/{max_retries})...", prefix="⚠️")
                wait_for_server(server_url, poll_interval=3.0, max_wait_seconds=120)
            else:
                error_log(f"llama-server connection error after {max_retries} attempts: {e}")
                raise RuntimeError(f"Could not connect to llama-server router at {server_url}: {e}")

    t_infer = round(time.time() - t0, 1)

    if resp.status_code != 200:
        error_log(f"llama-server returned HTTP {resp.status_code}: {resp.text[:400]}")
        raise RuntimeError(f"llama-server error (HTTP {resp.status_code}): {resp.text[:200]}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise ValueError(f"No completions returned from llama-server: {data}")

    raw_text = choices[0].get("message", {}).get("content", "").strip()

    usage = data.get("usage", {})
    usage_metrics = {
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
        "model": model_name,
        "ctx_limit": MODEL_CONTEXT_LIMITS.get(model_name, 64128),
        "ctx_percent": round(
            (usage.get("total_tokens", 0) / MODEL_CONTEXT_LIMITS.get(model_name, 64128)) * 100, 2
        ),
        "inference_seconds": t_infer,
        "speed": round(usage.get("completion_tokens", 0) / t_infer, 1) if t_infer > 0 else 0,
    }

    if not response_json:
        return {"text": raw_text, "_usage": usage_metrics}

    # Clean json formatting
    cleaned_json = re.sub(r"^```(?:json)?\n?", "", raw_text)
    cleaned_json = re.sub(r"\n?```$", "", cleaned_json).strip()

    try:
        parsed = json.loads(cleaned_json)
    except Exception:
        match = re.search(r"\{.*\}", cleaned_json, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                parsed = {"text": clean_quote_text(cleaned_json), "category": "motivation", "author": ""}
        else:
            parsed = {"text": clean_quote_text(cleaned_json), "category": "motivation", "author": ""}

    raw_val = str(parsed.get("text", "")).strip()
    parsed["text"] = clean_quote_text(raw_val)

    # Validate category
    cat = str(parsed.get("category", "motivation")).lower()
    if cat not in VALID_CATEGORIES:
        cat = "motivation"
    parsed["category"] = cat
    parsed["_usage"] = usage_metrics

    return parsed
