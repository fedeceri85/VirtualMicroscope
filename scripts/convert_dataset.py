#!/usr/bin/env python3
"""
Convert a real microscope dataset into WebP frames for the Virtual Microscope app.

Expected input layout:
    datasets/<dataset_name>/
        <sample>-FieldSize<N>/
            ChanA_001_001_<zzz>_<yyy>.tif   # data frames
            ChanA_Preview.tif                # ignored
            Experiment.xml                   # ignored
            ROIMask.raw                      # ignored
            ROIs.xaml                        # ignored
            jpeg/                            # ignored
            powerramp/                       # ignored

Each FieldSize subfolder is one zoom level (larger FieldSize = more zoomed out).
The zzz part of the filename is the Z-position index, yyy is the repeat index.
All frames sharing the same zzz are averaged to produce one output image.

Output layout (multi-dataset):
    public/assets/<dataset_id>/zoom_00/z_000.webp
    ...

Requirements: Python 3.9+, Pillow, numpy
    (available in the napari conda environment)

Usage:
    conda run -n napari python scripts/convert_dataset.py datasets/20260324-vmicroscope-test
    conda run -n napari python scripts/convert_dataset.py datasets/my-dataset --outdir public/assets
    conda run -n napari python scripts/convert_dataset.py datasets/my-dataset --percentile 0.1 99.9
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

try:
    import numpy as np
except ImportError:
    sys.exit("numpy is required.  Install it with:  pip install numpy")

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required.  Install it with:  pip install Pillow")


# Files and directories to ignore inside each zoom subfolder
IGNORE_FILES = {"ChanA_Preview.tif", "Experiment.xml", "ROIMask.raw", "ROIs.xaml", "ROIs.xml"}
IGNORE_DIRS = {"jpeg", "powerramp"}

# Regex matching data TIF files: ChanA_001_001_<zpos>_<repeat>.tif
DATA_TIF_RE = re.compile(r"^ChanA_\d+_\d+_(\d+)_(\d+)\.tif$")


def discover_zoom_folders(dataset_dir: Path) -> list[tuple[int, Path]]:
    """Return (field_size, path) pairs sorted by field_size descending (zoomed-out first)."""
    folders: list[tuple[int, Path]] = []
    for entry in dataset_dir.iterdir():
        if not entry.is_dir():
            continue
        match = re.search(r"FieldSize(\d+)$", entry.name)
        if match:
            field_size = int(match.group(1))
            folders.append((field_size, entry))
    if not folders:
        sys.exit(f"No FieldSize* subfolders found in {dataset_dir}")
    folders.sort(key=lambda x: x[0], reverse=True)
    return folders


def group_tifs_by_z(folder: Path) -> dict[int, list[Path]]:
    """Group data TIF files by Z-position index. Returns {z_pos: [paths...]} sorted."""
    groups: dict[int, list[Path]] = defaultdict(list)
    for f in folder.iterdir():
        if f.is_dir() and f.name in IGNORE_DIRS:
            continue
        if f.name in IGNORE_FILES:
            continue
        m = DATA_TIF_RE.match(f.name)
        if m:
            z_pos = int(m.group(1))
            groups[z_pos].append(f)
    for z_pos in groups:
        groups[z_pos].sort()
    return dict(sorted(groups.items()))


def average_frames(paths: list[Path]) -> np.ndarray:
    """Load and average a list of 16-bit TIFF files into a float64 image."""
    acc = None
    count = 0
    for p in paths:
        img = Image.open(p)
        arr = np.array(img, dtype=np.float64)
        if acc is None:
            acc = arr
        else:
            acc += arr
        count += 1
    return acc / count


def compute_global_range(
    zoom_folders: list[tuple[int, Path]],
    percentile_lo: float,
    percentile_hi: float,
) -> tuple[float, float]:
    """Compute global normalization range across all averaged images."""
    print("Computing global intensity range...")
    all_values: list[float] = []
    for field_size, folder in zoom_folders:
        groups = group_tifs_by_z(folder)
        for z_pos, paths in groups.items():
            avg = average_frames(paths)
            all_values.extend(avg.ravel()[::16].tolist())
    arr = np.array(all_values)
    lo = float(np.percentile(arr, percentile_lo))
    hi = float(np.percentile(arr, percentile_hi))
    print(f"  Percentile range [{percentile_lo}, {percentile_hi}]: [{lo:.1f}, {hi:.1f}]")
    return lo, hi


def normalize_to_uint8(img: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Clip and scale a float image to 0-255 uint8."""
    clipped = np.clip(img, lo, hi)
    if hi > lo:
        scaled = (clipped - lo) / (hi - lo) * 255.0
    else:
        scaled = np.zeros_like(clipped)
    return scaled.astype(np.uint8)


def colorize_green(gray: np.ndarray) -> Image.Image:
    """Convert a uint8 grayscale array to a green-channel RGB PIL Image."""
    h, w = gray.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    rgb[:, :, 1] = gray
    return Image.fromarray(rgb, "RGB")


