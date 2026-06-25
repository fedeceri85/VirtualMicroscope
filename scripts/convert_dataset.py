#!/usr/bin/env python3
"""
Convert a real microscope dataset into WebP frames for the Virtual Microscope app.

Expected input layout:
    datasets/<dataset_name>/
        <sample>-FieldSize<N>/
        <sample> - <N> [Gain ...]/
            ChanA_001_001_<zzz>_<yyy>.tif   # data frames (green)
            ChanB_001_001_<zzz>_<yyy>.tif   # optional 2nd channel (magenta)
            ChanA_Preview.tif                # ignored
            ChanB_Preview.tif                # ignored
            Experiment.xml                   # ignored
            ROIMask.raw                      # ignored
            ROIs.xaml                        # ignored
            jpeg/                            # ignored
            powerramp/                       # ignored

Each FieldSize-style subfolder is one zoom level (larger field size = more zoomed out).
The zzz part of the filename is the Z-position index, yyy is the repeat index.
All frames sharing the same zzz are averaged to produce one output image.

Multi-channel: ChanA is rendered as green, ChanB (if present) as magenta (R+B)
by default. Override with --channel-colors.
Channels are additively composited into a single RGB image.

Output layout (multi-dataset):
    public/assets/<dataset_id>/zoom_00/z_000.webp
    ...

Requirements: Python 3.9+, Pillow, numpy
    (available in the napari conda environment)

Usage:
    conda run -n napari python scripts/convert_dataset.py datasets/20260324-vmicroscope-test
    conda run -n napari python scripts/convert_dataset.py datasets/my-dataset --outdir public/assets
    conda run -n napari python scripts/convert_dataset.py datasets/my-dataset --percentile 0.1 99.9
    conda run -n napari python scripts/convert_dataset.py "datasets/TUJ1 Green Chat Red" \
      --id tuj1-green-chat-red --name "TUJ1 Green / ChAT Red" \
      --normalize-scope zoom --channel-names TUJ1 ChAT --channel-colors green red
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
IGNORE_FILES = {
    "ChanA_Preview.tif", "ChanB_Preview.tif",
    "Experiment.xml", "ROIMask.raw", "ROIs.xaml", "ROIs.xml",
}
IGNORE_DIRS = {"jpeg", "powerramp"}

# Regex matching data TIF files: Chan{A|B}_001_001_<zpos>_<repeat>.tif
DATA_TIF_RE = re.compile(r"^Chan([AB])_\d+_\d+_(\d+)_(\d+)\.tif$")

# Supported zoom folder naming conventions.
FIELD_SIZE_PATTERNS = (
    re.compile(r"FieldSize(\d+)$", re.IGNORECASE),
    re.compile(r"\s-\s*(\d+)(?:\s|$)", re.IGNORECASE),
)


def parse_field_size(folder_name: str) -> int | None:
    """Extract the numeric field size from a zoom folder name."""
    for pattern in FIELD_SIZE_PATTERNS:
        match = pattern.search(folder_name)
        if match:
            return int(match.group(1))
    return None


def discover_zoom_folders(dataset_dir: Path) -> list[tuple[int, Path]]:
    """Return (field_size, path) pairs sorted by field_size descending (zoomed-out first)."""
    folders: list[tuple[int, Path]] = []
    for entry in dataset_dir.iterdir():
        if not entry.is_dir():
            continue
        field_size = parse_field_size(entry.name)
        if field_size is not None:
            folders.append((field_size, entry))
    if not folders:
        sys.exit(
            f"No zoom subfolders found in {dataset_dir}. Expected names like "
            "FieldSize<N> or '<sample> - <N>'."
        )
    folders.sort(key=lambda x: x[0], reverse=True)
    return folders


def group_tifs_by_z(folder: Path, channel: str = "A") -> dict[int, list[Path]]:
    """Group data TIF files by Z-position index for a given channel.
    Returns {z_pos: [paths...]} sorted."""
    groups: dict[int, list[Path]] = defaultdict(list)
    for f in folder.iterdir():
        if f.is_dir() and f.name in IGNORE_DIRS:
            continue
        if f.name in IGNORE_FILES:
            continue
        m = DATA_TIF_RE.match(f.name)
        if m and m.group(1) == channel:
            z_pos = int(m.group(2))
            groups[z_pos].append(f)
    for z_pos in groups:
        groups[z_pos].sort()
    return dict(sorted(groups.items()))


def detect_channels(folder: Path) -> list[str]:
    """Return sorted list of channels present in a folder (e.g. ['A'] or ['A','B'])."""
    channels: set[str] = set()
    for f in folder.iterdir():
        if f.name in IGNORE_FILES:
            continue
        m = DATA_TIF_RE.match(f.name)
        if m:
            channels.add(m.group(1))
    return sorted(channels)


def average_frames(paths: list[Path]) -> np.ndarray:
    """Load and average a list of 16-bit TIFF files into a float64 image."""
    acc = None
    count = 0
    for p in paths:
        with Image.open(p) as img:
            arr = np.array(img, dtype=np.float64)
        if acc is None:
            acc = arr
        else:
            acc += arr
        count += 1
    return acc / count


def compute_intensity_range(
    zoom_folders: list[tuple[int, Path]],
    channel: str,
    z_positions: list[int],
    percentile_lo: float,
    percentile_hi: float,
    label: str,
) -> tuple[float, float]:
    """Compute global normalization range across all averaged images for one channel."""
    print(f"Computing {label} intensity range for Chan{channel}...")
    samples: list[np.ndarray] = []
    for field_size, folder in zoom_folders:
        groups = group_tifs_by_z(folder, channel)
        for z_pos in z_positions:
            paths = groups[z_pos]
            avg = average_frames(paths)
            samples.append(avg.ravel()[::64].astype(np.float32, copy=False))
    arr = np.concatenate(samples)
    lo = float(np.percentile(arr, percentile_lo))
    hi = float(np.percentile(arr, percentile_hi))
    print(f"  Chan{channel} {label} percentile [{percentile_lo}, {percentile_hi}]: [{lo:.1f}, {hi:.1f}]")
    return lo, hi


def normalize_to_uint8(img: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Clip and scale a float image to 0-255 uint8."""
    clipped = np.clip(img, lo, hi)
    if hi > lo:
        scaled = (clipped - lo) / (hi - lo) * 255.0
    else:
        scaled = np.zeros_like(clipped)
    return scaled.astype(np.uint8)


