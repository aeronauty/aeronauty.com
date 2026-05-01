#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Iterable, NamedTuple

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "graph-fitting" / "linkedin-exchange"
INPUT_DIR = ROOT / "redaction-sources" / "linkedin-exchange"


class Box(NamedTuple):
    x1: float
    y1: float
    x2: float
    y2: float


class Redaction(NamedTuple):
    box: Box
    kind: str = "black"


FILES = {
    "01-original-post": ("Untitled 2.png", "01-original-post-redacted.png"),
    "02-andrew-first-question": ("Untitled3.png", "02-andrew-first-question-redacted.png"),
    "03-response-defending-quintic": ("Untitled3.png", "03-response-defending-quintic-redacted.png"),
    "04-andrew-power-function-followup": ("Untitled4.png", "04-andrew-power-function-followup-redacted.png"),
    "05-initial-blunt-reply": ("Untitled6.png", "05-initial-blunt-reply-redacted.png"),
    "06-follow-up-apology": ("Untitled8.png", "06-follow-up-apology-redacted.png"),
    "07-link-to-interactive-tool": ("Untitled7.png", "07-link-to-interactive-tool-redacted.png"),
    "08-please-dont-swear": ("Untitled7.png", "08-please-dont-swear-redacted.png"),
}


# Boxes are normalized against the 721 x 1568 iPhone screenshots supplied in the thread.
# Each redacts the requested OP name and blurs their profile image where visible.
REDACTIONS: dict[str, list[Redaction]] = {
    "01-original-post": [
        Redaction(Box(22, 198, 104, 280), "blur"),
        Redaction(Box(101, 205, 350, 236)),
    ],
    "02-andrew-first-question": [
        Redaction(Box(100, 330, 164, 361)),
        Redaction(Box(99, 1090, 160, 1154), "blur"),
        Redaction(Box(172, 1095, 380, 1129)),
    ],
    "03-response-defending-quintic": [
        Redaction(Box(99, 1090, 160, 1154), "blur"),
        Redaction(Box(172, 1095, 380, 1129)),
    ],
    "04-andrew-power-function-followup": [
        Redaction(Box(204, 575, 410, 606)),
    ],
    "05-initial-blunt-reply": [
        Redaction(Box(172, 276, 380, 307)),
        Redaction(Box(172, 841, 380, 872)),
    ],
    "06-follow-up-apology": [
        Redaction(Box(172, 843, 380, 874)),
        Redaction(Box(99, 1276, 160, 1338), "blur"),
        Redaction(Box(100, 1275, 320, 1308)),
    ],
    "07-link-to-interactive-tool": [
        Redaction(Box(172, 293, 380, 324)),
        Redaction(Box(99, 718, 160, 780), "blur"),
        Redaction(Box(172, 719, 380, 752)),
        Redaction(Box(99, 1150, 160, 1212), "blur"),
        Redaction(Box(100, 1150, 320, 1183)),
    ],
    "08-please-dont-swear": [
        Redaction(Box(99, 718, 160, 780), "blur"),
        Redaction(Box(172, 719, 380, 752)),
    ],
}

CROPS: dict[str, Box] = {
    "03-response-defending-quintic": Box(56, 1054, 704, 1372),
    "08-please-dont-swear": Box(57, 690, 704, 1128),
}


def find_input(filename: str) -> Path | None:
    candidate = INPUT_DIR / filename
    return candidate if candidate.exists() else None


def scale_box(box: Box, size: tuple[int, int]) -> tuple[int, int, int, int]:
    width, height = size
    sx = width / 721
    sy = height / 1568
    return (
        round(box.x1 * sx),
        round(box.y1 * sy),
        round(box.x2 * sx),
        round(box.y2 * sy),
    )


def blur_region(image: Image.Image, coords: tuple[int, int, int, int]) -> None:
    region = image.crop(coords).filter(ImageFilter.GaussianBlur(radius=14))
    image.paste(region, coords)


def black_bar(draw: ImageDraw.ImageDraw, coords: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = coords
    pad_x = max(3, round((x2 - x1) * 0.03))
    pad_y = max(2, round((y2 - y1) * 0.08))
    draw.rounded_rectangle(
        (x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y),
        radius=max(2, round((y2 - y1) * 0.12)),
        fill=(0, 0, 0),
    )


def redact(stem: str, output_name: str, redactions: Iterable[Redaction]) -> bool:
    input_filename = FILES[stem][0]
    input_path = find_input(input_filename)
    if input_path is None:
        print(f"missing: {INPUT_DIR / input_filename}")
        return False

    image = Image.open(input_path).convert("RGB")
    draw = ImageDraw.Draw(image)
    for item in redactions:
        coords = scale_box(item.box, image.size)
        if item.kind == "blur":
            blur_region(image, coords)
        else:
            black_bar(draw, coords)

    if stem in CROPS:
        image = image.crop(scale_box(CROPS[stem], image.size))

    output_path = ASSET_DIR / output_name
    image.save(output_path, "PNG", optimize=True)
    print(f"wrote: {output_path}")
    return True


def main() -> int:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    ok = True
    for stem, (_, output_name) in FILES.items():
        ok = redact(stem, output_name, REDACTIONS[stem]) and ok

    if not ok:
        print()
        print("Put the original screenshots in:")
        print(f"  {INPUT_DIR}")
        print()
        print("Expected filenames:")
        for filename, _ in FILES.values():
            print(f"  {filename}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
