from unittest.mock import patch

from omnipro_pipeline.extract import build_user_blocks, extract_page
from omnipro_pipeline.schema import PageExtraction


def test_user_blocks_contain_image_and_raw_text():
    blocks = build_user_blocks("owner-manual", 7)
    kinds = [b["type"] for b in blocks]
    assert "image" in kinds and "text" in kinds
    text_block = next(b for b in blocks if b["type"] == "text")
    assert "Specifications" in text_block["text"]  # p7 raw text really says this


def test_extract_page_validates_and_writes(tmp_path):
    fake = PageExtraction(
        doc="owner-manual",
        page=7,
        summary="specs",
        text="MIG specs...",
        key_facts=["MIG 240V duty cycle 25% @ 200A"],
    )
    with patch("omnipro_pipeline.extract.extract_structured", return_value=fake):
        out = extract_page("owner-manual", 7, out_dir=tmp_path)
    assert out.page == 7
    assert (tmp_path / "owner-manual-07.json").exists()


def test_extract_page_snaps_figure_bboxes_to_detected_point_space(tmp_path):
    # Model returns a pixel-space bbox; the stored bbox must be the detected
    # PDF-point bbox so crops are correct.
    from omnipro_pipeline.render import detect_figures
    from pathlib import Path

    manual = Path(__file__).resolve().parents[2] / "files" / "owner-manual.pdf"
    detected = detect_figures(manual, "owner-manual", 8)
    fake = PageExtraction(
        doc="owner-manual",
        page=8,
        summary="controls",
        text="front panel",
        figures=[
            {
                "figure_id": "made-up-id",
                "page": 8,
                "caption": "Front Panel Controls",
                "description": "labeled front panel",
                "bbox": (180, 430, 1080, 800),  # pixel-ish, y-center ~615px -> ~295pt
            }
        ],
    )
    with patch("omnipro_pipeline.extract.extract_structured", return_value=fake):
        out = extract_page("owner-manual", 8, out_dir=tmp_path)
    assert out.figures[0].figure_id in {d["figure_id"] for d in detected}
    assert tuple(out.figures[0].bbox) in {tuple(d["bbox"]) for d in detected}
