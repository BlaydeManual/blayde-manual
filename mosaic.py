#!/usr/bin/env python3
"""
Blayde Manual -- cover page photomosaic.

Draws an original (not-OEM) motorcycle silhouette, divided into zones that
correspond to physical areas of the bike (engine, wheels, chassis,
cockpit). Every procedure_id in the manifest is bucketed into a zone (by
keyword match against its section heading) and hashed into one tile within
that zone's grid. A tile renders as a real contributed-photo thumbnail
once enough of its bucket has approved photos; otherwise it stays a flat
silhouette-colored placeholder. Completion is then literally visible as
the silhouette resolving into focus, not just a percentage number.

The silhouette itself is drawn from primitives (circles, polygons) --
never derived from any OEM photo -- so the whole mosaic pipeline stays on
the same "original or community-owned only" footing as everything else in
this project. See ROADMAP.md for the full design writeup and the
copyright reasoning.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from stylize import compute_layers

RED = (200, 16, 46)
STEEL = (138, 143, 152)
STEEL_DARK = (74, 79, 87)
BLACK = (12, 13, 15)

CANVAS_W, CANVAS_H = 800, 400

# Zone bounding boxes across the canvas -- rough left-to-right correspondence
# to a side-profile silhouette (rear wheel -> engine -> chassis -> cockpit ->
# front wheel). Approximate on purpose; refined manually per-vehicle later.
ZONES = {
    "rear_wheel": (0, 0, 180, CANVAS_H),
    "engine": (180, 0, 380, CANVAS_H),
    "chassis": (380, 0, 520, CANVAS_H),
    "cockpit": (520, 0, 620, CANVAS_H),
    "front_wheel": (600, 0, CANVAS_W, CANVAS_H),
}

ZONE_KEYWORDS = {
    "front_wheel": ["front wheel", "front fork", "fork", "front brake", "steering", "fender", "front tire"],
    "rear_wheel": ["rear wheel", "swingarm", "chain", "sprocket", "rear suspension", "shock", "rear brake", "rear tire"],
    "engine": ["engine", "piston", "valve", "cam", "spark", "clutch", "carburetor", "fuel injection",
               "cylinder", "oil", "exhaust", "radiator", "cooling", "tappet", "crankshaft", "transmission"],
    "chassis": ["frame", "seat", "fuel tank", "tank", "bodywork", "cowl", "fairing"],
    "cockpit": ["battery", "ignition", "wiring", "electrical", "fuse", "switch", "handlebar",
                "instrument", "headlight", "horn", "starter", "meter"],
}
DEFAULT_ZONE = "chassis"


def classify_zone(text):
    text_low = (text or "").lower()
    for zone, keywords in ZONE_KEYWORDS.items():
        if any(kw in text_low for kw in keywords):
            return zone
    return DEFAULT_ZONE


def draw_silhouette(canvas=None):
    """Original side-profile motorcycle silhouette, drawn from primitives.
    Not derived from any photo -- see module docstring. Built as distinct
    recognizable parts (tank, seat, engine, fork, exhaust) rather than one
    blob polygon, so it actually reads as a motorcycle at a glance."""
    img = canvas or Image.new("RGB", (CANVAS_W, CANVAS_H), BLACK)
    d = ImageDraw.Draw(img)

    rear_axle = (150, 300)
    front_axle = (640, 260)
    wheel_r = 72
    steering_head = (500, 150)

    # wheels
    for cx, cy in (rear_axle, front_axle):
        d.ellipse([cx - wheel_r, cy - wheel_r, cx + wheel_r, cy + wheel_r], outline=RED, width=5)
        d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], outline=RED, width=2)  # hub

    # front fork (steering head down to front axle)
    d.line([steering_head, front_axle], fill=STEEL, width=10)
    # rear swingarm (under-engine pivot back to rear axle)
    swingarm_pivot = (330, 250)
    d.line([swingarm_pivot, rear_axle], fill=STEEL, width=9)
    # rear shock
    d.line([(300, 195), (340, 245)], fill=STEEL, width=6)

    # engine block, low and central between the axles
    engine = [
        (270, 220), (400, 210), (430, 250), (410, 290),
        (320, 300), (270, 275),
    ]
    d.polygon(engine, fill=STEEL_DARK, outline=STEEL)
    d.line([(300, 240), (400, 240)], fill=STEEL, width=2)  # cylinder head seam

    # fuel tank -- teardrop, sits over steering head/engine front
    tank = [
        steering_head, (450, 128), (390, 122), (330, 135),
        (305, 165), (330, 195), (420, 200), (470, 175),
    ]
    d.polygon(tank, fill=STEEL_DARK, outline=STEEL)

    # seat -- flatter, continues from tank back over the rear
    seat = [
        (330, 195), (250, 190), (190, 205), (180, 225),
        (230, 235), (300, 225), (330, 208),
    ]
    d.polygon(seat, fill=STEEL_DARK, outline=STEEL)

    # tail subframe down to rear axle area
    d.line([(190, 215), (230, 260), (rear_axle[0] + 20, rear_axle[1] - 30)], fill=STEEL, width=5, joint="curve")

    # handlebar
    d.line([steering_head, (steering_head[0] - 20, steering_head[1] - 55)], fill=STEEL, width=8)
    d.line([(steering_head[0] - 20, steering_head[1] - 55), (steering_head[0] - 70, steering_head[1] - 65)],
           fill=STEEL, width=7)

    # exhaust, sweeping low from engine toward the rear
    d.line([(400, 285), (300, 310), (190, 320), (110, 300)], fill=RED, width=7, joint="curve")

    return img


def _tile_bucket(procedure_id, n_tiles):
    h = int(hashlib.sha256(procedure_id.encode()).hexdigest(), 16)
    return h % n_tiles


def find_photo(photos_dir, procedure_id):
    photos_dir = Path(photos_dir)
    for ext in ("jpg", "jpeg", "png", "webp"):
        p = photos_dir / f"{procedure_id}.{ext}"
        if p.exists():
            return p
    return None


def _layers_from_generic_silhouette():
    """Fallback when no hero photo exists yet: derive body/edge masks from
    the hand-drawn generic silhouette so the same outline-until-filled
    renderer works either way."""
    silhouette = draw_silhouette()
    arr = np.array(silhouette)
    is_red = (arr[:, :, 0] > 150) & (arr[:, :, 1] < 80)
    is_steel = (np.abs(arr[:, :, 0].astype(int) - STEEL_DARK[0]) < 10) & \
               (np.abs(arr[:, :, 1].astype(int) - STEEL_DARK[1]) < 10)
    return is_steel, is_red


def build_mosaic(manifest_entries, photos_dir, grid_w=4, grid_h=3, fill_ratio_needed=0.34,
                  hero_image_path=None):
    """Outline-until-filled: unfilled areas show only the red edge linework
    on black (reads as 'empty'), and each tile reveals a real contributed
    photo -- cropped to the silhouette's own body shape, not a rectangle --
    once its bucket clears the fill threshold. Edges are drawn last so the
    linework always stays crisp on top of whatever's filled beneath it."""
    if hero_image_path:
        _, body_mask, edge_mask = compute_layers(hero_image_path)
        body_mask = np.array(Image.fromarray((body_mask * 255).astype(np.uint8))
                              .resize((CANVAS_W, CANVAS_H), Image.NEAREST)) > 127
        edge_mask = np.array(Image.fromarray((edge_mask * 255).astype(np.uint8))
                              .resize((CANVAS_W, CANVAS_H), Image.NEAREST)) > 127
    else:
        body_mask, edge_mask = _layers_from_generic_silhouette()

    img = Image.new("RGB", (CANVAS_W, CANVAS_H), BLACK)

    zoned = {z: [] for z in ZONES}
    for e in manifest_entries:
        if e.get("status") == "excluded_false_positive":
            continue
        if e.get("content_type") not in (None, "photo"):
            continue
        zone = classify_zone(e.get("section_heading", ""))
        zoned[zone].append(e["procedure_id"])

    total_procedures = sum(len(v) for v in zoned.values())
    total_with_photo = 0

    for zone_name, (zx0, zy0, zx1, zy1) in ZONES.items():
        procedure_ids = zoned[zone_name]
        n_tiles = grid_w * grid_h
        buckets = {i: [] for i in range(n_tiles)}
        for pid in procedure_ids:
            buckets[_tile_bucket(pid, n_tiles)].append(pid)

        tile_w = (zx1 - zx0) / grid_w
        tile_h = (zy1 - zy0) / grid_h

        for i in range(n_tiles):
            row, col = divmod(i, grid_w)
            tx0 = int(zx0 + col * tile_w)
            ty0 = int(zy0 + row * tile_h)
            tx1 = int(zx0 + (col + 1) * tile_w)
            ty1 = int(zy0 + (row + 1) * tile_h)

            bucket_ids = buckets[i]
            if not bucket_ids:
                continue
            photographed = [(pid, find_photo(photos_dir, pid)) for pid in bucket_ids]
            photographed = [(pid, p) for pid, p in photographed if p]
            total_with_photo += len(photographed)
            fill_frac = len(photographed) / len(bucket_ids)

            if fill_frac >= fill_ratio_needed and photographed:
                _, photo_path = photographed[0]
                try:
                    tile_img = Image.open(photo_path).convert("RGB")
                    tile_img = tile_img.resize((tx1 - tx0, ty1 - ty0), Image.LANCZOS)
                    # only reveal the photo where this tile overlaps the
                    # silhouette's own body shape -- keeps every fill
                    # cropped to the bike's outline, never a plain rectangle
                    tile_body_mask = body_mask[ty0:ty1, tx0:tx1]
                    mask_img = Image.fromarray((tile_body_mask * 255).astype(np.uint8))
                    img.paste(tile_img, (tx0, ty0), mask_img)
                except Exception:
                    pass

    # edges drawn last, on top of everything -- linework stays crisp
    # whether a tile is filled or still empty
    edge_layer = Image.new("RGB", (CANVAS_W, CANVAS_H), RED)
    edge_mask_img = Image.fromarray((edge_mask * 255).astype(np.uint8))
    img.paste(edge_layer, (0, 0), edge_mask_img)

    completion = (total_with_photo / total_procedures) if total_procedures else 0.0
    return img, completion


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--photos-dir", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--hero-image", default=None,
                     help="community hero photo to derive the silhouette from; omit for the generic fallback")
    ap.add_argument("--fill-ratio-needed", type=float, default=0.34)
    args = ap.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    img, completion = build_mosaic(manifest["entries"], args.photos_dir,
                                    hero_image_path=args.hero_image,
                                    fill_ratio_needed=args.fill_ratio_needed)
    img.save(args.output)
    print(f"wrote {args.output} -- {completion:.1%} of tiles show a real contributed photo")
