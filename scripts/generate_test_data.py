#!/usr/bin/env python3
"""
Generate a synthetic fluorescence-microscope-style WebP dataset
for the Virtual Microscope app.

Output layout (matches public/manifest.json):
    public/assets/zoom_00/z_000.webp
    public/assets/zoom_00/z_001.webp
    ...
    public/assets/zoom_49/z_049.webp

Each frame is a 512×512 8-bit image with:
  - A diffuse pseudo-fluorescence background (Perlin-ish noise)
  - Bright "cell-like" blobs whose size shrinks with zoom (simulating magnification)
  - Focus effect: frames near the best-focus slice are sharp; others are progressively blurred

Requirements: Python 3.9+, Pillow (pip install Pillow)
Optional:     numpy (faster), but the script works with pure Pillow too.

Usage:
    python scripts/generate_test_data.py            # writes to public/assets/
    python scripts/generate_test_data.py --outdir /tmp/test_assets
    python scripts/generate_test_data.py --zooms 10 --slices 10  # smaller set for quick tests
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    sys.exit("Pillow is required.  Install it with:  pip install Pillow")


# --------------- constants / defaults ---------------

WIDTH = 512
HEIGHT = 512
DEFAULT_ZOOMS = 50
DEFAULT_SLICES = 50
BEST_FOCUS_SLICE = 25        # slice index with sharpest image (per zoom)
SEED = 42


# --------------- helpers ---------------

def make_background(rng: random.Random, brightness: float = 0.15) -> Image.Image:
    """Dark noisy background resembling auto-fluorescence."""
    img = Image.new("L", (WIDTH, HEIGHT), 0)
    pixels = img.load()
    assert pixels is not None
    for y in range(HEIGHT):
        for x in range(WIDTH):
            # Low-intensity Poisson-like noise
            val = int(rng.gauss(brightness * 255, 12))
            pixels[x, y] = max(0, min(255, val))
    return img


def draw_blobs(img: Image.Image, rng: random.Random, zoom: int, total_zooms: int) -> None:
    """Draw bright elliptical blobs (fake cells).  Size decreases with zoom."""
    draw = ImageDraw.Draw(img)
    # Higher zoom → smaller blobs, more of them
    base_radius = max(6, int(60 - (zoom / total_zooms) * 50))
    count = int(8 + zoom * 0.6)
    for _ in range(count):
        cx = rng.randint(base_radius, WIDTH - base_radius)
        cy = rng.randint(base_radius, HEIGHT - base_radius)
        rx = int(base_radius * rng.uniform(0.6, 1.4))
        ry = int(base_radius * rng.uniform(0.6, 1.4))
        intensity = rng.randint(140, 240)
        draw.ellipse(
            [cx - rx, cy - ry, cx + rx, cy + ry],
            fill=intensity,
        )
        # Bright core
        core = max(2, rx // 3)
        draw.ellipse(
            [cx - core, cy - core, cx + core, cy + core],
            fill=min(255, intensity + 40),
        )


def apply_focus_blur(img: Image.Image, focus: int) -> Image.Image:
    """Blur proportional to distance from best-focus plane."""
    dist = abs(focus - BEST_FOCUS_SLICE)
    if dist == 0:
        return img
    # Progressive Gaussian blur
    radius = dist * 0.6
    return img.filter(ImageFilter.GaussianBlur(radius=radius))


def colorize_green(gray: Image.Image) -> Image.Image:
    """Convert grayscale to green-channel fluorescence look."""
    zeros = Image.new("L", gray.size, 0)
    return Image.merge("RGB", (zeros, gray, zeros))


# --------------- main ---------------

def generate(outdir: Path, zooms: int, slices: int) -> None:
    rng = random.Random(SEED)
    total_frames = zooms * slices
    generated = 0

    for z in range(zooms):
        zoom_dir = outdir / f"zoom_{z:02d}"
        zoom_dir.mkdir(parents=True, exist_ok=True)

        # Seed per-zoom so blob layout is consistent across focus slices
        zoom_rng = random.Random(SEED + z)
        base = make_background(zoom_rng)
        draw_blobs(base, zoom_rng, z, zooms)

        for f in range(slices):
            frame = apply_focus_blur(base.copy(), f)
            frame = colorize_green(frame)
            fpath = zoom_dir / f"z_{f:03d}.webp"
            frame.save(fpath, "WEBP", quality=80)
            generated += 1
            if generated % 100 == 0 or generated == total_frames:
                pct = generated / total_frames * 100
                print(f"  [{pct:5.1f}%] {generated}/{total_frames}  →  {fpath}")

    print(f"\nDone — {generated} frames written to {outdir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic microscope test data")
    parser.add_argument(
        "--outdir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "public" / "assets",
        help="Output directory (default: public/assets/)",
    )
    parser.add_argument("--zooms", type=int, default=DEFAULT_ZOOMS, help="Number of zoom levels")
    parser.add_argument("--slices", type=int, default=DEFAULT_SLICES, help="Number of z-slices")
    args = parser.parse_args()

    print(f"Generating {args.zooms}×{args.slices} = {args.zooms * args.slices} frames "
          f"({WIDTH}×{HEIGHT} WebP) → {args.outdir}")
    generate(args.outdir, args.zooms, args.slices)


if __name__ == "__main__":
    main()
