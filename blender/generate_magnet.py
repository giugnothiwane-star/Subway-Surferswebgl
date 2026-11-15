"""
MNNROW - magnet power-up.

Output: magnet.glb
U shape ~0.9 m tall (arc on top, legs pointing down), glossy red body,
silver tips. The U lies in the XZ plane (faces look along +-Y).
Origin = base center (bottom of the tips at z = 0).

Run:  blender -b -P blender/generate_magnet.py -- --out blender/exports
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402

ARC_R = 0.27          # centerline radius of the bend
ARC_Z = 0.55          # bend center height
TIP_Z = 0.18          # silver tip height
HALF = 0.09           # half size of the square-ish cross-section


def build_magnet():
    red = C.make_material("MAT_Magnet_Red", "#e0182d", 0.1, 0.15)
    silver = C.make_material("MAT_Magnet_Tip", "#f2f4f7", 0.5, 0.2)
    dark = C.make_material("MAT_Magnet_Band", "#3b0a10", 0.2, 0.4)
    root = C.make_root("Magnet")

    path = []
    for z in (0.0, TIP_Z, 0.3, 0.42, ARC_Z):                        # left leg up
        path.append((-ARC_R, 0.0, z))
    n_arc = 14
    for k in range(1, n_arc):                                       # bend over the top
        a = math.pi - math.pi * k / n_arc
        path.append((ARC_R * math.cos(a), 0.0, ARC_Z + ARC_R * math.sin(a)))
    for z in (ARC_Z, 0.42, 0.3, TIP_Z, 0.0):                        # right leg down
        path.append((ARC_R, 0.0, z))
    profile = C.rounded_rect(2 * HALF, 2 * HALF, 0.035, n_corner=2)
    nseg = len(path) - 1

    def mat_of(i, j):
        if i == 0 or i == nseg - 1:
            return 1                                                # silver tips
        return 0

    b = C.Builder("Magnet_Body")
    b.sweep(path, profile, [red, silver], mat_of, normal0=(1, 0, 0), cap_mat=1)
    # thin dark bands separating red and silver
    for sx in (-1, 1):
        b.box((2 * HALF + 0.012, 2 * HALF + 0.012, 0.018), (sx * ARC_R, 0, TIP_Z + 0.009), dark,
              bevel=0.006, segs=1)
    b.finish(parent=root, auto_smooth=40.0)


BUILDERS = [("magnet.glb", build_magnet, 2000)]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
