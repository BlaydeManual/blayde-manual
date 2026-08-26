#!/usr/bin/env python3
"""
Blayde Manual -- contribution checker.

Same script runs in two places:
  - locally, before a contributor opens a PR (fast, private feedback)
  - in CI, on the PR (confirms what they already saw -- no surprises)

Only checks things a machine can judge fairly: resolution, blur, EXIF
stripped, filename matches a real procedure_id in the manifest. It never
judges "does this actually show the right procedure" -- that's a human
call, tagged needs-second-opinion, not a hard reject.

Exit code 0 = all checks passed. Non-zero = at least one hard-fail.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ExifTags
import numpy as np

MIN_WIDTH = 1200
MIN_HEIGHT = 900
BLUR_VARIANCE_FLOOR = 80.0   # Laplacian-variance focus score; below this reads as blurry
MAX_FILE_MB = 15


def laplacian_variance(gray_arr):
    # 3x3 discrete Laplacian via manual convolution (no scipy dependency)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    a = gray_arr.astype(np.float32)
    h, w = a.shape
    out = np.zeros_like(a)
    out[1:-1, 1:-1] = (
        a[0:-2, 1:-1] * k[0, 1]
        + a[1:-1, 0:-2] * k[1, 0]
        + a[1:-1, 1:-1] * k[1, 1]
        + a[1:-1, 2:] * k[1, 2]
        + a[2:, 1:-1] * k[2, 1]
    )
    return out.var()


def check_image(path, expected_id=None, manifest_ids=None):
    results = {"file": str(path), "hard_fails": [], "warnings": [], "info": {}}
    p = Path(path)

    size_mb = p.stat().st_size / (1024 * 1024)
    results["info"]["file_size_mb"] = round(size_mb, 2)
    if size_mb > MAX_FILE_MB:
        results["hard_fails"].append(f"file too large ({size_mb:.1f}MB > {MAX_FILE_MB}MB)")

    try:
        img = Image.open(p)
        img.load()
    except Exception as e:
        results["hard_fails"].append(f"not a readable image: {e}")
        return results

    w, h = img.size
    results["info"]["dimensions"] = f"{w}x{h}"
    if w < MIN_WIDTH or h < MIN_HEIGHT:
        results["hard_fails"].append(f"resolution too low ({w}x{h}, need >= {MIN_WIDTH}x{MIN_HEIGHT})")

    exif = img.getexif()
    if exif and len(exif) > 0:
        tags_present = [ExifTags.TAGS.get(k, k) for k in exif.keys()]
        gps_present = any("GPS" in str(t) for t in tags_present) or 34853 in exif
        results["info"]["exif_tag_count"] = len(exif)
        if gps_present:
            results["hard_fails"].append("EXIF GPS data present -- strip location before upload")
        else:
            results["warnings"].append(
                f"EXIF metadata present ({len(exif)} tags) -- stripping recommended for privacy"
            )

    gray = np.array(img.convert("L").resize((min(w, 1000), int(min(w, 1000) * h / w))))
    variance = laplacian_variance(gray)
    results["info"]["focus_score"] = round(float(variance), 1)
    if variance < BLUR_VARIANCE_FLOOR:
        results["hard_fails"].append(
            f"image looks blurry/out of focus (focus score {variance:.1f}, need >= {BLUR_VARIANCE_FLOOR})"
        )

    if expected_id:
        stem = p.stem
        if manifest_ids is not None and expected_id not in manifest_ids:
            results["hard_fails"].append(
                f"'{expected_id}' is not a known procedure_id in this vehicle's manifest.json"
            )
        elif stem.split("__")[0] != expected_id and stem != expected_id:
            results["warnings"].append(
                f"filename '{stem}' doesn't cleanly match expected procedure_id '{expected_id}' "
                "-- ok if this is an alternate angle (use '<procedure_id>__altN.jpg')"
            )

    return results


def strip_exif_inplace(path):
    """Convenience: re-save without EXIF (contributor can run --fix)."""
    img = Image.open(path)
    data = list(img.getdata())
    clean = Image.new(img.mode, img.size)
    clean.putdata(data)
    clean.save(path)


def load_manifest_ids(manifest_path):
    if not manifest_path or not Path(manifest_path).exists():
        return None
    m = json.loads(Path(manifest_path).read_text())
    return {e["procedure_id"] for e in m["entries"]}


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+", help="image file(s) to check")
    ap.add_argument("--manifest", help="path to manifest.json for procedure_id validation")
    ap.add_argument("--fix", action="store_true", help="strip EXIF in place on warning")
    ap.add_argument("--json", action="store_true", help="machine-readable output (used by CI)")
    args = ap.parse_args()

    manifest_ids = load_manifest_ids(args.manifest)
    all_results = []
    any_hard_fail = False

    for img_path in args.images:
        p = Path(img_path)
        expected_id = p.stem.split("__")[0]
        r = check_image(p, expected_id=expected_id, manifest_ids=manifest_ids)
        if args.fix and any("EXIF" in w for w in r["warnings"]):
            strip_exif_inplace(p)
            r["warnings"].append("EXIF stripped by --fix")
        all_results.append(r)
        if r["hard_fails"]:
            any_hard_fail = True

    if args.json:
        print(json.dumps(all_results, indent=2))
    else:
        for r in all_results:
            print(f"\n{r['file']}")
            for k, v in r["info"].items():
                print(f"  {k}: {v}")
            for f in r["hard_fails"]:
                print(f"  FAIL: {f}")
            for w in r["warnings"]:
                print(f"  warn: {w}")
            if not r["hard_fails"]:
                print("  -> PASS (ready to submit)")

    sys.exit(1 if any_hard_fail else 0)


if __name__ == "__main__":
    main()