def convert_dataset(
    dataset_dir: Path,
    outdir: Path,
    dataset_id: str,
    percentile_lo: float,
    percentile_hi: float,
    webp_quality: int,
) -> tuple[int, int]:
    """Convert the dataset and return (zoom_levels, z_slices)."""
    zoom_folders = discover_zoom_folders(dataset_dir)
    num_zooms = len(zoom_folders)

    first_groups = group_tifs_by_z(zoom_folders[0][1])
    num_slices = len(first_groups)
    frames_per_z = len(next(iter(first_groups.values())))

    print(f"Dataset: {dataset_dir.name} (id: {dataset_id})")
    print(f"  Zoom levels: {num_zooms}")
    print(f"  Z slices: {num_slices}")
    print(f"  Frames per Z position: {frames_per_z}")
    print(f"  Zoom order (zoomed-out -> zoomed-in):")
    for i, (fs, p) in enumerate(zoom_folders):
        print(f"    zoom_{i:02d} <- FieldSize{fs} ({p.name})")
    print()

    lo, hi = compute_global_range(zoom_folders, percentile_lo, percentile_hi)

    # Output goes to <outdir>/<dataset_id>/zoom_XX/
    dataset_outdir = outdir / dataset_id

    # Clean stale zoom directories for this dataset
    if dataset_outdir.exists():
        for entry in dataset_outdir.iterdir():
            if entry.is_dir() and entry.name.startswith("zoom_"):
                shutil.rmtree(entry)
        print(f"Cleaned existing zoom_* directories in {dataset_outdir}\n")

    total_frames = num_zooms * num_slices
    generated = 0

    for zoom_idx, (field_size, folder) in enumerate(zoom_folders):
        zoom_dir = dataset_outdir / f"zoom_{zoom_idx:02d}"
        zoom_dir.mkdir(parents=True, exist_ok=True)

        groups = group_tifs_by_z(folder)

        for slice_idx, (z_pos, paths) in enumerate(groups.items()):
            avg = average_frames(paths)
            gray8 = normalize_to_uint8(avg, lo, hi)
            rgb_img = colorize_green(gray8)

            fpath = zoom_dir / f"z_{slice_idx:03d}.webp"
            rgb_img.save(fpath, "WEBP", quality=webp_quality)

            generated += 1
            if generated % 5 == 0 or generated == total_frames:
                pct = generated / total_frames * 100
                print(f"  [{pct:5.1f}%] {generated}/{total_frames}  ->  {fpath}")

    print(f"\nDone - {generated} frames written to {dataset_outdir}")
    return num_zooms, num_slices


def make_dataset_name(dataset_dir_name: str) -> str:
    """Derive a human-readable name from the dataset directory name."""
    # e.g. "20260324-vmicroscope-test" -> "20260324 Vmicroscope Test"
    return dataset_dir_name.replace("-", " ").replace("_", " ").title()


def update_manifest(
    manifest_path: Path,
    dataset_id: str,
    dataset_name: str,
    num_zooms: int,
    num_slices: int,
) -> None:
    """Update manifest.json, adding/updating the dataset entry."""
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        manifest = {}

    # Migrate old single-dataset manifest to multi-dataset format
    if "datasets" not in manifest:
        manifest = {"datasets": []}

    datasets: list[dict] = manifest["datasets"]

    # Find existing entry or create new
    entry = None
    for d in datasets:
        if d.get("id") == dataset_id:
            entry = d
            break

    if entry is None:
        entry = {"id": dataset_id}
        datasets.append(entry)

    entry["name"] = dataset_name
    entry["zoomLevels"] = num_zooms
    entry["zSlices"] = num_slices
    entry["width"] = 512
    entry["height"] = 512
    entry["format"] = "webp"
    entry["pathPattern"] = f"assets/{dataset_id}/zoom_{{ZZ}}/z_{{FFF}}.webp"
    entry.setdefault("labels", {"zoomNames": [], "objectiveNames": []})

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Updated {manifest_path} (dataset '{dataset_id}': zoomLevels={num_zooms}, zSlices={num_slices})")
    print(f"  Total datasets in manifest: {len(datasets)}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a microscope dataset to WebP frames for Virtual Microscope"
    )
    parser.add_argument(
        "dataset",
        type=Path,
        help="Path to the dataset folder (e.g. datasets/20260324-vmicroscope-test)",
    )
    parser.add_argument(
        "--outdir",
        type=Path,
        default=None,
        help="Output base directory (default: public/assets/)",
    )
    parser.add_argument(
        "--id",
        type=str,
        default=None,
        help="Dataset ID (default: dataset folder name)",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=None,
        help="Human-readable dataset name (default: derived from folder name)",
    )
    parser.add_argument(
        "--percentile",
        type=float,
        nargs=2,
        default=[0.1, 99.9],
        metavar=("LO", "HI"),
        help="Percentiles for intensity normalization (default: 0.1 99.9)",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=85,
        help="WebP quality (default: 85)",
    )
    parser.add_argument(
        "--no-manifest",
        action="store_true",
        help="Skip updating manifest.json",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    outdir = args.outdir or (project_root / "public" / "assets")
    manifest_path = project_root / "public" / "manifest.json"

    dataset_dir = args.dataset.resolve()
    if not dataset_dir.is_dir():
        sys.exit(f"Dataset directory not found: {dataset_dir}")

    dataset_id = args.id or dataset_dir.name
    dataset_name = args.name or make_dataset_name(dataset_dir.name)

    num_zooms, num_slices = convert_dataset(
        dataset_dir=dataset_dir,
        outdir=outdir,
        dataset_id=dataset_id,
        percentile_lo=args.percentile[0],
        percentile_hi=args.percentile[1],
        webp_quality=args.quality,
    )

    if not args.no_manifest:
        update_manifest(manifest_path, dataset_id, dataset_name, num_zooms, num_slices)


if __name__ == "__main__":
    main()
