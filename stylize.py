#!/usr/bin/env python3
"""
Blayde Manual -- house stylization filter.

Turns a source image into a red/black/steel line-art silhouette in the
project's own visual style. This is the "our filter, applied to community
content" half of the cover-page photomosaic idea (see ROADMAP.md): run it
on an accepted community "hero shot" (or a generic per-vehicle-class
placeholder) to generate that vehicle's unique mosaic target -- never on
OEM material, so the output stays entirely original/community-owned.

Pipeline: grayscale -> edge magnitude (Sobel) -> posterize into a few
luminance bands -> recolor into the brand palette (black background,
steel-gray body fill, red edge lines).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RED = (200, 16, 46)
STEEL = (138, 143, 152)
STEEL_DARK = (74, 79, 87)
BLACK = (12, 13, 15)


def sobel_edges(gray_arr):
    gx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    gy = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    a = gray_arr.astype(np.float32)
    h, w = a.shape
    ex = np.zeros_like(a)
    ey = np.zeros_like(a)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            weight_x = gx[dy + 1, dx + 1]
            weight_y = gy[dy + 1, dx + 1]
            if weight_x == 0 and weight_y == 0:
                continue
            shifted = np.roll(np.roll(a, -dy, axis=0), -dx, axis=1)
            ex += weight_x * shifted
            ey += weight_y * shifted
    mag = np.sqrt(ex ** 2 + ey ** 2)
    return mag / (mag.max() + 1e-6)


def compute_layers(input_path, edge_thresh=0.22, body_thresh=0.55, max_dim=1400, edge_blur=1):
    """Shared core: returns (rgb_source_resized, body_mask, edge_mask) as
    numpy bool arrays at the same resolution. body_mask = rough silhouette
    fill; edge_mask = linework. Used by both the flat 'filled' render and
    the mosaic's outline-until-filled render."""
    img = Image.open(input_path).convert("RGB")
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        img = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)

    gray = np.array(img.convert("L"), dtype=np.float32) / 255.0
    edges = sobel_edges(np.array(img.convert("L")))

    if edge_blur:
        edge_img = Image.fromarray((edges * 255).astype(np.uint8))
        edge_img = edge_img.filter(ImageFilter.GaussianBlur(edge_blur))
        edges = np.array(edge_img, dtype=np.float32) / 255.0

    body_mask = gray < body_thresh
    edge_mask = edges > edge_thresh
    return img, body_mask, edge_mask


def stylize(input_path, output_path, edge_thresh=0.22, body_thresh=0.55,
            max_dim=1400, edge_blur=1):
    img, body_mask, edge_mask = compute_layers(input_path, edge_thresh, body_thresh, max_dim, edge_blur)
    h, w = body_mask.shape
    out = np.zeros((h, w, 3), dtype=np.uint8)
    out[:, :] = BLACK
    out[body_mask] = STEEL_DARK
    out[edge_mask] = RED

    result = Image.fromarray(out, mode="RGB")
    result.save(output_path)
    return result


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--edge-thresh", type=float, default=0.22)
    ap.add_argument("--body-thresh", type=float, default=0.55)
    args = ap.parse_args()
    stylize(args.input, args.output, edge_thresh=args.edge_thresh, body_thresh=args.body_thresh)
    print(f"wrote {args.output}")
