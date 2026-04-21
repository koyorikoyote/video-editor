#!/usr/bin/env python
"""
Transcribe a multilingual (Japanese + Bengali) audio/video file.

Strategy: per-VAD-chunk language detection.

The audio is segmented by Whisper's VAD into speech windows. For each
window we run model.detect_language() to identify the language, then
transcribe the chunk with that language forced. This avoids the
hallucination problem of running the whole file with one forced language
(e.g. forcing 'ja' on Bengali speech produces fluent-but-wrong Japanese
because Whisper has to emit *something*).

After transcription, each chunk is also translated to English by running
Whisper again with task='translate'. The two non-English -> non-English
direction is filled in later by scripts/fill-third-lang.py via Argos.

Output: public/transcript.json
  [{ startSec, endSec, lang, lang_prob, source, english,
     avg_logprob, no_speech_prob }]

Usage:
  python scripts/transcribe.py [input_file]

Env:
  WHISPER_MODEL=medium  (default; large-v3 is more accurate but ~3x slower)
"""
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.vad import VadOptions, get_speech_timestamps

# Force stdout to UTF-8 so Japanese/Bengali don't crash Windows cp1252 console.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

INPUT = sys.argv[1] if len(sys.argv) > 1 else "public/main-polished.mp4"
OUTPUT = "public/transcript.json"
MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium")
SR = 16000
MIN_CHUNK_SEC = 1.0      # ignore VAD chunks shorter than this
MERGE_GAP_SEC = 0.4      # merge VAD chunks if their gap is smaller than this
MAX_CHUNK_SEC = 25.0     # split chunks longer than this for stable detect

print(f"loading model: {MODEL_NAME}", flush=True)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")

print(f"decoding audio: {INPUT}", flush=True)
audio = decode_audio(INPUT, sampling_rate=SR)

print("running VAD ...", flush=True)
vad_chunks = get_speech_timestamps(
    audio,
    VadOptions(min_silence_duration_ms=350, min_speech_duration_ms=500),
)
print(f"  {len(vad_chunks)} speech chunks before merge", flush=True)


def merge_chunks(chunks, gap_samples, max_samples):
    out = []
    for c in chunks:
        if (
            out
            and c["start"] - out[-1]["end"] < gap_samples
            and c["end"] - out[-1]["start"] < max_samples
        ):
            out[-1]["end"] = c["end"]
        else:
            out.append({"start": c["start"], "end": c["end"]})
    return out


merged = merge_chunks(
    vad_chunks,
    gap_samples=int(MERGE_GAP_SEC * SR),
    max_samples=int(MAX_CHUNK_SEC * SR),
)
merged = [c for c in merged if (c["end"] - c["start"]) >= MIN_CHUNK_SEC * SR]
print(f"  {len(merged)} chunks after merge (>= {MIN_CHUNK_SEC}s each)", flush=True)


def transcribe_chunk(audio_chunk: np.ndarray, language: str, task: str = "transcribe"):
    segments, _ = model.transcribe(
        audio_chunk,
        language=language,
        task=task,
        beam_size=5,
        vad_filter=False,                # we already chunked
        condition_on_previous_text=False,
        without_timestamps=True,         # one chunk = one timestamp window
    )
    return " ".join(s.text.strip() for s in segments).strip()


def detect_language(audio_chunk: np.ndarray):
    # detect_language requires at least 30s; pad short chunks with silence.
    needed = 30 * SR
    if len(audio_chunk) < needed:
        padded = np.zeros(needed, dtype=audio_chunk.dtype)
        padded[: len(audio_chunk)] = audio_chunk
        audio_chunk = padded
    lang, prob, _all = model.detect_language(audio_chunk)
    return lang, prob


results = []
for i, ch in enumerate(merged):
    a = audio[int(ch["start"]) : int(ch["end"])]
    start_sec = round(ch["start"] / SR, 3)
    end_sec = round(ch["end"] / SR, 3)
    lang, lang_prob = detect_language(a)

    # Restrict to the two languages we expect; if model picks something
    # else, fall back to the more likely of (ja, bn) by re-running detect
    # with a focused scan: since detect_language only returns the top, we
    # treat anything not in {ja, bn} as the closer-sounding of the two
    # via a logprob-based tie-break.
    if lang not in ("ja", "bn"):
        ja_text = transcribe_chunk(a, "ja")
        bn_text = transcribe_chunk(a, "bn")
        # Heuristic: count CJK characters vs Bengali characters in result.
        cjk = sum(1 for c in ja_text if "぀" <= c <= "ヿ" or "一" <= c <= "鿿")
        beng = sum(1 for c in bn_text if "ঀ" <= c <= "৿")
        if cjk >= beng:
            lang, source, english = "ja", ja_text, transcribe_chunk(a, "ja", "translate")
        else:
            lang, source, english = "bn", bn_text, transcribe_chunk(a, "bn", "translate")
    else:
        source = transcribe_chunk(a, lang)
        english = transcribe_chunk(a, lang, "translate")

    if not source.strip():
        print(f"  [{i+1}/{len(merged)}] {start_sec:6.2f}-{end_sec:6.2f}  empty, skipped", flush=True)
        continue

    safe_src = source[:60].encode("ascii", "replace").decode("ascii")
    print(
        f"  [{i+1}/{len(merged)}] {start_sec:6.2f}-{end_sec:6.2f}  "
        f"lang={lang} ({lang_prob:.2f})  {safe_src}",
        flush=True,
    )
    results.append(
        {
            "startSec": start_sec,
            "endSec": end_sec,
            "lang": lang,
            "lang_prob": round(lang_prob, 3),
            "source": source,
            "english": english,
        }
    )

Path(OUTPUT).write_text(
    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"\nwrote {len(results)} segments -> {OUTPUT}")
print(f"  bengali:  {sum(1 for r in results if r['lang'] == 'bn')}")
print(f"  japanese: {sum(1 for r in results if r['lang'] == 'ja')}")
