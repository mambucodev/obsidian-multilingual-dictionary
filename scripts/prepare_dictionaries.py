#!/usr/bin/env python3
"""
prepare_dictionaries.py
Converts WordNet data to JSON format optimized for the Obsidian plugin.

Usage:
    pip install wn
    python prepare_dictionaries.py           # Build all languages
    python prepare_dictionaries.py en it     # Build specific languages
"""

from __future__ import annotations

import sys
import json
import gzip
from collections import defaultdict
from typing import Any

try:
    import wn  # type: ignore[import-untyped]
except ImportError:
    print("Error: 'wn' package not installed. Run: pip install wn")
    sys.exit(1)

LANGUAGES: dict[str, str] = {
    "en": "oewn:2025",
    "it": "omw-it:1.4",
    "es": "omw-es:1.4",
    "fr": "omw-fr:1.4",
    "de": "omw-de:1.4",
    "pt": "omw-pt:1.4",
    "nl": "omw-nl:1.4",
    "pl": "omw-pl:1.4",
    "ja": "omw-ja:1.4",
    "zh": "omw-zh:1.4",
}


def export_wordnet_to_json(lang_code: str, wordnet_id: str) -> None:
    print(f"Processing {lang_code} ({wordnet_id})...")

    try:
        wn_obj: Any = wn.Wordnet(wordnet_id)
    except wn.Error:
        print(f"  Downloading {wordnet_id}...")
        wn.download(wordnet_id)
        wn_obj = wn.Wordnet(wordnet_id)

    index: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)

    synsets: list[Any] = list(wn_obj.synsets())
    total = len(synsets)
    print(f"  Found {total} synsets")

    for i, synset in enumerate(synsets):
        if (i + 1) % 5000 == 0:
            print(f"  Processing synset {i + 1}/{total}...")

        lemmas: list[str] = list(synset.lemmas())

        hypernyms: list[str] = [
            h.lemmas()[0] for h in synset.hypernyms() if h.lemmas()
        ]
        hyponyms: list[str] = [
            h.lemmas()[0] for h in synset.hyponyms()[:5] if h.lemmas()
        ]

        entry: dict[str, Any] = {
            "synset_id": synset.id(),
            "pos": synset.pos(),
            "definition": synset.definition() or "",
            "examples": synset.examples() or [],
            "synonyms": lemmas,
            "hypernyms": hypernyms,
            "hyponyms": hyponyms,
        }

        for lemma in lemmas:
            index[lemma.lower()].append(entry)

    version = wordnet_id.split(":")[1] if ":" in wordnet_id else "1.0"

    output: dict[str, Any] = {
        "version": version,
        "language": lang_code,
        "index": dict(index),
    }

    # Save as uncompressed JSON (for import via JSON button)
    json_file = f"{lang_code}-dict.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)
    print(f"  Saved {json_file}")

    # Save as compressed JSON (for download or import via .gz button)
    gz_file = f"{lang_code}-dict.json.gz"
    with gzip.open(gz_file, "wt", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)
    print(f"  Saved {gz_file}")

    print(f"  Done: {len(index)} words indexed")


def main() -> None:
    if len(sys.argv) > 1:
        targets = sys.argv[1:]
    else:
        targets = list(LANGUAGES.keys())

    for lang in targets:
        if lang not in LANGUAGES:
            print(f"Unknown language: {lang}")
            print(f"Available: {', '.join(LANGUAGES.keys())}")
            continue
        export_wordnet_to_json(lang, LANGUAGES[lang])

    print("\nAll done!")


if __name__ == "__main__":
    main()