def colorize_green(gray: np.ndarray) -> np.ndarray:
    """Convert a uint8 grayscale array to a green-channel RGB array."""
    h, w = gray.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    rgb[:, :, 1] = gray
    return rgb


def colorize_magenta(gray: np.ndarray) -> np.ndarray:
    """Convert a uint8 grayscale array to a magenta (R+B) RGB array."""
    h, w = gray.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    rgb[:, :, 0] = gray  # Red
    rgb[:, :, 2] = gray  # Blue
    return rgb


def colorize_red(gray: np.ndarray) -> np.ndarray:
    """Convert a uint8 grayscale array to a red-channel RGB array."""
    h, w = gray.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    rgb[:, :, 0] = gray
    return rgb


CHANNEL_COLORIZERS = {
    "green": colorize_green,
    "magenta": colorize_magenta,
    "red": colorize_red,
}

DEFAULT_CHANNEL_COLORS = {
    "A": "green",
    "B": "magenta",
}


def resolve_z_positions(
    zoom_folders: list[tuple[int, Path]],
    channels: list[str],
    z_policy: str,
) -> list[int]:
    """Validate/resolve the z positions that should be exported for every zoom level."""
    per_folder: list[tuple[int, Path, set[int]]] = []

    for field_size, folder in zoom_folders:
        channel_sets: list[set[int]] = []
        for ch in channels:
            z_set = set(group_tifs_by_z(folder, ch))
            if not z_set:
                sys.exit(f"No Chan{ch} data TIF files found in {folder}")
            channel_sets.append(z_set)

        folder_common = set.intersection(*channel_sets)
        folder_union = set.union(*channel_sets)
        if folder_common != folder_union:
            missing = sorted(folder_union - folder_common)
            print(
                f"Warning: {folder.name} has channel-specific missing z positions: "
                f"{missing[:8]}{'...' if len(missing) > 8 else ''}"
            )
        per_folder.append((field_size, folder, folder_common))

    reference = per_folder[0][2]
    mismatches = [
        (field_size, folder, sorted(reference - z_set), sorted(z_set - reference))
        for field_size, folder, z_set in per_folder
        if z_set != reference
    ]

    if mismatches and z_policy == "strict":
        print("Inconsistent z positions across zoom folders:")
        for field_size, folder, missing, extra in mismatches:
            print(
                f"  Field size {field_size} ({folder.name}): "
                f"missing {len(missing)}, extra {len(extra)}"
            )
            if missing:
                print(f"    missing: {missing[:12]}{'...' if len(missing) > 12 else ''}")
            if extra:
                print(f"    extra: {extra[:12]}{'...' if len(extra) > 12 else ''}")
        sys.exit("Use --z-policy common to export only z positions present in every zoom folder.")

    if z_policy == "common":
        common = set.intersection(*(z_set for _, _, z_set in per_folder))
        if not common:
            sys.exit("No z positions are present in every zoom folder.")
        if mismatches:
            union = set.union(*(z_set for _, _, z_set in per_folder))
            dropped = sorted(union - common)
            print(
                f"Using common z positions only: {len(common)} kept, {len(dropped)} dropped "
                "to keep the app grid rectangular."
            )
        return sorted(common)

    return sorted(reference)


