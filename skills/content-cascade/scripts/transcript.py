#!/usr/bin/env python3
"""content-os YouTube transcript reader.

Reads the actual captions of one YouTube video. No API key is needed.

Methods, in order (``--method auto``):
  1. youtube-transcript-api (pip install youtube-transcript-api): manually
     created captions first, then auto-generated captions, in the preferred
     languages, then any language.
  2. yt-dlp (pip install yt-dlp, or the yt-dlp binary): original subtitles
     first, then automatic captions, parsed from WebVTT.

Output is one JSON object on stdout (or plain text with --format text):
  available, method, videoId, url, title (yt-dlp only), language,
  isGenerated, segments [{start, duration, text}], coverageSeconds,
  wordCount, text, attempts [{method, ok, error}].
When every method fails, available is false and attempts names each failure.
A title, thumbnail or description is never returned as a transcript.

Usage:
  python3 transcript.py <video-url-or-id> [--lang en,en-US] [--method auto|api|yt-dlp]
                        [--format json|text] [--max-chars N]
"""
from __future__ import annotations

import argparse
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, urlparse

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def video_id(value: str) -> str | None:
    """Return the 11-character video id from a URL or a bare id."""
    value = (value or "").strip()
    if VIDEO_ID.match(value):
        return value
    try:
        parsed = urlparse(value if "://" in value else "https://" + value)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    candidate = None
    if host == "youtu.be":
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com", "youtube-nocookie.com"):
        if parsed.path == "/watch":
            candidate = (parse_qs(parsed.query).get("v") or [None])[0]
        else:
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v"):
                candidate = parts[1]
    return candidate if candidate and VIDEO_ID.match(candidate) else None


_TIME = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})")
_TAG = re.compile(r"<[^>]+>")


def _seconds(match: re.Match) -> float:
    hours, minutes, seconds, millis = match.groups()
    return int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def parse_vtt(text: str) -> list[dict]:
    """Parse WebVTT cues into segments, dropping the rolling duplicates that
    YouTube automatic captions repeat from one cue to the next."""
    segments: list[dict] = []
    previous_lines: list[str] = []
    blocks = re.split(r"\r?\n\r?\n", text.replace("﻿", ""))
    for block in blocks:
        lines = [line for line in block.splitlines() if line.strip()]
        timing_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if timing_index is None:
            continue
        start_end = lines[timing_index].split("-->")
        start_match = _TIME.search(start_end[0])
        end_match = _TIME.search(start_end[1]) if len(start_end) > 1 else None
        if not start_match:
            continue
        start = _seconds(start_match)
        end = _seconds(end_match) if end_match else start
        cue_lines = [html.unescape(_TAG.sub("", line)).strip() for line in lines[timing_index + 1:]]
        cue_lines = [line for line in cue_lines if line]
        fresh = [line for line in cue_lines if line not in previous_lines]
        previous_lines = cue_lines
        if not fresh:
            continue
        segments.append({"start": round(start, 3), "duration": round(max(0.0, end - start), 3), "text": " ".join(fresh)})
    return segments


def _result(method: str, vid: str, language: str | None, generated: bool | None, segments: list[dict], title: str | None = None) -> dict:
    text = " ".join(s["text"] for s in segments).strip()
    coverage = max((s["start"] + s["duration"] for s in segments), default=0)
    return {
        "available": bool(text),
        "method": method,
        "videoId": vid,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "title": title,
        "language": language,
        "isGenerated": generated,
        "segments": segments,
        "coverageSeconds": round(coverage, 1),
        "wordCount": len(text.split()),
        "text": text,
    }


def via_api(vid: str, languages: list[str]) -> dict:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
    except ImportError as error:
        raise RuntimeError("youtube-transcript-api is not installed (pip install youtube-transcript-api)") from error
    api = YouTubeTranscriptApi()
    listing = api.list(vid)
    transcripts = list(listing)
    if not transcripts:
        raise RuntimeError("no captions are listed for this video")
    preferred = [t for lang in languages for t in transcripts if t.language_code == lang or t.language_code.split("-")[0] == lang.split("-")[0]]
    ordered = (
        [t for t in preferred if not t.is_generated]
        + [t for t in preferred if t.is_generated]
        + [t for t in transcripts if not t.is_generated]
        + [t for t in transcripts if t.is_generated]
    )
    chosen = ordered[0]
    fetched = chosen.fetch()
    segments = []
    for snippet in fetched:
        text = getattr(snippet, "text", None) if not isinstance(snippet, dict) else snippet.get("text")
        start = getattr(snippet, "start", None) if not isinstance(snippet, dict) else snippet.get("start")
        duration = getattr(snippet, "duration", None) if not isinstance(snippet, dict) else snippet.get("duration")
        text = html.unescape(str(text or "")).replace("\n", " ").strip()
        if text:
            segments.append({"start": round(float(start or 0), 3), "duration": round(float(duration or 0), 3), "text": text})
    return _result("youtube-transcript-api", vid, chosen.language_code, bool(chosen.is_generated), segments)


