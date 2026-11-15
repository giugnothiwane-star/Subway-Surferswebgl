"""
MNNROW - minimal GLB validator (pure Python, no Blender needed).

Checks the 12-byte header (magic 'glTF', version 2, declared length ==
file size), parses the JSON chunk and counts meshes / primitives /
materials / nodes, estimates triangles from index accessors and reports
the bounding box (glTF Y-up) from the POSITION accessor min/max.

Usage:  python3 blender/validate_glb.py blender/exports/*.glb
"""
import json
import os
import struct
import sys


def validate(path):
    with open(path, "rb") as f:
        data = f.read()
    if len(data) < 20:
        raise ValueError("file too small")
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError("bad magic %r" % magic)
    if version != 2:
        raise ValueError("unsupported version %d" % version)
    if length != len(data):
        raise ValueError("header length %d != file size %d" % (length, len(data)))
    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        raise ValueError("first chunk is not JSON")
    gltf = json.loads(data[20:20 + chunk_len].decode("utf-8"))
    meshes = gltf.get("meshes", [])
    prims = sum(len(m.get("primitives", [])) for m in meshes)
    accessors = gltf.get("accessors", [])
    tris = 0
    for m in meshes:
        for p in m.get("primitives", []):
            if p.get("mode", 4) != 4:
                continue
            if "indices" in p:
                tris += accessors[p["indices"]]["count"] // 3
            else:
                tris += accessors[p["attributes"]["POSITION"]]["count"] // 3
    lo, hi = [1e9] * 3, [-1e9] * 3
    for m in meshes:
        for p in m.get("primitives", []):
            acc = accessors[p["attributes"]["POSITION"]]
            if "min" in acc and "max" in acc:
                lo = [min(a, b) for a, b in zip(lo, acc["min"])]
                hi = [max(a, b) for a, b in zip(hi, acc["max"])]
    emissive = sum(1 for m in gltf.get("materials", []) if any(m.get("emissiveFactor", [0, 0, 0])))
    return {
        "file": os.path.basename(path),
        "bytes": len(data),
        "meshes": len(meshes),
        "primitives": prims,
        "materials": len(gltf.get("materials", [])),
        "emissive_materials": emissive,
        "nodes": len(gltf.get("nodes", [])),
        "tris": tris,
        # glTF is Y-up; node transforms are identity for MNNROW exports
        "bbox_min": [round(v, 3) for v in lo],
        "bbox_max": [round(v, 3) for v in hi],
        "generator": gltf.get("asset", {}).get("generator", "?"),
    }


def main(paths):
    ok = True
    for p in paths:
        try:
            r = validate(p)
            print("OK   %-26s %8d B  meshes=%2d prims=%3d mats=%2d (emissive %d) nodes=%3d tris=%6d  size=%s  min=%s max=%s"
                  % (r["file"], r["bytes"], r["meshes"], r["primitives"], r["materials"],
                     r["emissive_materials"], r["nodes"], r["tris"],
                     "x".join("%.2f" % (b - a) for a, b in zip(r["bbox_min"], r["bbox_max"])),
                     r["bbox_min"], r["bbox_max"]))
        except Exception as e:  # noqa: BLE001
            ok = False
            print("FAIL %s: %s" % (p, e))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