def detect_image_size(
    zoom_folders: list[tuple[int, Path]],
    channels: list[str],
    z_positions: list[int],
) -> tuple[int, int]:
    """Verify that all exported source frames have the same dimensions."""
    expected: tuple[int, int] | None = None
    probe_z = z_positions[0]
    for _, folder in zoom_folders:
        for ch in channels:
            path = group_tifs_by_z(folder, ch)[probe_z][0]
            with Image.open(path) as img:
                size = img.size
            if expected is None:
                expected = size
            elif size != expected:
                sys.exit(
                    f"Inconsistent image dimensions: {path} is {size}, expected {expected}"
                )
    if expected is None:
        sys.exit("Could not detect source image dimensions.")
    return expected


def resolve_channel_metadata(
    channels: list[str],
    channel_names: list[str] | None,
    channel_colors: list[str] | None,
) -> tuple[dict[str, str], list[dict[str, int | str]]]:
    """Resolve per-channel render colors and manifest metadata."""
    if channel_names is not None and len(channel_names) != len(channels):
        sys.exit(
            f"--channel-names expected {len(channels)} values "
            f"({', '.join(f'Chan{ch}' for ch in channels)})"
        )
    if channel_colors is not None and len(channel_colors) != len(channels):
        sys.exit(
            f"--channel-colors expected {len(channels)} values "
            f"({', '.join(f'Chan{ch}' for ch in channels)})"
        )

    colors_by_channel: dict[str, str] = {}
    metadata: list[dict[str, int | str]] = []

    for index, ch in enumerate(channels):
        color = (
            channel_colors[index]
            if channel_colors is not None
            else DEFAULT_CHANNEL_COLORS.get(ch, "green")
        )
        name = channel_names[index] if channel_names is not None else f"Chan{ch}"
        colors_by_channel[ch] = color
        metadata.append({"index": index, "name": name, "color": color})

    return colors_by_channel, metadata


