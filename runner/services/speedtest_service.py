"""Speedtest.net bandwidth test service using speedtest-cli.

Task schema (dict expected):
  type: "speedtest"
  servers: List[int | str] (optional) server IDs to consider; empty = all
  server: int | str (optional) single server ID convenience; merges into servers
  threads: int | null (optional) number of threads for dl/ul; None = auto
  secure: bool (optional, default True) use HTTPS endpoints
  share: bool (optional, default False) upload image and include share URL
  skip_download: bool (optional, default False) skip download test
  skip_upload: bool (optional, default False) skip upload test

Return dict structure:
  {
    task_type: "speedtest",
    status: "success" | "failure",
    summary: {
      duration_seconds,
      results: speedtest-cli results dict,
      human_readable: {
        download_mbps, upload_mbps, ping_ms, jitter_ms?, server_description,
        isp, verdict, notes
      },
      share_url?
    }
  }
"""

from __future__ import annotations

import time
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:  # noqa: BLE001
        return None


def _to_mbps(bits_per_second: Optional[float]) -> Optional[float]:
    if bits_per_second is None:
        return None
    try:
        return float(bits_per_second) / 1_000_000.0
    except Exception:  # noqa: BLE001
        return None


def run_speedtest(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a Speedtest.net measurement using the speedtest-cli library."""
    start_time = time.time()

    try:
        import speedtest  # type: ignore
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "speedtest",
            "status": "failure",
            "summary": {
                "error": "speedtest-cli is not installed",
                "reason": "Missing dependency: install with 'pip install speedtest-cli'",
                "exception": str(e),
            },
        }

    # Inputs
    raw_servers: Optional[List[Any]] = task.get("servers")
    single_server = task.get("server")
    if single_server is not None:
        try:
            if raw_servers is None:
                raw_servers = []
            raw_servers.append(single_server)
        except Exception:  # noqa: BLE001
            raw_servers = [single_server]

    servers: List[int] = []
    if isinstance(raw_servers, list):
        for s in raw_servers:
            v = _safe_int(s)
            if v is not None:
                servers.append(v)

    threads_value: Optional[int] = _safe_int(task.get("threads"))
    if threads_value is not None and threads_value <= 0:
        threads_value = None

    secure = bool(task.get("secure", True))
    share = bool(task.get("share", False))
    skip_download = bool(task.get("skip_download", False))
    skip_upload = bool(task.get("skip_upload", False))

    try:
        st = speedtest.Speedtest(secure=secure)

        # Server selection
        st.get_servers(servers or [])
        best_server = st.get_best_server()  # dict with selected server info

        # Perform tests
        if not skip_download:
            st.download(threads=threads_value)
        if not skip_upload:
            st.upload(threads=threads_value)

        # Optionally generate share image URL
        share_url: Optional[str] = None
        if share:
            try:
                share_url = st.results.share()
            except Exception:  # noqa: BLE001
                # non-fatal
                share_url = None

        results = st.results.dict()

        download_mbps = _to_mbps(results.get("download"))
        upload_mbps = _to_mbps(results.get("upload"))
        ping_ms = results.get("ping")
        jitter_ms = None
        try:
            ping_result = results.get("ping")
            # speedtest-cli dict doesn't always include jitter; some forks do
            jitter_ms = results.get("jitter") or results.get("jitter_ms")
        except Exception:  # noqa: BLE001
            jitter_ms = None

        server_desc = None
        try:
            srv = results.get("server") or best_server or {}
            if isinstance(srv, dict):
                name = srv.get("name")
                sponsor = srv.get("sponsor")
                country = srv.get("country")
                server_desc = ", ".join([str(x) for x in [name, sponsor, country] if x])
        except Exception:  # noqa: BLE001
            server_desc = None

        # Simple verdict
        notes: List[str] = []
        score = 100.0
        if isinstance(ping_ms, (int, float)):
            p = float(ping_ms)
            if p > 100:
                score -= 20.0
                notes.append(f"high ping {p:.0f} ms")
            elif p > 50:
                score -= 10.0
                notes.append(f"elevated ping {p:.0f} ms")
        if isinstance(download_mbps, (int, float)):
            d = float(download_mbps)
            if d < 10:
                score -= 40.0
                notes.append(f"slow download {d:.1f} Mbps")
            elif d < 25:
                score -= 20.0
                notes.append(f"moderate download {d:.1f} Mbps")
        if isinstance(upload_mbps, (int, float)):
            u = float(upload_mbps)
            if u < 5:
                score -= 25.0
                notes.append(f"slow upload {u:.1f} Mbps")

        score = max(0.0, min(100.0, score))
        verdict = (
            "excellent"
            if score >= 85
            else "good"
            if score >= 70
            else "fair"
            if score >= 50
            else "poor"
        )

        duration_seconds = round(time.time() - start_time, 2)

        summary: Dict[str, Any] = {
            "duration_seconds": duration_seconds,
            "results": results,
            "human_readable": {
                "download_mbps": download_mbps,
                "upload_mbps": upload_mbps,
                "ping_ms": ping_ms,
                "jitter_ms": jitter_ms,
                "server_description": server_desc,
                "isp": (results.get("client") or {}).get("isp")
                if isinstance(results.get("client"), dict)
                else None,
                "verdict": verdict,
                "notes": notes,
            },
        }
        if share_url:
            summary["share_url"] = share_url

        return {
            "task_type": "speedtest",
            "status": "success",
            "summary": summary,
        }

    except Exception as e:  # noqa: BLE001
        logger.error("Speedtest failed with exception: %s", e)
        duration_seconds = round(time.time() - start_time, 2)
        return {
            "task_type": "speedtest",
            "status": "failure",
            "summary": {
                "reason": "Exception during speedtest execution",
                "error": str(e),
                "duration_seconds": duration_seconds,
            },
        }


__all__ = ["run_speedtest"]
