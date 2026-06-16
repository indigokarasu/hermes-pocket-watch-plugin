"""Pocket Watch dashboard plugin — backend API routes.

Mounted at /api/plugins/pocket-watch/ by the dashboard plugin system.
Provides endpoints for job listing, timeline views, health stats, and maintenance.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, HTTPException

log = logging.getLogger(__name__)

router = APIRouter()


def _get_jobs_path() -> Path:
    """Locate the cron jobs.json file."""
    home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    # Try profile-specific path first, then fall back
    candidates = [
        home / "profiles" / "indigo" / "cron" / "jobs.json",
        home / "cron" / "jobs.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]  # default even if not found


def _load_jobs() -> List[Dict]:
    """Load all cron jobs from jobs.json."""
    path = _get_jobs_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("jobs", [])
    except Exception as e:
        log.warning("Error loading jobs.json: %s", e)
        return []


def _parse_cron_expr(expr: str) -> Dict[str, Any]:
    """Parse a cron expression into components. Returns dict with minute, hour, dom, month, dow."""
    parts = expr.strip().split()
    if len(parts) < 5:
        return {"raw": expr, "minute": "*", "hour": "*", "dom": "*", "month": "*", "dow": "*"}
    return {
        "raw": expr,
        "minute": parts[0],
        "hour": parts[1],
        "dom": parts[2],
        "month": parts[3],
        "dow": parts[4],
    }


def _is_daily_job(cron: Dict) -> bool:
    """Check if a cron job runs at least once every day (not day-of-week or day-of-month restricted)."""
    dom = cron.get("dom", "*")
    dow = cron.get("dow", "*")
    month = cron.get("month", "*")
    # If dom is * and dow is *, it runs every day
    return dom == "*" and dow == "*" and month == "*"


def _is_weekly_job(cron: Dict) -> bool:
    """Check if a cron job is primarily weekly (has specific dow or runs once per week)."""
    dow = cron.get("dow", "*")
    return dow != "*"


def _is_monthly_job(cron: Dict) -> bool:
    """Check if a cron job is primarily monthly (has specific dom like 1st, 15th, etc.)."""
    dom = cron.get("dom", "*")
    return dom != "*"


def _get_job_type(job: Dict) -> str:
    """Determine job type: 'script', 'llm', or 'hybrid'."""
    has_script = bool(job.get("script"))
    has_skill = bool(job.get("skill"))
    prompt = job.get("prompt", "")
    if has_script and (has_skill or prompt):
        return "hybrid"
    if has_script:
        return "script"
    return "llm"


def _get_status_t(job: Dict) -> str:
    """Get normalized status for a job."""
    if not job.get("enabled", True):
        return "paused"
    state = job.get("state", "")
    if state == "paused":
        return "paused"
    last_status = job.get("last_status")
    if last_status is None:
        return "never_run"
    if last_status == "error":
        return "error"
    if last_status == "ok":
        return "ok"
    return "unknown"


def _compute_health_score(job: Dict) -> float:
    """Compute a 0-100 health score for a job."""
    score = 100.0
    if not job.get("enabled", True):
        return 0.0
    consecutive = job.get("consecutive_failures", 0)
    score -= min(consecutive * 20, 60)
    last_status = job.get("last_status")
    if last_status == "error":
        score -= 30
    elif last_status is None:
        score -= 10
    completed = job.get("repeat", {}).get("completed", 0)
    if completed == 0:
        score -= 5
    return max(0.0, min(100.0, score))


# ---------------------------------------------------------------------------
# GET /status — plugin overview
# ---------------------------------------------------------------------------

@router.get("/status")
def get_status():
    """Return Pocket Watch plugin status overview."""
    jobs = _load_jobs()
    total = len(jobs)
    enabled = sum(1 for j in jobs if j.get("enabled", True))
    paused = total - enabled
    ok_count = sum(1 for j in jobs if _get_status_t(j) == "ok")
    error_count = sum(1 for j in jobs if _get_status_t(j) == "error")
    never_run = sum(1 for j in jobs if _get_status_t(j) == "never_run")
    llm_count = sum(1 for j in jobs if _get_job_type(j) == "llm")
    script_count = sum(1 for j in jobs if _get_job_type(j) == "script")
    hybrid_count = sum(1 for j in jobs if _get_job_type(j) == "hybrid")

    avg_health = 0.0
    if jobs:
        avg_health = sum(_compute_health_score(j) for j in jobs) / total

    return {
        "plugin": "pocket-watch",
        "version": "1.0.0",
        "status": "active",
        "jobs": {
            "total": total,
            "enabled": enabled,
            "paused": paused,
            "ok": ok_count,
            "error": error_count,
            "never_run": never_run,
            "by_type": {
                "llm": llm_count,
                "script": script_count,
                "hybrid": hybrid_count,
            },
        },
        "health": {
            "average": round(avg_health, 1),
        },
    }


# ---------------------------------------------------------------------------
# GET /jobs — list all jobs with enriched data
# ---------------------------------------------------------------------------

@router.get("/jobs")
def get_jobs(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: ok, error, paused, never_run"),
    type_filter: Optional[str] = Query(None, alias="type", description="Filter by type: llm, script, hybrid"),
    limit: int = Query(200, ge=1, le=500),
):
    """Return all cron jobs with enriched metadata."""
    jobs = _load_jobs()

    enriched = []
    for j in jobs:
        job_type = _get_job_type(j)
        status = _get_status_t(j)
        schedule = j.get("schedule", {})
        cron_expr = schedule.get("expr", "")
        cron_parsed = _parse_cron_expr(cron_expr) if cron_expr else {}

        enriched.append({
            "id": j.get("id", ""),
            "name": j.get("name", "Unnamed"),
            "type": job_type,
            "status": status,
            "enabled": j.get("enabled", True),
            "state": j.get("state", ""),
            "schedule": {
                "kind": schedule.get("kind", ""),
                "expr": cron_expr,
                "parsed": cron_parsed,
                "display": j.get("schedule_display", cron_expr),
            },
            "last_run_at": j.get("last_run_at"),
            "next_run_at": j.get("next_run_at"),
            "last_status": j.get("last_status"),
            "consecutive_failures": j.get("consecutive_failures", 0),
            "completed": j.get("repeat", {}).get("completed", 0),
            "skill": j.get("skill"),
            "script": j.get("script"),
            "health_score": round(_compute_health_score(j), 1),
            "is_daily": _is_daily_job(cron_parsed),
            "is_weekly": _is_weekly_job(cron_parsed),
            "is_monthly": _is_monthly_job(cron_parsed),
        })

    # Apply filters
    if status_filter:
        enriched = [j for j in enriched if j["status"] == status_filter]
    if type_filter:
        enriched = [j for j in enriched if j["type"] == type_filter]

    return {
        "jobs": enriched[:limit],
        "total": len(enriched),
    }


# ---------------------------------------------------------------------------
# GET /timeline/daily — daily schedule grid
# ---------------------------------------------------------------------------

@router.get("/timeline/daily")
def get_daily_timeline():
    """Return jobs organized by hour for a daily schedule view."""
    jobs = _load_jobs()

    # Initialize 24-hour grid
    hours = {h: [] for h in range(24)}

    for j in jobs:
        if not j.get("enabled", True):
            continue
        schedule = j.get("schedule", {})
        expr = schedule.get("expr", "")
        if not expr:
            continue

        cron = _parse_cron_expr(expr)
        hour_str = cron.get("hour", "*")
        minute_str = cron.get("minute", "0")

        # Determine which hours this job runs
        target_hours = []
        if hour_str == "*":
            target_hours = list(range(24))
        elif "/" in hour_str:
            # e.g., "9-17" or "*/2"
            if "-" in hour_str and "/" not in hour_str.split("-")[0]:
                parts = hour_str.split("-")
                start, end = int(parts[0]), int(parts[1])
                target_hours = list(range(start, end + 1))
            else:
                # */N pattern
                step = int(hour_str.split("/")[1])
                target_hours = list(range(0, 24, step))
        elif "," in hour_str:
            target_hours = [int(h) for h in hour_str.split(",")]
        else:
            try:
                target_hours = [int(hour_str)]
            except ValueError:
                continue

        # Determine minutes
        target_minutes = []
        if minute_str == "*":
            target_minutes = [0]
        elif "/" in minute_str:
            step = int(minute_str.split("/")[1])
            target_minutes = list(range(0, 60, step))
        elif "," in minute_str:
            target_minutes = [int(m) for m in minute_str.split(",")]
        else:
            try:
                target_minutes = [int(minute_str)]
            except ValueError:
                continue

        job_type = _get_job_type(j)
        status = _get_status_t(j)

        for h in target_hours:
            if 0 <= h < 24:
                for m in target_minutes:
                    hours[h].append({
                        "id": j.get("id", ""),
                        "name": j.get("name", "Unnamed"),
                        "type": job_type,
                        "status": status,
                        "minute": m,
                        "health_score": round(_compute_health_score(j), 1),
                        "completed": j.get("repeat", {}).get("completed", 0),
                        "last_status": j.get("last_status"),
                    })

    # Sort jobs within each hour by minute
    for h in hours:
        hours[h].sort(key=lambda x: (x["minute"], x["name"]))

    return {
        "view": "daily",
        "hours": [{"hour": h, "jobs": hours[h]} for h in range(24)],
    }


# ---------------------------------------------------------------------------
# GET /timeline/weekly — weekly schedule grid
# ---------------------------------------------------------------------------

@router.get("/timeline/weekly")
def get_weekly_timeline():
    """Return jobs organized by day of week for a weekly schedule view."""
    jobs = _load_jobs()

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dow_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    grid = {d: [] for d in days}

    for j in jobs:
        if not j.get("enabled", True):
            continue
        schedule = j.get("schedule", {})
        expr = schedule.get("expr", "")
        if not expr:
            continue

        cron = _parse_cron_expr(expr)
        dow_str = cron.get("dow", "*")
        hour_str = cron.get("hour", "*")
        minute_str = cron.get("minute", "0")

        # Determine which days this job runs
        target_days = []
        if dow_str == "*":
            target_days = list(range(7))
        elif "-" in dow_str and "/" not in dow_str:
            parts = dow_str.split("-")
            start, end = int(parts[0]), int(parts[1])
            target_days = list(range(start, end + 1))
        elif "/" in dow_str:
            step = int(dow_str.split("/")[1])
            target_days = list(range(0, 7, step))
        elif "," in dow_str:
            target_days = [int(d) for d in dow_str.split(",")]
        else:
            try:
                target_days = [int(dow_str)]
            except ValueError:
                continue

        # Parse hour for display
        display_time = ""
        if hour_str != "*" and "/" not in hour_str and "," not in hour_str:
            try:
                h = int(hour_str)
                m = int(minute_str) if minute_str != "*" else 0
                display_time = f"{h:02d}:{m:02d}"
            except ValueError:
                pass

        job_type = _get_job_type(j)
        status = _get_status_t(j)

        for d in target_days:
            if 0 <= d < 7:
                grid[dow_map[d]].append({
                    "id": j.get("id", ""),
                    "name": j.get("name", "Unnamed"),
                    "type": job_type,
                    "status": status,
                    "time": display_time,
                    "health_score": round(_compute_health_score(j), 1),
                    "completed": j.get("repeat", {}).get("completed", 0),
                    "last_status": j.get("last_status"),
                })

    return {
        "view": "weekly",
        "days": [{"day": d, "jobs": grid[d]} for d in days],
    }


# ---------------------------------------------------------------------------
# GET /timeline/monthly — monthly schedule grid
# ---------------------------------------------------------------------------

@router.get("/timeline/monthly")
def get_monthly_timeline():
    """Return jobs organized by day of month for a monthly schedule view."""
    jobs = _load_jobs()

    grid = {d: [] for d in range(1, 32)}

    for j in jobs:
        if not j.get("enabled", True):
            continue
        schedule = j.get("schedule", {})
        expr = schedule.get("expr", "")
        if not expr:
            continue

        cron = _parse_cron_expr(expr)
        dom_str = cron.get("dom", "*")
        hour_str = cron.get("hour", "*")
        minute_str = cron.get("minute", "0")

        # Determine which days of month this job runs
        target_days = []
        if dom_str == "*":
            target_days = list(range(1, 32))
        elif "-" in dom_str and "/" not in dom_str:
            parts = dom_str.split("-")
            start, end = int(parts[0]), int(parts[1])
            target_days = list(range(start, min(end + 1, 32)))
        elif "/" in dom_str:
            step = int(dom_str.split("/")[1])
            target_days = list(range(1, 32, step))
        elif "," in dom_str:
            target_days = [int(d) for d in dom_str.split(",") if int(d) <= 31]
        else:
            try:
                d = int(dom_str)
                if 1 <= d <= 31:
                    target_days = [d]
            except ValueError:
                continue

        # Parse hour for display
        display_time = ""
        if hour_str != "*" and "/" not in hour_str and "," not in hour_str:
            try:
                h = int(hour_str)
                m = int(minute_str) if minute_str != "*" else 0
                display_time = f"{h:02d}:{m:02d}"
            except ValueError:
                pass

        job_type = _get_job_type(j)
        status = _get_status_t(j)

        for d in target_days:
            grid[d].append({
                "id": j.get("id", ""),
                "name": j.get("name", "Unnamed"),
                "type": job_type,
                "status": status,
                "time": display_time,
                "health_score": round(_compute_health_score(j), 1),
                "completed": j.get("repeat", {}).get("completed", 0),
                "last_status": j.get("last_status"),
            })

    return {
        "view": "monthly",
        "days": [{"day": d, "jobs": grid[d]} for d in range(1, 32)],
    }


# ---------------------------------------------------------------------------
# GET /health — health summary
# ---------------------------------------------------------------------------

@router.get("/health")
def get_health():
    """Return health summary for all jobs."""
    jobs = _load_jobs()

    health_data = []
    for j in jobs:
        score = _compute_health_score(j)
        health_data.append({
            "id": j.get("id", ""),
            "name": j.get("name", "Unnamed"),
            "score": round(score, 1),
            "status": _get_status_t(j),
            "consecutive_failures": j.get("consecutive_failures", 0),
            "last_status": j.get("last_status"),
            "last_run_at": j.get("last_run_at"),
            "completed": j.get("repeat", {}).get("completed", 0),
        })

    # Sort by score ascending (worst first)
    health_data.sort(key=lambda x: x["score"])

    return {
        "jobs": health_data,
        "summary": {
            "total": len(health_data),
            "healthy": sum(1 for h in health_data if h["score"] >= 80),
            "degraded": sum(1 for h in health_data if 40 <= h["score"] < 80),
            "critical": sum(1 for h in health_data if h["score"] < 40),
        },
    }
