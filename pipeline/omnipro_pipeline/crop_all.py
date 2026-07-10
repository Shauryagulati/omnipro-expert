"""Crop every extracted figure region to a committed 300dpi PNG."""

from .extract import DATA_DIR, FILES
from .render import DOCS, PRODUCT_DIR, crop_figure
from .schema import PageExtraction


def main() -> None:
    n = 0
    for pj in sorted(DATA_DIR.glob("*.json")):
        page = PageExtraction.model_validate_json(pj.read_text())
        for fr in page.figures:
            out = PRODUCT_DIR / "figures" / f"{fr.figure_id}.png"
            crop_figure(FILES / DOCS[page.doc], page.page, fr.bbox, out)
            n += 1
    print(f"cropped {n} figures")


if __name__ == "__main__":
    main()