def convert_dataset(
    dataset_dir: Path,
    outdir: Path,
    dataset_id: str,
    percentile_lo: float,
    percentile_hi: float,
    webp_quality: int,
    z_policy: str,
    normalize_scope: str,
    channel_names: list[str] | None,
    channel_colors: list[str] | None,
) -> tuple[int, int, int, int, list[str], list[dict[str, int | str]]]:
    """Convert the dataset and return (zoom_levels, z_slices)."""
    zoom_folders = discover_zoom_folders(dataset_dir)
    num_zooms = len(zoom_folders)

    # Detect channels from the first zoom folder
    channels = detect_channels(zoom_folders[0][1])
    if not channels:
        sys.exit("No data TIF files found in the first zoom folder.")

    z_positions = resolve_z_positions(zoom_folders, channels, z_policy)
    num_slices = len(z_positions)
    first_groups = group_tifs_by_z(zoom_folders[0][1], channels[0])
    frames_per_z = len(first_groups[z_positions[0]])
    width, height = detect_image_size(zoom_folders, channels, z_positions)
    colors_by_channel, channel_metadata = resolve_channel_metadata(
        channels, channel_names, channel_colors
    )
    zoom_names = [f"Field size {field_size}" for field_size, _ in zoom_folders]

    print(f"Dataset: {dataset_dir.name} (id: {dataset_id})")
    print(
        "  Channels: "
        + ", ".join(
            f"Chan{ch} ({colors_by_channel[ch]})" for ch in channels
        )
    )
    print(f"  Zoom levels: {num_zooms}")
    print(f"  Z slices: {num_slices}")
    print(f"  Frames per Z position: {frames_per_z}")
    print(f"  Frame size: {width}x{height}")
    print(f"  Normalization scope: {normalize_scope}")
    print(f"  Zoom order (zoomed-out -> zoomed-in):")
    for i, (fs, p) in enumerate(zoom_folders):
        print(f"    zoom_{i:02d} <- FieldSize{fs} ({p.name})")
    print()

    # Compute per-channel normalization ranges.
    channel_ranges: dict[tuple[int, str], tuple[float, float]] = {}
    if normalize_scope == "global":
        for ch in channels:
            global_range = compute_intensity_range(
                zoom_folders,
                ch,
                z_positions,
                percentile_lo,
                percentile_hi,
                "global",
            )
            for zoom_idx in range(num_zooms):
                channel_ranges[(zoom_idx, ch)] = global_range
    elif normalize_scope == "zoom":
        for zoom_idx, zoom_folder in enumerate(zoom_folders):
            field_size, _ = zoom_folder
            for ch in channels:
                channel_ranges[(zoom_idx, ch)] = compute_intensity_range(
                    [zoom_folder],
                    ch,
                    z_positions,
                    percentile_lo,
                    percentile_hi,
                    f"zoom_{zoom_idx:02d} FieldSize{field_size}",
                )
    else:
        sys.exit(f"Unsupported normalization scope: {normalize_scope}")

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

        # Build per-channel Z groups for this folder
        ch_groups: dict[str, dict[int, list[Path]]] = {}
        for ch in channels:
            ch_groups[ch] = group_tifs_by_z(folder, ch)

        for slice_idx, z_pos in enumerate(z_positions):
            # Average and colorize each channel, then composite
            composite: np.ndarray | None = None
            for ch in channels:
                paths = ch_groups[ch].get(z_pos, [])
                if not paths:
                    sys.exit(f"Missing Chan{ch} z position {z_pos} in {folder}")
                avg = average_frames(paths)
                lo, hi = channel_ranges[(zoom_idx, ch)]
                gray8 = normalize_to_uint8(avg, lo, hi)
                colorized = CHANNEL_COLORIZERS[colors_by_channel[ch]](gray8)
                if composite is None:
                    composite = colorized.astype(np.uint16)
                else:
                    composite = composite + colorized.astype(np.uint16)

            # Clamp to 255 after additive blending
            if composite is None:
                sys.exit(f"No channel data available for z position {z_pos} in {folder}")
            composite = np.clip(composite, 0, 255).astype(np.uint8)
            rgb_img = Image.fromarray(composite, "RGB")

            fpath = zoom_dir / f"z_{slice_idx:03d}.webp"
            rgb_img.save(fpath, "WEBP", quality=webp_quality)

            generated += 1
            if generated % 5 == 0 or generated == total_frames:
                pct = generated / total_frames * 100
                print(f"  [{pct:5.1f}%] {generated}/{total_frames}  ->  {fpath}")

    print(f"\nDone - {generated} frames written to {dataset_outdir}")
    return num_zooms, num_slices, width, height, zoom_names, channel_metadata


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
    width: int,
    height: int,
    zoom_names: list[str],
    channel_metadata: list[dict[str, int | str]],
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
    entry["renderMode"] = "frame-stack"
    entry["zoomLevels"] = num_zooms
    entry["zSlices"] = num_slices
    entry["width"] = width
    entry["height"] = height
    entry["format"] = "webp"
    entry["pathPattern"] = f"assets/{dataset_id}/zoom_{{ZZ}}/z_{{FFF}}.webp"
    entry["channels"] = channel_metadata
    labels = entry.get("labels") if isinstance(entry.get("labels"), dict) else {}
    labels["zoomNames"] = zoom_names
    labels.setdefault("objectiveNames", [])
    entry["labels"] = labels

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
    parser.add_argument(
        "--z-policy",
        choices=["strict", "common"],
        default="strict",
        help=(
            "How to handle zoom folders with different z positions: "
            "'strict' fails, 'common' exports only z positions present everywhere "
            "(default: strict)"
        ),
    )
    parser.add_argument(
        "--normalize-scope",
        choices=["global", "zoom"],
        default="global",
        help=(
            "Intensity normalization scope: 'global' preserves absolute brightness "
            "across the dataset, 'zoom' normalizes each zoom level independently "
            "for datasets acquired with mixed gain/exposure settings (default: global)"
        ),
    )
    parser.add_argument(
        "--channel-names",
        nargs="+",
        default=None,
        help="Channel display names in detected channel order, e.g. --channel-names TUJ1 ChAT",
    )
    parser.add_argument(
        "--channel-colors",
        nargs="+",
        choices=sorted(CHANNEL_COLORIZERS),
        default=None,
        help=(
            "Channel colors in detected channel order "
            f"(choices: {', '.join(sorted(CHANNEL_COLORIZERS))})"
        ),
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

    num_zooms, num_slices, width, height, zoom_names, channel_metadata = convert_dataset(
        dataset_dir=dataset_dir,
        outdir=outdir,
        dataset_id=dataset_id,
        percentile_lo=args.percentile[0],
        percentile_hi=args.percentile[1],
        webp_quality=args.quality,
        z_policy=args.z_policy,
        normalize_scope=args.normalize_scope,
        channel_names=args.channel_names,
        channel_colors=args.channel_colors,
    )

    if not args.no_manifest:
        update_manifest(
            manifest_path,
            dataset_id,
            dataset_name,
            num_zooms,
            num_slices,
            width,
            height,
            zoom_names,
            channel_metadata,
        )


if __name__ == "__main__":
    main()
