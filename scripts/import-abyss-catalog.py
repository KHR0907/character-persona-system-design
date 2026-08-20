#!/usr/bin/env python3
"""Import the complete, resolved character catalog from a local abyss-api checkout."""

from __future__ import annotations

import argparse
import importlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT.parent / "abyss-api"
OUTPUT_ROOT = ROOT / "catalog" / "abyss-api"
CHARACTER_ROOT = OUTPUT_ROOT / "characters"


def git_output(source: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(source), *args],
        text=True,
    ).strip()


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Path to the abyss-api checkout (default: ../abyss-api)",
    )
    args = parser.parse_args()
    source = args.source.resolve()

    if not (source / "app" / "seed_data.py").is_file():
        raise SystemExit(f"Not an abyss-api checkout: {source}")

    sys.path.insert(0, str(source))
    seed_data = importlib.import_module("app.seed_data")
    personas = importlib.import_module("app.character_personas")

    rows = seed_data.character_rows()
    profiles = personas.PERSONA_PROFILES
    slugs = [str(row["slug"]) for row in rows]
    if set(slugs) != set(profiles):
        missing = sorted(set(slugs) - set(profiles))
        extra = sorted(set(profiles) - set(slugs))
        raise SystemExit(f"Catalog/persona mismatch; missing={missing}, extra={extra}")

    source_info = {
        "repository": "abyss-api",
        "remote": git_output(source, "remote", "get-url", "origin"),
        "revision": git_output(source, "rev-parse", "HEAD"),
        "persona_version": personas.PERSONA_VERSION,
    }

    CHARACTER_ROOT.mkdir(parents=True, exist_ok=True)
    expected_files = {f"{slug}.json" for slug in slugs}
    for existing in CHARACTER_ROOT.glob("*.json"):
        if existing.name not in expected_files:
            existing.unlink()

    groups: dict[str, list[str]] = {}
    entries: list[dict[str, object]] = []
    for row in rows:
        slug = str(row["slug"])
        group = str(row["group_label"])
        filename = f"characters/{slug}.json"
        document = {
            "source": source_info,
            "character": row,
            "persona": personas.build_character_persona(row),
        }
        write_json(OUTPUT_ROOT / filename, document)
        groups.setdefault(group, []).append(slug)
        entries.append(
            {
                "slug": slug,
                "name": row["name"],
                "group": group,
                "file": filename,
            }
        )

    manifest = {
        "source": source_info,
        "character_count": len(entries),
        "groups": [
            {"label": label, "characters": group_slugs}
            for label, group_slugs in groups.items()
        ],
        "characters": entries,
    }
    write_json(OUTPUT_ROOT / "manifest.json", manifest)
    print(
        f"Imported {len(entries)} abyss-api characters at "
        f"{source_info['revision']} into {OUTPUT_ROOT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