def _yt_dlp_command() -> list[str] | None:
    if shutil.which("yt-dlp"):
        return ["yt-dlp"]
    try:
        import yt_dlp  # type: ignore  # noqa: F401
        return [sys.executable, "-m", "yt_dlp"]
    except ImportError:
        return None


def via_yt_dlp(vid: str, languages: list[str]) -> dict:
    command = _yt_dlp_command()
    if not command:
        raise RuntimeError("yt-dlp is not installed (pip install yt-dlp)")
    url = f"https://www.youtube.com/watch?v={vid}"
    langs = ",".join(languages + [lang.split("-")[0] + ".*" for lang in languages])
    errors = []
    with tempfile.TemporaryDirectory(prefix="content-os-subs-") as tmp:
        for flag, generated in (("--write-subs", False), ("--write-auto-subs", True)):
            for old in glob.glob(os.path.join(tmp, "*")):
                os.remove(old)
            args = command + ["--skip-download", flag, "--sub-langs", langs, "--sub-format", "vtt", "--no-playlist",
                              "--print", "%(title)s", "--no-simulate", "-o", os.path.join(tmp, "%(id)s.%(ext)s"), url]
            try:
                done = subprocess.run(args, capture_output=True, text=True, timeout=120)
            except subprocess.TimeoutExpired:
                errors.append(f"{flag}: timed out")
                continue
            files = sorted(glob.glob(os.path.join(tmp, "*.vtt")))
            if not files:
                errors.append(f"{flag}: no subtitles ({(done.stderr or done.stdout).strip().splitlines()[-1:] or ['none listed']})")
                continue
            ranked = sorted(files, key=lambda f: next((i for i, lang in enumerate(languages) if f".{lang}." in os.path.basename(f)), len(languages)))
            path = ranked[0]
            language = os.path.basename(path).split(".")[-2]
            with open(path, encoding="utf-8", errors="replace") as handle:
                segments = parse_vtt(handle.read())
            title = (done.stdout or "").strip().splitlines()[0] if (done.stdout or "").strip() else None
            return _result("yt-dlp", vid, language, generated, segments, title)
    raise RuntimeError("; ".join(errors) or "yt-dlp returned no subtitles")


def read_transcript(value: str, languages: list[str], method: str = "auto", api=via_api, ytdlp=via_yt_dlp) -> dict:
    vid = video_id(value)
    if not vid:
        return {"available": False, "videoId": None, "error": "Not a YouTube video URL or 11-character video id.", "attempts": []}
    attempts = []
    methods = {"api": [("youtube-transcript-api", api)], "yt-dlp": [("yt-dlp", ytdlp)]}.get(method, [("youtube-transcript-api", api), ("yt-dlp", ytdlp)])
    for name, reader in methods:
        try:
            result = reader(vid, languages)
            if result.get("available"):
                attempts.append({"method": name, "ok": True})
                result["attempts"] = attempts
                return result
            attempts.append({"method": name, "ok": False, "error": "captions were empty"})
        except Exception as error:  # every failure is reported, never hidden
            attempts.append({"method": name, "ok": False, "error": str(error)[:400] or type(error).__name__})
    return {"available": False, "videoId": vid, "url": f"https://www.youtube.com/watch?v={vid}",
            "error": "No transcript could be obtained. Do not substitute the title, thumbnail or description.", "attempts": attempts}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read the actual captions of one YouTube video.")
    parser.add_argument("video", help="YouTube URL or 11-character video id")
    parser.add_argument("--lang", default="en", help="preferred caption languages, comma separated (default: en)")
    parser.add_argument("--method", choices=["auto", "api", "yt-dlp"], default="auto")
    parser.add_argument("--format", choices=["json", "text"], default="json")
    parser.add_argument("--max-chars", type=int, default=0, help="truncate the text field (0 = no limit)")
    options = parser.parse_args(argv)
    languages = [lang.strip() for lang in options.lang.split(",") if lang.strip()] or ["en"]
    result = read_transcript(options.video, languages, options.method)
    if options.max_chars and result.get("text") and len(result["text"]) > options.max_chars:
        result["text"] = result["text"][: options.max_chars]
        result["truncated"] = True
    if options.format == "text" and result.get("available"):
        header = f"# transcript {result['videoId']} via {result['method']} ({result['language']}, {'auto-generated' if result['isGenerated'] else 'original captions'}, {result['coverageSeconds']}s)\n"
        lines = [f"[{int(s['start'] // 60)}:{int(s['start'] % 60):02d}] {s['text']}" for s in result["segments"]]
        sys.stdout.write(header + "\n".join(lines) + "\n")
    else:
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return 0 if result.get("available") else 2


if __name__ == "__main__":
    sys.exit(main())
