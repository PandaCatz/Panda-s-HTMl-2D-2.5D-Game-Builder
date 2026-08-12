#!/usr/bin/env python3
"""Normalize a dark-gray-backed sprite strip into a fixed-palette game atlas.

The neutral key is removed only when it is connected to the image border. That
keeps similarly dark details inside the character while making the review
background replaceable. Every frame is scaled once, bottom-center aligned, and
quantized last so off-palette output is impossible.
"""

from __future__ import annotations

import argparse
import base64
from collections import deque
import hashlib
import json
from pathlib import Path

from PIL import Image


CHARACTER_PALETTE = (
    "#080b1f",
    "#15182f",
    "#191d3f",
    "#242858",
    "#163c68",
    "#7084a8",
    "#4c46e5",
    "#8b5cf6",
    "#b8b7ff",
    "#31d7f4",
    "#78efff",
    "#fff5d6",
    "#ffc47d",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--module-out", required=True)
    parser.add_argument("--frames", type=int, default=4)
    parser.add_argument("--frame-width", type=int, default=64)
    parser.add_argument("--frame-height", type=int, default=72)
    parser.add_argument("--neutral-spread", type=int, default=14)
    parser.add_argument("--key-min", type=int, default=20)
    parser.add_argument("--key-max", type=int, default=112)
    parser.add_argument("--background-policy", default="border-connected-dark-neutral-gray")
    parser.add_argument("--preview-background", default="#d9d9d9")
    parser.add_argument("--generator-label", default="scripts/normalize-dark-gray-sprite-strip.py")
    return parser.parse_args()


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def pixel_data(image: Image.Image):
    """Return flattened pixels across current and pre-Pillow-14 releases."""
    getter = getattr(image, "get_flattened_data", None)
    return getter() if getter is not None else image.getdata()


def redmean_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    r1, g1, b1 = a
    r2, g2, b2 = b
    red_mean = (r1 + r2) / 2
    dr, dg, db = r1 - r2, g1 - g2, b1 - b2
    return (2 + red_mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - red_mean) / 256) * db * db


def remove_border_neutral(
    image: Image.Image,
    neutral_spread: int,
    key_min: int,
    key_max: int,
) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = list(pixel_data(rgba))
    candidate = bytearray(width * height)
    for index, (red, green, blue, alpha) in enumerate(pixels):
        low = min(red, green, blue)
        high = max(red, green, blue)
        luminance = (red + green + blue) // 3
        if alpha > 0 and high - low <= neutral_spread and key_min <= luminance <= key_max:
            candidate[index] = 1

    background = bytearray(width * height)
    queue: deque[int] = deque()
    for x in range(width):
        for y in (0, height - 1):
            index = y * width + x
            if candidate[index] and not background[index]:
                background[index] = 1
                queue.append(index)
    for y in range(height):
        for x in (0, width - 1):
            index = y * width + x
            if candidate[index] and not background[index]:
                background[index] = 1
                queue.append(index)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        for neighbor in (index - 1 if x else -1, index + 1 if x + 1 < width else -1, index - width if y else -1, index + width if y + 1 < height else -1):
            if neighbor >= 0 and candidate[neighbor] and not background[neighbor]:
                background[neighbor] = 1
                queue.append(neighbor)

    output = []
    removed = 0
    for index, (red, green, blue, alpha) in enumerate(pixels):
        if background[index]:
            output.append((0, 0, 0, 0))
            removed += 1
        else:
            output.append((red, green, blue, alpha))
    rgba.putdata(output)
    return rgba, removed


def content_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").point(lambda value: 255 if value >= 32 else 0).getbbox()


def quantize_fixed(image: Image.Image, palette: tuple[tuple[int, int, int], ...]) -> Image.Image:
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    quantized = []
    for red, green, blue, alpha in pixel_data(image.convert("RGBA")):
        if alpha < 48:
            quantized.append((0, 0, 0, 0))
            continue
        best_index = min(range(len(palette)), key=lambda index: (redmean_distance((red, green, blue), palette[index]), index))
        target = palette[best_index]
        quantized.append((*target, 255))
    output.putdata(quantized)
    return output


