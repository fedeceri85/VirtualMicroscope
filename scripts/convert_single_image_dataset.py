#!/usr/bin/env python3
"""
Convert one high-resolution TIFF or ImageJ hyperstack into WebP assets.

This converter is for datasets that have one source magnification. The app will
load the same high-resolution WebP focus slice for every zoom position and use
PixiJS sprite scaling for true zoom and pan.

Output layout:
    public/assets/<dataset_id>/zoom_00/z_000.webp
    public/assets/<dataset_id>/zoom_00/z_001.webp
    ...

Requirements: Python 3.9+, tifffile, numpy, Pillow
    (available in the napari conda environment)

Usage:
    conda run -n napari python scripts/convert_single_image_dataset.py \
      "datasets/Myo7a Blue CtBP2 Red_Apical Region.tif" \
      --channel-names Myo7a CtBP2 \
      --colors blue red \
      --focus-step 2 \
      --reverse-focus \
      --append-multitiff datasets/Sem_rotated.tif --append-multitiff-label SEM
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError:
    sys.exit("numpy is required. Install it with: pip install numpy")

try:
    import tifffile
except ImportError:
    sys.exit("tifffile is required. Install it with: pip install tifffile")

try:
    from PIL import Image, ImageSequence
except ImportError:
    sys.exit("Pillow is required. Install it with: pip install Pillow")


COLOR_VECTORS: dict[str, tuple[int, int, int]] = {
    "red": (1, 0, 0),
    "green": (0, 1, 0),
    "blue": (0, 0, 1),
    "magenta": (1, 0, 1),
    "cyan": (0, 1, 1),
    "yellow": (1, 1, 0),
    "gray": (1, 1, 1),
    "grey": (1, 1, 1),
    "white": (1, 1, 1),
}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "single-image-dataset"


def make_dataset_name(stem: str) -> str:
    return stem.replace("_", " ").replace("-", " ").strip()


def non_spatial_axes(axes: str) -> list[str]:
    return [axis for axis in axes if axis not in {"Y", "X"}]


def page_index_for(series: tifffile.TiffPageSeries, z_index: int, channel_index: int) -> int:
    axes = series.axes
    shape_by_axis = dict(zip(axes, series.shape))
    flat_axes = non_spatial_axes(axes)
    if not flat_axes:
        return 0

    coords: list[int] = []
    shape: list[int] = []
    for axis in flat_axes:
        shape.append(int(shape_by_axis[axis]))
        if axis == "Z":
            coords.append(z_index)
        elif axis == "C":
            coords.append(channel_index)
        else:
            coords.append(0)

    return int(np.ravel_multi_index(tuple(coords), tuple(shape)))


def get_axis_size(series: tifffile.TiffPageSeries, axis: str, default: int = 1) -> int:
    if axis not in series.axes:
        return default
    return int(series.shape[series.axes.index(axis)])


def read_plane(series: tifffile.TiffPageSeries, z_index: int, channel_index: int) -> np.ndarray:
    page_index = page_index_for(series, z_index, channel_index)
    return series.pages[page_index].asarray()


def compute_channel_ranges(
    series: tifffile.TiffPageSeries,
    focus_indices: list[int],
    channels: int,
    percentile_lo: float,
    percentile_hi: float,
    sample_stride: int,
) -> list[tuple[float, float]]:
    ranges: list[tuple[float, float]] = []
    for channel_index in range(channels):
        samples: list[np.ndarray] = []
        print(f"Computing intensity range for channel {channel_index + 1}...")
        for z_index in focus_indices:
            plane = read_plane(series, z_index, channel_index)
            sampled = plane[::sample_stride, ::sample_stride].reshape(-1)
            samples.append(sampled)

        values = np.concatenate(samples)
        lo = float(np.percentile(values, percentile_lo))
        hi = float(np.percentile(values, percentile_hi))
        if hi <= lo:
            hi = lo + 1.0
        print(f"  percentile [{percentile_lo}, {percentile_hi}]: [{lo:.1f}, {hi:.1f}]")
        ranges.append((lo, hi))
    return ranges


def normalize_to_uint8(plane: np.ndarray, lo: float, hi: float) -> np.ndarray:
    clipped = np.clip(plane.astype(np.float32, copy=False), lo, hi)
    scaled = (clipped - lo) / (hi - lo) * 255.0
    return scaled.astype(np.uint8)


def composite_channels(
    series: tifffile.TiffPageSeries,
    z_index: int,
    channel_ranges: list[tuple[float, float]],
    color_vectors: list[tuple[int, int, int]],
    height: int,
    width: int,
) -> np.ndarray:
    composite = np.zeros((height, width, 3), dtype=np.uint16)

    for channel_index, (lo, hi) in enumerate(channel_ranges):
        plane = read_plane(series, z_index, channel_index)
        gray = normalize_to_uint8(plane, lo, hi).astype(np.uint16)
        color = color_vectors[channel_index]
        for rgb_index, enabled in enumerate(color):
            if enabled:
                composite[:, :, rgb_index] += gray * enabled

    return np.clip(composite, 0, 255).astype(np.uint8)


def image_to_uint8_rgb(
    image: Image.Image,
    percentile_lo: float,
    percentile_hi: float,
) -> np.ndarray:
    arr = np.array(image)
    preserve_uint8 = arr.dtype == np.uint8

    if arr.ndim == 2:
        if preserve_uint8:
            gray = arr
        else:
            lo = float(np.percentile(arr, percentile_lo))
            hi = float(np.percentile(arr, percentile_hi))
            if hi <= lo:
                hi = lo + 1.0
            gray = normalize_to_uint8(arr, lo, hi)
        return np.repeat(gray[:, :, np.newaxis], 3, axis=2)

    if arr.ndim == 3:
        rgb_source = arr[:, :, :3]
        if preserve_uint8:
            return rgb_source.astype(np.uint8, copy=False)

        rgb = np.zeros(rgb_source.shape, dtype=np.uint8)
        for channel_index in range(3):
            channel = rgb_source[:, :, channel_index]
            lo = float(np.percentile(channel, percentile_lo))
            hi = float(np.percentile(channel, percentile_hi))
            if hi <= lo:
                hi = lo + 1.0
            rgb[:, :, channel_index] = normalize_to_uint8(channel, lo, hi)
        return rgb

    sys.exit(f"Unsupported appended multitiff page shape: {arr.shape}")


def validate_append_multitiff(
    multitiff_path: Path | None,
    expected_width: int,
    expected_height: int,
) -> int:
    if multitiff_path is None:
        return 0
    if not multitiff_path.is_file():
        sys.exit(f"Append multitiff not found: {multitiff_path}")

    page_count = 0
    with Image.open(multitiff_path) as img:
        for page in ImageSequence.Iterator(img):
            if (page.width, page.height) != (expected_width, expected_height):
                sys.exit(
                    f"Append multitiff page {page_count} is {page.width}x{page.height}, "
                    f"expected {expected_width}x{expected_height}. "
                    "convert_single_image_dataset.py does not rescale appended pages."
                )
            page_count += 1

    if page_count == 0:
        sys.exit(f"Append multitiff has no pages: {multitiff_path}")
    return page_count


def write_appended_multitiff(
    multitiff_path: Path,
    label: str,
    start_zoom_idx: int,
    z_slices: int,
    dataset_outdir: Path,
    percentile_lo: float,
    percentile_hi: float,
    webp_quality: int,
) -> int:
    written = 0
    print(f"\nAppending fixed-focus multitiff: {multitiff_path}")

    with Image.open(multitiff_path) as img:
        for page_index, page in enumerate(ImageSequence.Iterator(img)):
            zoom_idx = start_zoom_idx + page_index
            zoom_dir = dataset_outdir / f"zoom_{zoom_idx:02d}"
            zoom_dir.mkdir(parents=True, exist_ok=True)

            rgb = image_to_uint8_rgb(page, percentile_lo, percentile_hi)
            rgb_img = Image.fromarray(rgb, "RGB")

            for focus_index in range(z_slices):
                output_path = zoom_dir / f"z_{focus_index:03d}.webp"
                rgb_img.save(output_path, "WEBP", quality=webp_quality)
                written += 1

            print(
                f"    zoom_{zoom_idx:02d} <- {label} page {page_index + 1} "
                f"duplicated across {z_slices} focus slices"
            )

    return written


def convert_single_image_dataset(
    source_path: Path,
    outdir: Path,
    dataset_id: str,
    percentile_lo: float,
    percentile_hi: float,
    sample_stride: int,
    webp_quality: int,
    colors: list[str],
    focus_step: int,
    reverse_focus: bool,
    append_multitiff: Path | None,
    append_multitiff_label: str | None,
    appended_zoom_start: int,
) -> tuple[int, int, int, int, int, list[str]]:
    dataset_outdir = outdir / dataset_id
    zoom_dir = dataset_outdir / "zoom_00"

    if dataset_outdir.exists():
        for entry in dataset_outdir.iterdir():
            if entry.is_dir() and entry.name.startswith("zoom_"):
                shutil.rmtree(entry)
    zoom_dir.mkdir(parents=True, exist_ok=True)

    with tifffile.TiffFile(source_path) as tif:
        series = tif.series[0]
        width = get_axis_size(series, "X")
        height = get_axis_size(series, "Y")
        source_z_slices = get_axis_size(series, "Z")
        channels = get_axis_size(series, "C")
        appended_page_count = validate_append_multitiff(append_multitiff, width, height)
        append_label = (
            append_multitiff_label
            if append_multitiff_label is not None
            else append_multitiff.stem if append_multitiff is not None
            else "Append"
        )
        zoom_names = [f"Optical zoom {index + 1}" for index in range(appended_zoom_start)]
        for page_index in range(appended_page_count):
            zoom_names.append(f"{append_label} page {page_index + 1}")

        focus_indices = list(range(0, source_z_slices, focus_step))
        if reverse_focus:
            focus_indices.reverse()
        z_slices = len(focus_indices)
        expected_pages = int(np.prod([get_axis_size(series, axis) for axis in non_spatial_axes(series.axes)] or [1]))
        if len(series.pages) < expected_pages:
            sys.exit(
                f"Unsupported TIFF layout: expected at least {expected_pages} pages from axes "
                f"{series.axes}, found {len(series.pages)}"
            )

        if len(colors) < channels:
            sys.exit(f"Need at least {channels} colors, got {len(colors)}")

        color_vectors = []
        for color in colors[:channels]:
            if color not in COLOR_VECTORS:
                valid = ", ".join(sorted(COLOR_VECTORS))
                sys.exit(f"Unknown color '{color}'. Valid colors: {valid}")
            color_vectors.append(COLOR_VECTORS[color])

        print(f"Source: {source_path}")
        print(f"  Axes: {series.axes}")
        print(f"  Shape: {series.shape}")
        print(f"  Output: {zoom_dir}")
        print(f"  Source Z slices: {source_z_slices}")
        print(f"  Exported Z slices: {z_slices} (focus step: {focus_step})")
        print(f"  Focus order: {'reversed' if reverse_focus else 'source order'}")
        print(f"  Channels: {channels} ({', '.join(colors[:channels])})")
        print(f"  Size: {width} x {height}")
        print(f"  Virtual optical zoom levels: {appended_zoom_start}")
        if appended_page_count:
            print(f"  Appended fixed-focus zoom levels: {appended_page_count}")
            for page_index in range(appended_page_count):
                print(
                    f"    zoom_{appended_zoom_start + page_index:02d} <- "
                    f"{append_label} page {page_index + 1} ({append_multitiff.name})"
                )
        print()

        channel_ranges = compute_channel_ranges(
            series=series,
            focus_indices=focus_indices,
            channels=channels,
            percentile_lo=percentile_lo,
            percentile_hi=percentile_hi,
            sample_stride=sample_stride,
        )

        for output_index, source_z_index in enumerate(focus_indices):
            rgb = composite_channels(
                series=series,
                z_index=source_z_index,
                channel_ranges=channel_ranges,
                color_vectors=color_vectors,
                height=height,
                width=width,
            )
            output_path = zoom_dir / f"z_{output_index:03d}.webp"
            Image.fromarray(rgb).save(output_path, "WEBP", quality=webp_quality)

            if (output_index + 1) % 10 == 0 or output_index + 1 == z_slices:
                pct = (output_index + 1) / z_slices * 100
                print(
                    f"  [{pct:5.1f}%] {output_index + 1}/{z_slices} "
                    f"(source z {source_z_index}) -> {output_path}"
                )

    appended_written = 0
    if append_multitiff is not None:
        appended_written = write_appended_multitiff(
            multitiff_path=append_multitiff,
            label=append_label,
            start_zoom_idx=appended_zoom_start,
            z_slices=z_slices,
            dataset_outdir=dataset_outdir,
            percentile_lo=percentile_lo,
            percentile_hi=percentile_hi,
            webp_quality=webp_quality,
        )

    total_written = z_slices + appended_written
    print(f"\nDone - {total_written} WebP files written to {dataset_outdir}")
    return width, height, z_slices, channels, appended_page_count, zoom_names



def update_manifest(
    manifest_path: Path,
    dataset_id: str,
    dataset_name: str,
    width: int,
    height: int,
    z_slices: int,
    zoom_levels: int,
    min_scale: float,
    max_scale: float,
    colors: list[str],
    channel_names: list[str],
    appended_zoom_start: int | None,
    zoom_names: list[str],
) -> None:
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        manifest = {}

    if "datasets" not in manifest:
        manifest = {"datasets": []}

    datasets: list[dict] = manifest["datasets"]
    entry = next((d for d in datasets if d.get("id") == dataset_id), None)
    if entry is None:
        entry = {"id": dataset_id}
        datasets.append(entry)

    entry["name"] = dataset_name
    entry["renderMode"] = "single-image"
    entry["zoomLevels"] = zoom_levels
    entry["zSlices"] = z_slices
    entry["width"] = width
    entry["height"] = height
    entry["format"] = "webp"
    entry["pathPattern"] = f"assets/{dataset_id}/zoom_{{ZZ}}/z_{{FFF}}.webp"
    entry["zoomScale"] = {"min": min_scale, "max": max_scale}
    if appended_zoom_start is None:
        entry.pop("appendedZoomStart", None)
    else:
        entry["appendedZoomStart"] = appended_zoom_start
    entry["channels"] = [
        {
            "index": index,
            "name": channel_names[index] if index < len(channel_names) else f"Channel {index + 1}",
            "color": colors[index],
        }
        for index in range(len(colors))
    ]
    labels = entry.get("labels") if isinstance(entry.get("labels"), dict) else {}
    labels["zoomNames"] = zoom_names
    labels.setdefault("objectiveNames", [])
    entry["labels"] = labels

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Updated {manifest_path} with single-image dataset '{dataset_id}'")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a single high-resolution TIFF/ImageJ hyperstack to WebP assets"
    )
    parser.add_argument("source", type=Path, help="Path to a TIFF file")
    parser.add_argument("--outdir", type=Path, default=None, help="Output base directory (default: public/assets)")
    parser.add_argument("--id", type=str, default=None, help="Dataset ID (default: slugified file name)")
    parser.add_argument("--name", type=str, default=None, help="Human-readable dataset name")
    parser.add_argument("--zoom-levels", type=int, default=18, help="UI zoom positions for true zoom (default: 18)")
    parser.add_argument("--min-scale", type=float, default=1.0, help="Displayed scale at zoom 0 (default: 1.0)")
    parser.add_argument("--max-scale", type=float, default=3.2, help="Displayed scale at max zoom (default: 3.2)")
    parser.add_argument(
        "--colors",
        nargs="+",
        default=["blue", "red", "green", "magenta"],
        help="Channel colors in source channel order (default: blue red green magenta)",
    )
    parser.add_argument(
        "--channel-names",
        nargs="*",
        default=[],
        help="Optional channel labels in source channel order",
    )
    parser.add_argument(
        "--percentile",
        type=float,
        nargs=2,
        default=[0.1, 99.9],
        metavar=("LO", "HI"),
        help="Percentiles for per-channel intensity normalization (default: 0.1 99.9)",
    )
    parser.add_argument("--sample-stride", type=int, default=8, help="Pixel stride for percentile sampling (default: 8)")
    parser.add_argument(
        "--focus-step",
        "--skip-focus",
        dest="focus_step",
        type=int,
        default=1,
        help="Export every Nth source focus plane, renumbered from z_000 (default: 1)",
    )
    parser.add_argument(
        "--reverse-focus",
        "--reverse-z-stack",
        action="store_true",
        help="Export selected source focus planes in reverse order",
    )
    parser.add_argument("--quality", type=int, default=88, help="WebP quality (default: 88)")
    parser.add_argument(
        "--append-multitiff",
        type=Path,
        default=None,
        help=(
            "Append a fixed-focus multipage TIFF after the virtual optical zoom levels. "
            "Each page becomes one real zoom level and is duplicated across all focus indices."
        ),
    )
    parser.add_argument(
        "--append-multitiff-label",
        type=str,
        default=None,
        help="Label prefix for appended multitiff zoom names (default: multitiff filename stem).",
    )
    parser.add_argument("--no-manifest", action="store_true", help="Skip updating public/manifest.json")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    source_path = args.source.resolve()
    if not source_path.is_file():
        sys.exit(f"Source TIFF not found: {source_path}")
    if args.zoom_levels <= 0:
        sys.exit("--zoom-levels must be positive")
    if args.min_scale <= 0 or args.max_scale <= 0 or args.max_scale < args.min_scale:
        sys.exit("--min-scale and --max-scale must be positive, with max >= min")
    if args.sample_stride <= 0:
        sys.exit("--sample-stride must be positive")
    if args.focus_step <= 0:
        sys.exit("--focus-step must be positive")

    dataset_id = args.id or slugify(source_path.stem)
    dataset_name = args.name or make_dataset_name(source_path.stem)
    outdir = args.outdir or (project_root / "public" / "assets")
    manifest_path = project_root / "public" / "manifest.json"
    append_multitiff = args.append_multitiff.resolve() if args.append_multitiff else None

    (
        width,
        height,
        z_slices,
        channels,
        appended_page_count,
        zoom_names,
    ) = convert_single_image_dataset(
        source_path=source_path,
        outdir=outdir,
        dataset_id=dataset_id,
        percentile_lo=args.percentile[0],
        percentile_hi=args.percentile[1],
        sample_stride=args.sample_stride,
        webp_quality=args.quality,
        colors=args.colors,
        focus_step=args.focus_step,
        reverse_focus=args.reverse_focus,
        append_multitiff=append_multitiff,
        append_multitiff_label=args.append_multitiff_label,
        appended_zoom_start=args.zoom_levels,
    )

    total_zoom_levels = args.zoom_levels + appended_page_count

    if not args.no_manifest:
        update_manifest(
            manifest_path=manifest_path,
            dataset_id=dataset_id,
            dataset_name=dataset_name,
            width=width,
            height=height,
            z_slices=z_slices,
            zoom_levels=total_zoom_levels,
            min_scale=args.min_scale,
            max_scale=args.max_scale,
            colors=args.colors[:channels],
            channel_names=args.channel_names,
            appended_zoom_start=args.zoom_levels if appended_page_count else None,
            zoom_names=zoom_names,
        )


if __name__ == "__main__":
    main()
