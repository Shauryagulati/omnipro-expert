"""Stage 1: render PDF pages to PNGs and crop figure regions.

Page views render at 150dpi (browsing quality); figure crops at 300dpi
(diagram-legible). Figure candidates come from PyMuPDF's image-block info;
tiny blocks (icons, warning triangles) are skipped.
"""

from dataclasses import dataclass
from pathlib import Path

import fitz

PRODUCT_DIR = Path(__file__).resolve().parents[2] / "public" / "products" / "vulcan-omnipro-220"
DOCS = {
    "owner-manual": "owner-manual.pdf",
    "quick-start-guide": "quick-start-guide.pdf",
    "selection-chart": "selection-chart.pdf",
}


@dataclass
class PageRender:
    doc: str
    page: int
    png_path: Path
    width: int
    height: int


def render_pages(pdf_path: Path, doc_slug: str, out_dir: Path, dpi: int = 150) -> list[PageRender]:
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    with fitz.open(pdf_path) as pdf:
        for i, page in enumerate(pdf, start=1):
            pix = page.get_pixmap(dpi=dpi)
            png = out_dir / f"{doc_slug}-{i:02d}.png"
            pix.save(png)
            results.append(PageRender(doc_slug, i, png, pix.width, pix.height))
    return results


def detect_figures(pdf_path: Path, doc_slug: str, page_num: int) -> list[dict]:
    """Figure candidates = raster image blocks + vector-drawing clusters.

    This manual's diagrams are mostly vector line art (raster images appear on
    only a handful of pages), so image blocks alone find almost nothing.
    """
    with fitz.open(pdf_path) as pdf:
        page = pdf[page_num - 1]
        rects = [fitz.Rect(info["bbox"]) for info in page.get_image_info()]
        rects += page.cluster_drawings(x_tolerance=8, y_tolerance=8)

        keep: list[fitz.Rect] = []
        for r in rects:
            if r.width < 60 or r.height < 60:  # icons, rules, section tabs
                continue
            for k in keep:  # merge heavy overlaps into one region
                if (r & k).get_area() > 0.4 * min(r.get_area(), k.get_area()):
                    k.include_rect(r)
                    break
            else:
                keep.append(r)

        # Absorb flanking callout labels: narrow text blocks that vertically
        # overlap a figure belong to it; wide blocks are body text and stay out.
        text_blocks = [fitz.Rect(b[:4]) for b in page.get_text("blocks") if b[6] == 0]
        for r in keep:
            for tb in text_blocks:
                label_shaped = tb.width < 150 and tb.height < 60
                overlap = min(tb.y1, r.y1) - max(tb.y0, r.y0)
                near = tb.x0 < r.x1 + 60 and tb.x1 > r.x0 - 60
                if label_shaped and near and overlap > tb.height / 2:
                    r.include_rect(tb)

        keep.sort(key=lambda r: (round(r.y0 / 50), r.x0))  # reading order
        return [
            {
                "figure_id": f"{doc_slug}-p{page_num:02d}-f{k}",
                "page": page_num,
                "bbox": (r.x0, r.y0, r.x1, r.y1),
            }
            for k, r in enumerate(keep, start=1)
        ]


def crop_figure(pdf_path: Path, page_num: int, bbox, out_path: Path, dpi: int = 300) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with fitz.open(pdf_path) as pdf:
        page = pdf[page_num - 1]
        pad = 6
        clip = fitz.Rect(bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad) & page.rect
        page.get_pixmap(dpi=dpi, clip=clip).save(out_path)


def main() -> None:
    files_dir = Path(__file__).resolve().parents[2] / "files"
    for slug, fname in DOCS.items():
        pages = render_pages(files_dir / fname, slug, PRODUCT_DIR / "pages")
        print(f"{slug}: {len(pages)} pages rendered")


if __name__ == "__main__":
    main()
