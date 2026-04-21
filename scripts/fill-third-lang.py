#!/usr/bin/env python
"""
Fill in the third-language translation for each transcript segment.

Whisper has given us:
  - source text in dominant language (ja or bn)
  - English translation

This script adds the *other* non-source language by routing English
through Argos Translate offline:
  - source=ja  -> en  -> bn   (Argos: en->bn)
  - source=bn  -> en  -> ja   (Argos: en->ja)

Output: public/translations.json — keyed by "<startSec>-<endSec>" with
the missing language string. Consumed by scripts/build-captions.mjs.
"""
import json
from pathlib import Path

import argostranslate.package
import argostranslate.translate

TRANSCRIPT = Path("public/transcript.json")
OUTPUT = Path("public/translations.json")

print("ensuring Argos packages: en<->ja, en<->bn ...", flush=True)
argostranslate.package.update_package_index()
available = argostranslate.package.get_available_packages()
need = [("en", "ja"), ("en", "bn"), ("ja", "en"), ("bn", "en")]
for src, tgt in need:
    pkg = next(
        (p for p in available if p.from_code == src and p.to_code == tgt),
        None,
    )
    if not pkg:
        print(f"  ! no Argos package for {src} -> {tgt}", flush=True)
        continue
    if not any(
        ip.from_code == src and ip.to_code == tgt
        for ip in argostranslate.package.get_installed_packages()
    ):
        print(f"  installing {src} -> {tgt} ...", flush=True)
        argostranslate.package.install_from_path(pkg.download())
    else:
        print(f"  already installed: {src} -> {tgt}", flush=True)

transcript = json.loads(TRANSCRIPT.read_text(encoding="utf-8"))
out = {}
for i, seg in enumerate(transcript):
    key = f"{seg['startSec']}-{seg['endSec']}"
    en = (seg.get("english") or "").strip()
    if not en:
        continue
    if seg["lang"] == "ja":
        target = "bn"
        translated = argostranslate.translate.translate(en, "en", target)
        out[key] = {"bn": translated}
    elif seg["lang"] == "bn":
        target = "ja"
        translated = argostranslate.translate.translate(en, "en", target)
        out[key] = {"jp": translated}
    if (i + 1) % 10 == 0:
        print(f"  translated {i+1}/{len(transcript)} segments", flush=True)

OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nwrote {len(out)} third-language translations -> {OUTPUT}")
