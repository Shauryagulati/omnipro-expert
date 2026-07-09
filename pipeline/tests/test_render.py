from pathlib import Path

from omnipro_pipeline.render import crop_figure, detect_figures, render_pages

REPO = Path(__file__).resolve().parents[2]
MANUAL = REPO / "files" / "owner-manual.pdf"


def test_renders_all_48_pages(tmp_path):
    pages = render_pages(MANUAL, "owner-manual", tmp_path)
    assert len(pages) == 48
    assert (tmp_path / "owner-manual-01.png").exists()
    assert (tmp_path / "owner-manual-48.png").exists()
    assert pages[0].width > 500


def test_detects_figures_on_controls_page():
    figs = detect_figures(MANUAL, "owner-manual", 8)  # front panel diagram page
    assert len(figs) >= 1
    assert figs[0]["figure_id"].startswith("owner-manual-p08-f")


def test_crop_figure_writes_png(tmp_path):
    figs = detect_figures(MANUAL, "owner-manual", 8)
    out = tmp_path / "crop.png"
    crop_figure(MANUAL, 8, figs[0]["bbox"], out)
    assert out.exists() and out.stat().st_size > 1000
