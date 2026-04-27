#!/usr/bin/env python
"""
Transcribe a multilingual (Japanese + Bengali) audio/video file.

Strategy: per-VAD-chunk dual-pass language detection with a specialized
re-transcription pass for Bengali.

For each VAD-detected speech window:

  1. Run TWO forced-language detection passes with the ORIGINAL Whisper
     large-v3 (force=ja and force=bn) and pick the language whose output
     actually contains the expected script (CJK for ja, Bengali for bn).
     - Both have script chars: tiebreak by avg_logprob
     - Neither: chunk is silence/noise, skipped
  2. If the chosen language is "bn", RE-TRANSCRIBE the chunk with the
     Bengali-specialized model (mozilla-ai/whisper-large-v3-bn) loaded via
     HuggingFace transformers. This gives much better Bengali quality.
     If it's "ja", keep the text from the ja pass.

We do not run a Whisper "translate" pass anymore — translations to English
and to the third language are produced downstream by NLLB-200 in
scripts/translate-nllb.mjs (Transformers.js).

Why this layout: the Bengali-specialized model only outputs Bengali, so it
cannot be used as a language detector. The script-density check on the
ORIGINAL large-v3 dual-pass is what avoids Whisper's bias toward Japanese
on uncertain audio and the forced-JA-on-BN hallucination problem.

Output: public/transcript.json
  [{ startSec, endSec, lang, source,
     ja_logprob, bn_logprob, ja_chars, bn_chars }]

Usage:
  python scripts/transcribe.py [input_file]

Env:
  WHISPER_MODEL=large-v3                       (detector model)
  BN_MODEL=mozilla-ai/whisper-large-v3-bn      (Bengali quality model)
"""
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.vad import VadOptions, get_speech_timestamps
from transformers import pipeline as hf_pipeline

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

INPUT = sys.argv[1] if len(sys.argv) > 1 else "public/main-enhanced.mp4"
OUTPUT = "public/transcript.json"
MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")
BN_MODEL_ID = os.environ.get("BN_MODEL", "mozilla-ai/whisper-large-v3-bn")
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


print(f"loading detector model: {MODEL_NAME}", flush=True)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")

print(f"loading Bengali model: {BN_MODEL_ID}", flush=True)
bn_pipe = hf_pipeline(
    "automatic-speech-recognition",
    model=BN_MODEL_ID,
    torch_dtype=torch.float32,
    device="cpu",
    chunk_length_s=30,
    return_timestamps=False,
    generate_kwargs={"language": "bn", "task": "transcribe"},
)

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


def detect_chunk(audio_chunk: np.ndarray, language: str):
    """Force-language pass with the detector model. Returns (text, avg_logprob)."""
    segments, _ = model.transcribe(
        audio_chunk,
        language=language,
        task="transcribe",
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


def transcribe_bn(audio_chunk: np.ndarray) -> str:
    """High-quality Bengali transcription via mozilla-ai/whisper-large-v3-bn."""
    result = bn_pipe({"array": audio_chunk.astype(np.float32), "sampling_rate": SR})
    return (result.get("text") or "").strip()


results = []
for i, ch in enumerate(merged):
    a = audio[int(ch["start"]) : int(ch["end"])]
    start_sec = round(ch["start"] / SR, 3)
    end_sec = round(ch["end"] / SR, 3)

    ja_text, ja_lp = detect_chunk(a, "ja")
    bn_text, bn_lp = detect_chunk(a, "bn")

    ja_s = jp_score(ja_text)
    bn_s = bn_score(bn_text)

    if ja_s >= 2 and bn_s < 2:
        lang = "ja"
    elif bn_s >= 2 and ja_s < 2:
        lang = "bn"
    elif ja_s >= 2 and bn_s >= 2:
        lang = "ja" if ja_lp >= bn_lp else "bn"
    else:
        print(
            f"  [{i+1}/{len(merged)}] {start_sec:6.2f}-{end_sec:6.2f}  "
            f"no script (ja={ja_s} bn={bn_s}), skipped",
            flush=True,
        )
        continue

    if lang == "bn":
        source = transcribe_bn(a) or bn_text  # fall back to detector text if specialized model returns empty
    else:
        source = ja_text

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
print("\nNext step: node scripts/translate-nllb.mjs  (writes public/translations.json)")
