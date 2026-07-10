"""Stage 2: per-page structured extraction via Claude vision.

Each page goes to the model as (rendered PNG + raw text layer). The model
transcribes tables cell-exact, describes diagrams, and emits key facts.
Figure ids/bboxes are snapped to the deterministic detections from render.py —
model bboxes arrive in pixel space and are never trusted for cropping.
"""

import argparse
import base64
from pathlib import Path

import fitz

from .llm import extract_structured
from .render import DOCS, PRODUCT_DIR, detect_figures
from .schema import PageExtraction

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "products" / "vulcan-omnipro-220" / "pages"
FILES = Path(__file__).resolve().parents[2] / "files"

SYSTEM = """You extract technical-manual pages into structured data for a welding-machine
support agent. Transcribe faithfully — never invent values. Capture every table cell exactly.
For each labeled diagram, describe what it shows and every callout label. key_facts are short,
self-contained statements a support agent could cite (include units, voltage variants, process
names). topics are lowercase kebab tags like duty-cycle, polarity, wire-feed, troubleshooting."""


def build_user_blocks(doc_slug: str, page_num: int) -> list:
    png = PRODUCT_DIR / "pages" / f"{doc_slug}-{page_num:02d}.png"
    with fitz.open(FILES / DOCS[doc_slug]) as pdf:
        raw_text = pdf[page_num - 1].get_text()
    return [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.standard_b64encode(png.read_bytes()).decode(),
            },
        },
        {"type": "text", "text": f"doc={doc_slug} page={page_num}\n\nRaw text layer:\n{raw_text}"},
    ]


def extract_page(doc_slug: str, page_num: int, out_dir: Path = DATA_DIR) -> PageExtraction:
    result = extract_structured(SYSTEM, build_user_blocks(doc_slug, page_num), PageExtraction)
    result.doc, result.page = doc_slug, page_num  # trust our ids, not the model's

    detected = detect_figures(FILES / DOCS[doc_slug], doc_slug, page_num)
    if detected:
        # Model bboxes are pixel-space (150dpi render); detected are PDF points.
        scale = 72 / 150
        for fr in result.figures:
            fy = (fr.bbox[1] + fr.bbox[3]) / 2 * scale
            best = min(detected, key=lambda d: abs((d["bbox"][1] + d["bbox"][3]) / 2 - fy))
            fr.figure_id = best["figure_id"]
            fr.bbox = best["bbox"]
        # One entry per detected figure: drop duplicates that snapped together.
        seen: set[str] = set()
        result.figures = [
            fr for fr in result.figures if not (fr.figure_id in seen or seen.add(fr.figure_id))
        ]
    else:
        result.figures = []

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{doc_slug}-{page_num:02d}.json").write_text(result.model_dump_json(indent=2))
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", choices=list(DOCS))
    ap.add_argument("--pages", help="e.g. 7-9 or 7")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--missing", action="store_true", help="skip pages already extracted")
    args = ap.parse_args()
    if args.all or args.missing:
        counts = {"owner-manual": 48, "quick-start-guide": 2, "selection-chart": 1}
        jobs = [(d, p) for d, n in counts.items() for p in range(1, n + 1)]
        if args.missing:
            jobs = [(d, p) for d, p in jobs if not (DATA_DIR / f"{d}-{p:02d}.json").exists()]
        print(f"{len(jobs)} pages to extract", flush=True)
    else:
        lo, _, hi = (args.pages or "1").partition("-")
        jobs = [(args.doc, p) for p in range(int(lo), int(hi or lo) + 1)]
    for doc, page in jobs:
        out = extract_page(doc, page)
        print(
            f"{doc} p{page}: {len(out.tables)} tables, {len(out.figures)} figures, "
            f"{len(out.key_facts)} facts",
            flush=True,
        )


if __name__ == "__main__":
    main()
