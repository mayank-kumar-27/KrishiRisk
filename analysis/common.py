"""Shared helpers: fixed paths, logging, polite HTTP with retry, name normalisation."""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from pathlib import Path

import requests

# ---- Fixed paths (resolved from this file, never from the shell's CWD) ----------
ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / "analysis"
LOGS = ANALYSIS / "logs"
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "public" / "data"
FIGURES = ROOT / "report" / "figures"

RAW_GEO = RAW / "geo"
RAW_CLIMATE = RAW / "climate"
RAW_CROP = RAW / "crop"
RAW_SOIL = RAW / "soil"


def redact(text: str) -> str:
    """Hide API keys in URLs / messages before they are logged."""
    return re.sub(r"(api[-_]?key=)[^&\s'\"]+", r"\1***", str(text), flags=re.I)


def load_env() -> None:
    """Load KEY=VALUE lines from the repo's .env (gitignored) into os.environ, without
    overriding variables that are already set. Used for API keys - never commit them."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class ManualDownloadRequired(RuntimeError):
    """Raised when a data file must be downloaded by hand. Message says exactly what to do."""


def get_logger(script_name: str) -> logging.Logger:
    """Log to stdout and to analysis/logs/<script_name>.log (overwritten each run)."""
    LOGS.mkdir(parents=True, exist_ok=True)
    if hasattr(sys.stdout, "reconfigure"):  # Windows code pages can't print every character
        sys.stdout.reconfigure(errors="replace")
    logger = logging.getLogger(script_name)
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s", "%H:%M:%S")
    for h in (
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOGS / f"{script_name}.log", mode="w", encoding="utf-8"),
    ):
        h.setFormatter(fmt)
        logger.addHandler(h)
    return logger


def rel(path: Path) -> str:
    """Path relative to the repo root, for readable logs."""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


# ---- HTTP -------------------------------------------------------------------------
class PoliteClient:
    """requests wrapper: minimum gap between calls + retries with exponential backoff."""

    def __init__(self, min_interval_s: float, max_retries: int = 5, timeout_s: float = 180,
                 logger: logging.Logger | None = None):
        self.min_interval_s = min_interval_s
        self.max_retries = max_retries
        self.timeout_s = timeout_s
        self.log = logger or logging.getLogger(__name__)
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "krishirisk-research-pipeline/0.1 (academic project)"
        self._last = 0.0

    def get(self, url: str, params=None, stream: bool = False) -> requests.Response:
        for attempt in range(1, self.max_retries + 1):
            wait = self.min_interval_s - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                r = self.session.get(url, params=params, timeout=self.timeout_s, stream=stream)
            except requests.RequestException as e:
                err, retry_after = redact(f"{type(e).__name__}: {e}"), None
            else:
                if r.status_code == 200:
                    return r
                if r.status_code not in (429, 500, 502, 503, 504):
                    # 4xx other than 429: retrying won't help. Raise without the query string,
                    # which can contain an API key.
                    raise RuntimeError(f"GET {url} failed: HTTP {r.status_code} {redact(r.text[:200])}")
                err, retry_after = f"HTTP {r.status_code}", r.headers.get("Retry-After")
            if attempt == self.max_retries:
                raise RuntimeError(f"GET {url} failed after {attempt} attempts ({err})")
            backoff = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt * 3
            self.log.warning(f"  {err}; retry {attempt}/{self.max_retries - 1} in {backoff:.0f}s")
            time.sleep(backoff)
        raise AssertionError("unreachable")


def write_json_atomic(path: Path, obj) -> None:
    """Write via a temp file so an interrupted run never leaves a half-written cache file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(json.dumps(obj), encoding="utf-8")
    os.replace(tmp, path)


def read_json_or_none(path: Path):
    """Return parsed JSON, or None if the file is missing or corrupt."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


# ---- Names ----------------------------------------------------------------------------
def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def norm_name(name: str) -> str:
    """Normalise a place name for matching: lowercase, '&'->'and', drop punctuation,
    spaces and generic suffixes like 'district'."""
    s = str(name).lower().replace("&", " and ")
    s = re.sub(r"\b(district|dist|distt)\b\.?", " ", s)
    return re.sub(r"[^a-z]", "", s)


# Alternate state spellings found across Indian datasets -> the (normalised) spelling used
# in the datameet Census 2011 map, which has a few quirks of its own.
STATE_ALIASES = {
    "uttaranchal": "uttarakhand",
    "orissa": "odisha",
    "pondicherry": "puducherry",
    "delhi": "nctofdelhi",
    "arunachalpradesh": "arunanchalpradesh",
    "andamanandnicobarislands": "andamanandnicobarisland",
    "andamanandnicobar": "andamanandnicobarisland",
    "dadraandnagarhaveli": "dadaraandnagarhavelli",
}


def norm_state(name: str) -> str:
    n = norm_name(name)
    return STATE_ALIASES.get(n, n)


# ---- insights.md sections -------------------------------------------------------------------
# 03 writes the EDA part of report/figures/insights.md; 04 and 05 each own a marked section that
# they replace on re-run. 03 keeps those sections when it rewrites the file.
_SECTION = re.compile(r"<!-- (\w+)-section:start -->.*?<!-- \1-section:end -->\n?", re.S)


def upsert_section(path: Path, name: str, content: str) -> None:
    text = path.read_text(encoding="utf-8") if path.exists() else "# KrishiRisk - insights\n"
    block = f"<!-- {name}-section:start -->\n{content.strip()}\n<!-- {name}-section:end -->\n"
    pattern = re.compile(rf"<!-- {name}-section:start -->.*?<!-- {name}-section:end -->\n?", re.S)
    text = pattern.sub("", text).rstrip("\n") + "\n\n" + block
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def marked_sections(path: Path) -> str:
    """All marked sections currently in the file (to carry over when the file is rewritten)."""
    if not path.exists():
        return ""
    return "".join(m.group(0) for m in _SECTION.finditer(path.read_text(encoding="utf-8")))
