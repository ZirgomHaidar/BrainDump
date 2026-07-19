#!/usr/bin/env python3
"""
BrainDump Importer Database & Queue Listener
Handles Firestore initialization, saving reflections to Firestore and local JSON backup,
and daemon listening on the Firestore 'importQueue' collection.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .config import LOCAL_CACHE_FILE, PROJECT_ROOT, error_log, log

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud.firestore import FieldFilter
except ImportError:
    firebase_admin = None
    FieldFilter = None


# ── Firestore Client ───────────────────────────────────────────────
def get_firestore_client():
    """Initializes Firebase Admin Firestore client if credentials exist."""
    if firebase_admin is None:
        return None

    if firebase_admin._apps:
        return firestore.client()

    cred = None
    service_account_paths = [
        PROJECT_ROOT / "service-account.json",
        PROJECT_ROOT / "scripts" / "service-account.json",
        PROJECT_ROOT / ".firebase-service-account.json",
    ]

    env_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env_path and os.path.exists(env_path):
        cred = credentials.Certificate(env_path)
    else:
        for p in service_account_paths:
            if p.exists():
                cred = credentials.Certificate(str(p))
                log(f"Using Firebase service account from {p}")
                break

    if cred:
        try:
            firebase_admin.initialize_app(cred)
            return firestore.client()
        except Exception as e:
            error_log(f"Failed to initialize Firebase Admin: {e}")
            return None

    return None


# ── Save Reflection ────────────────────────────────────────────────
def save_reflection(item: Dict[str, Any], dry_run: bool = False) -> None:
    """Saves an extracted reflection to Firestore and local JSON backup."""
    if dry_run:
        log("DRY RUN: Skipping Firestore and local cache save.", prefix="⚠️")
        return

    doc_data = {
        "text": item.get("text", "").strip(),
        "category": item.get("category", "motivation"),
        "author": item.get("author", "").strip(),
        "createdAt": datetime.now(timezone.utc),
        "sourceUrl": item.get("sourceUrl", ""),
        "sourcePlatform": item.get("sourcePlatform", ""),
        "tokenUsage": item.get("tokenUsage", {}),
    }

    # 1. Save to Firestore
    db = get_firestore_client()
    if db:
        try:
            url = doc_data["sourceUrl"]
            existing = None
            if url:
                if FieldFilter is not None:
                    query = db.collection("reflections").where(filter=FieldFilter("sourceUrl", "==", url))
                else:
                    query = db.collection("reflections").where("sourceUrl", "==", url)
                docs = list(query.limit(1).stream())
                if docs:
                    existing = docs[0]

            if existing:
                log(f"Updating existing Firestore reflection [{existing.id}]...")
                existing.reference.update(doc_data)
                log("Updated in Firestore ✅")
            else:
                log("Saving new reflection to Firestore 'reflections' collection...")
                _, doc_ref = db.collection("reflections").add(doc_data)
                log(f"Saved to Firestore [{doc_ref.id}] ✅")
        except Exception as e:
            error_log(f"Failed to save to Firestore: {e}")
    else:
        log("No Firestore credentials found; skipping cloud sync.", prefix="ℹ️")

    # 2. Save to local JSON backup
    try:
        data: list = []
        if LOCAL_CACHE_FILE.exists():
            try:
                data = json.loads(LOCAL_CACHE_FILE.read_text(encoding="utf-8"))
            except Exception:
                data = []

        entry = {
            "text": doc_data["text"],
            "category": doc_data["category"],
            "author": doc_data["author"],
            "createdAt": doc_data["createdAt"].isoformat(),
            "sourceUrl": doc_data["sourceUrl"],
            "sourcePlatform": doc_data["sourcePlatform"],
            "tokenUsage": doc_data["tokenUsage"],
        }

        # Deduplicate local cache by sourceUrl
        existing_idx = next(
            (i for i, x in enumerate(data) if x.get("sourceUrl") == entry["sourceUrl"] and entry["sourceUrl"]),
            None,
        )
        if existing_idx is not None:
            data[existing_idx] = entry
        else:
            data.append(entry)

        LOCAL_CACHE_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        log(f"Saved to local cache: {LOCAL_CACHE_FILE}")
    except Exception as e:
        error_log(f"Failed to update local cache: {e}")


# ── Queue Listener Daemon ─────────────────────────────────────────
def run_listener_loop(
    process_fn: Callable[..., Optional[Dict[str, Any]]],
    server_url: str,
    num_frames: int = 8,
    insta_session: Optional[str] = None,
    insta_login: Optional[str] = None,
    poll_interval: float = 3.0,
) -> None:
    """
    Subscribes to Firestore collection 'importQueue' and processes pending jobs
    submitted from the web app or mobile.
    """
    db = get_firestore_client()
    if not db:
        error_log(
            "Firestore service account credentials not found!\n"
            "To use queue listener mode, place 'service-account.json' in the project root "
            "or set GOOGLE_APPLICATION_CREDENTIALS."
        )
        sys.exit(1)

    log("==========================================================")
    log(" BrainDump Motivation Worker Daemon Active", prefix="🚀")
    log(f" Llama Router: {server_url}")
    log(f" Polling Firestore 'importQueue' every {poll_interval}s...")
    log(" Ready to receive links from Vercel web app or mobile!")
    log("==========================================================")

    while True:
        try:
            queue_ref = db.collection("importQueue")
            if FieldFilter is not None:
                query = queue_ref.where(filter=FieldFilter("status", "==", "pending"))
            else:
                query = queue_ref.where("status", "==", "pending")

            pending_docs = list(query.limit(5).stream())

            for doc in pending_docs:
                data = doc.to_dict()
                url = data.get("url", "").strip()
                if not url:
                    doc.reference.delete()
                    continue

                log(f"Found pending job [{doc.id}]: {url}", prefix="📥")
                t_start = time.time()

                doc.reference.update({
                    "status": "processing",
                    "step": "Starting local GPU extraction...",
                    "startedAt": firestore.SERVER_TIMESTAMP,
                })

                def update_step(msg: str):
                    try:
                        doc.reference.update({"step": msg})
                    except Exception:
                        pass

                try:
                    result = process_fn(
                        url=url,
                        server_url=server_url,
                        num_frames=num_frames,
                        dry_run=False,
                        insta_session=insta_session,
                        insta_login=insta_login,
                        progress_callback=update_step,
                    )

                    if result:
                        job_elapsed = round(time.time() - t_start, 1)
                        mins = int(job_elapsed // 60)
                        secs = int(job_elapsed % 60)
                        dur_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

                        created_dt = data.get("createdAt")
                        total_elapsed = job_elapsed
                        if created_dt and hasattr(created_dt, "timestamp"):
                            total_elapsed = max(job_elapsed, round(time.time() - created_dt.timestamp(), 1))
                        tot_mins = int(total_elapsed // 60)
                        tot_secs = int(total_elapsed % 60)
                        tot_dur_str = f"{tot_mins}m {tot_secs}s" if tot_mins > 0 else f"{tot_secs}s"

                        u = result.get("tokenUsage", {})
                        bk = u.get("breakdown", {})
                        if "stage1_seconds" in bk and "stage2_seconds" in bk:
                            step_msg = f"Completed in {dur_str} (Vision: {bk['stage1_seconds']}s • Distill: {bk['stage2_seconds']}s)"
                        elif "download_seconds" in bk:
                            step_msg = f"Completed in {dur_str} (Download: {bk['download_seconds']}s • AI: {dur_str})"
                        else:
                            step_msg = f"Completed in {dur_str}!"

                        doc.reference.update({
                            "status": "completed",
                            "step": step_msg,
                            "completedAt": firestore.SERVER_TIMESTAMP,
                            "durationSeconds": job_elapsed,
                            "durationFormatted": dur_str,
                            "totalDurationSeconds": total_elapsed,
                            "totalDurationFormatted": tot_dur_str,
                            "durationBreakdown": bk,
                        })
                        log(f"Successfully processed job [{doc.id}] in {dur_str} (Total: {tot_dur_str})! ({step_msg})", prefix="✅")
                    else:
                        doc.reference.update({
                            "status": "failed",
                            "step": "Failed to extract motivation.",
                            "error": "Failed to parse content from URL.",
                        })
                except Exception as err:
                    error_log(f"Error executing job [{doc.id}]: {err}")
                    doc.reference.update({
                        "status": "failed",
                        "step": "Failed",
                        "error": str(err)[:200],
                    })

            time.sleep(poll_interval)

        except KeyboardInterrupt:
            log("Stopping worker daemon...", prefix="🛑")
            break
        except Exception as e:
            error_log(f"Listener error: {e}")
            time.sleep(poll_interval * 2)