def add_palette_outline(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Add a one-pixel, eight-neighbor silhouette rim without creating new colors."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    source = list(pixel_data(rgba))
    output = list(source)
    outlined = (*color, 255)
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if source[index][3] != 0:
                continue
            touches_character = False
            for offset_y in (-1, 0, 1):
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_x = x + offset_x
                    neighbor_y = y + offset_y
                    if 0 <= neighbor_x < width and 0 <= neighbor_y < height and source[neighbor_y * width + neighbor_x][3] != 0:
                        touches_character = True
                        break
                if touches_character:
                    break
            if touches_character:
                output[index] = outlined
    rgba.putdata(output)
    return rgba


def remove_small_components(image: Image.Image, minimum_pixels: int = 6) -> tuple[Image.Image, int]:
    """Remove isolated opaque specks while preserving meaningful disconnected gear."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = list(pixel_data(rgba))
    visited = bytearray(width * height)
    removed = 0
    for start in range(width * height):
        if visited[start] or pixels[start][3] == 0:
            continue
        visited[start] = 1
        component = [start]
        queue: deque[int] = deque([start])
        while queue:
            index = queue.popleft()
            x = index % width
            y = index // width
            for offset_y in (-1, 0, 1):
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_x = x + offset_x
                    neighbor_y = y + offset_y
                    if not (0 <= neighbor_x < width and 0 <= neighbor_y < height):
                        continue
                    neighbor = neighbor_y * width + neighbor_x
                    if visited[neighbor] or pixels[neighbor][3] == 0:
                        continue
                    visited[neighbor] = 1
                    component.append(neighbor)
                    queue.append(neighbor)
        if len(component) < minimum_pixels:
            for index in component:
                pixels[index] = (0, 0, 0, 0)
            removed += len(component)
    rgba.putdata(pixels)
    return rgba, removed


def main() -> None:
    args = parse_args()
    if args.frames < 1 or args.frame_width < 1 or args.frame_height < 1:
        raise SystemExit("Frame count and dimensions must be positive.")

    source = Image.open(args.input).convert("RGBA")
    keyed, removed_pixels = remove_border_neutral(source, args.neutral_spread, args.key_min, args.key_max)
    slots: list[Image.Image] = []
    bounds: list[tuple[int, int, int, int]] = []
    for index in range(args.frames):
        left = round(index * keyed.width / args.frames)
        right = round((index + 1) * keyed.width / args.frames)
        slot = keyed.crop((left, 0, right, keyed.height))
        bbox = content_bbox(slot)
        if bbox is None:
            raise SystemExit(f"No character content detected in frame {index + 1}.")
        slots.append(slot.crop(bbox))
        bounds.append(bbox)

    largest_width = max(slot.width for slot in slots)
    largest_height = max(slot.height for slot in slots)
    scale = min((args.frame_width - 4) / largest_width, (args.frame_height - 4) / largest_height)
    palette = tuple(hex_rgb(value) for value in CHARACTER_PALETTE)
    frames: list[Image.Image] = []
    palette_usage: list[dict[str, int]] = []
    removed_speck_pixels = 0
    out_dir = Path(args.out_dir)
    frame_dir = out_dir / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)

    for index, slot in enumerate(slots, start=1):
        width = max(1, round(slot.width * scale))
        height = max(1, round(slot.height * scale))
        resized = slot.resize((width, height), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (args.frame_width, args.frame_height), (0, 0, 0, 0))
        canvas.alpha_composite(resized, ((args.frame_width - width) // 2, args.frame_height - height - 2))
        cleaned, speck_pixels = remove_small_components(quantize_fixed(canvas, palette))
        removed_speck_pixels += speck_pixels
        frame = add_palette_outline(cleaned, hex_rgb("#b8b7ff"))
        frame.save(frame_dir / f"{index:02d}.png", optimize=True)
        frames.append(frame)
        usage: dict[str, int] = {}
        for color in pixel_data(frame):
            if color[3] == 0:
                continue
            key = "#" + "".join(f"{channel:02x}" for channel in color[:3])
            usage[key] = usage.get(key, 0) + 1
        palette_usage.append(dict(sorted(usage.items())))

    atlas = Image.new("RGBA", (args.frame_width * args.frames, args.frame_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index * args.frame_width, 0))
    atlas_path = out_dir / "kinetic-courier-v2-atlas.png"
    atlas.save(atlas_path, optimize=True)

    preview_scale = 5
    preview_rgb = hex_rgb(args.preview_background)
    preview = Image.new("RGBA", (atlas.width * preview_scale, atlas.height * preview_scale), (*preview_rgb, 255))
    preview.alpha_composite(atlas.resize(preview.size, Image.Resampling.NEAREST))
    preview.save(out_dir / "kinetic-courier-v2-preview.png", optimize=True)
    preview.save(out_dir / f"kinetic-courier-v2-preview-{args.frame_width}x{args.frame_height}-rim.png", optimize=True)

    atlas_bytes = atlas_path.read_bytes()
    digest = hashlib.sha256(atlas_bytes).hexdigest()
    allowed = {(*color, 255) for color in palette} | {(0, 0, 0, 0)}
    illegal = sorted({color for color in pixel_data(atlas) if color not in allowed})
    if illegal:
        raise SystemExit(f"Off-palette output detected: {illegal[:5]}")

    report = {
        "source": Path(args.input).name,
        "frames": args.frames,
        "frameWidth": args.frame_width,
        "frameHeight": args.frame_height,
        "atlasWidth": atlas.width,
        "atlasHeight": atlas.height,
        "byteLength": len(atlas_bytes),
        "decodedRgbaBytes": atlas.width * atlas.height * 4,
        "sha256": digest,
        "removedBackgroundPixels": removed_pixels,
        "sourcePixelCount": source.width * source.height,
        "sharedScale": scale,
        "anchor": "bottom-center",
        "anchorVariance": 0,
        "palette": CHARACTER_PALETTE,
        "paletteUsageByFrame": palette_usage,
        "sourceBoundsByFrame": bounds,
        "onPalette": True,
        "backgroundPolicy": args.background_policy,
        "reviewBackground": args.preview_background.lower(),
        "finalOutput": "transparent",
        "outlineColor": "#b8b7ff",
        "minimumComponentPixels": 6,
        "removedSpeckPixels": removed_speck_pixels,
    }
    (out_dir / "kinetic-courier-v2-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    encoded = base64.b64encode(atlas_bytes).decode("ascii")
    module_path = Path(args.module_out)
    module_path.parent.mkdir(parents=True, exist_ok=True)
    module_path.write_text(
        f"// Generated by {args.generator_label}. Do not edit by hand.\n"
        f"export const KINETIC_COURIER_V2_DATA_URL = {json.dumps('data:image/png;base64,' + encoded)};\n"
        f"export const KINETIC_COURIER_V2_REPORT = Object.freeze({json.dumps(report, separators=(',', ':'))});\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
