#!/usr/bin/env python
"""
Transcribe a multilingual (Japanese + Bengali) audio/video file with
faster-whisper, large-v3 by default for best non-English accuracy.

Strategy: per-VAD-chunk dual-pass with script-density tiebreak.

For each VAD-detected speech window we run TWO forced-language
transcribe passes (ja + bn) and pick the result whose output text
actually contains the expected script:

  - JP CJK chars (Hiragana / Katakana / CJK Unified): force=ja kept
  - Bengali chars (U+0980 - U+09FF): force=bn kept
  - Both have script chars: tiebreak by avg_logprob
  - Neither: chunk is silence/noise, skipped

This avoids Whisper's bias toward Japanese (medium/large detect_language
defaults JA when uncertain) and the forced-JA-on-BN hallucination problem
where Whisper produces plausible-looking but wrong Japanese for Bengali
audio.

The English translation is then taken from a translate-task pass in the
*selected* source language, so it reflects what was actually said.

Output: public/transcript.json
  [{ startSec, endSec, lang, source, english,
     ja_logprob, bn_logprob, ja_chars, bn_chars }]

Usage:
  python scripts/transcribe.py [input_file]

Env:
  WHISPER_MODEL=large-v3   (default; medium is faster but poor on Bengali)
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

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

INPUT = sys.argv[1] if len(sys.argv) > 1 else "public/main-enhanced.mp4"
OUTPUT = "public/transcript.json"
MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")
SR = 16000
MIN_CHUNK_SEC = 0.8
MERGE_GAP_SEC = 0.15
MAX_CHUNK_SEC = 18.0


def is_jp_script(c: str) -> bool:
    return ("぀" <= c <= "ゟ") or ("゠" <= c <= "ヿ") or ("一" <= c <= "鿿")


def is_bn_script(c: str) -> bool:
    return "ঀ" <= c <= "৿"


def jp_score(text: str) -> int:
    return sum(1 for c in text if is_jp_script(c))


def bn_score(text: str) -> int:
    return sum(1 for c in text if is_bn_script(c))


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
    """Returns (text, avg_logprob)."""
    segments, _ = model.transcribe(
        audio_chunk,
        language=language,
        task=task,
        beam_size=5,
        vad_filter=False,
        condition_on_previous_text=False,
        without_timestamps=True,
    )
    parts = []
    logprobs = []
    for s in segments:
        parts.append(s.text.strip())
        logprobs.append(s.avg_logprob)
    text = " ".join(parts).strip()
    lp = sum(logprobs) / len(logprobs) if logprobs else -10.0
    return text, lp


results = []
for i, ch in enumerate(merged):
    a = audio[int(ch["start"]) : int(ch["end"])]
    start_sec = round(ch["start"] / SR, 3)
    end_sec = round(ch["end"] / SR, 3)

    ja_text, ja_lp = transcribe_chunk(a, "ja")
    bn_text, bn_lp = transcribe_chunk(a, "bn")

    ja_s = jp_score(ja_text)
    bn_s = bn_score(bn_text)

    # Decide language by script presence first, then avg_logprob.
    if ja_s >= 2 and bn_s < 2:
        lang = "ja"
    elif bn_s >= 2 and ja_s < 2:
        lang = "bn"
    elif ja_s >= 2 and bn_s >= 2:
        lang = "ja" if ja_lp >= bn_lp else "bn"
    else:
        # Neither pass produced its expected script; chunk is likely
        # noise, music, or silence-bleed. Skip.
        print(
            f"  [{i+1}/{len(merged)}] {start_sec:6.2f}-{end_sec:6.2f}  "
            f"no script (ja={ja_s} bn={bn_s}), skipped",
            flush=True,
        )
        continue

    source = ja_text if lang == "ja" else bn_text
    english, _ = transcribe_chunk(a, lang, task="translate")

    safe_src = source[:60].encode("ascii", "replace").decode("ascii")
    print(
        f"  [{i+1}/{len(merged)}] {start_sec:6.2f}-{end_sec:6.2f}  "
        f"lang={lang}  ja_lp={ja_lp:.2f} bn_lp={bn_lp:.2f} "
        f"ja_chars={ja_s} bn_chars={bn_s}  {safe_src}",
        flush=True,
    )

    results.append(
        {
            "startSec": start_sec,
            "endSec": end_sec,
            "lang": lang,
            "source": source,
            "english": english,
            "ja_logprob": round(ja_lp, 3),
            "bn_logprob": round(bn_lp, 3),
            "ja_chars": ja_s,
            "bn_chars": bn_s,
        }
    )

Path(OUTPUT).write_text(
    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"\nwrote {len(results)} segments -> {OUTPUT}")
print(f"  bengali:  {sum(1 for r in results if r['lang'] == 'bn')}")
print(f"  japanese: {sum(1 for r in results if r['lang'] == 'ja')}")
