"""
MNNROW - run every generator and write all GLBs + a report.json.

Run:  blender -b -P blender/generate_all.py -- --out blender/exports
 or:  python blender/generate_all.py --out blender/exports      (pip bpy)
"""
import importlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402
import bpy  # noqa: E402

MODULES = [
    "generate_train",
    "generate_coin",
    "generate_magnet",
    "generate_hoverboard",
    "generate_obstacles",
    "generate_buildings",
    "generate_props",
]


def main():
    out = C.output_dir()
    t0 = time.time()
    results = []
    failed = []
    for name in MODULES:
        try:
            mod = importlib.import_module(name)
            results += mod.main(out)
        except Exception as e:  # keep going, report at the end
            import traceback
            traceback.print_exc()
            failed.append("%s: %s" % (name, e))
    report = {
        "blender_version": bpy.app.version_string,
        "seconds": round(time.time() - t0, 1),
        "assets": results,
        "failed": failed,
    }
    with open(os.path.join(out, "report.json"), "w") as f:
        json.dump(report, f, indent=2)
    C.log("%d GLB files written to %s in %.1fs" % (len(results), out, time.time() - t0))
    for r in results:
        C.log("  %-26s %6d tris  %8d bytes" % (r["file"], r["tris"], r["bytes"]))
    if failed:
        C.log("FAILED: " + "; ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
