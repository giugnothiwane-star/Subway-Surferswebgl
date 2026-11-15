"""
MNNROW - collectible coin.

Output: coin.glb
Diameter 0.8 m, thickness 0.12 m, raised rim, an ORIGINAL embossed symbol
("speed M": an italic, lightning-cut letter M) on both faces.
Gold: metallic 1.0, roughness 0.25.

Orientation: faces look along Blender -Y / +Y (glTF +Z / -Z), i.e. the
front face looks at a camera placed behind a player running to glTF -Z.
Spin it around the vertical axis in game. Origin = coin center.

Run:  blender -b -P blender/generate_coin.py -- --out blender/exports
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402

R_OUT = 0.40          # radius (diameter 0.8)
HALF_T = 0.06         # half thickness (0.12)
FIELD_Z = 0.045       # recessed field depth
R_FIELD = 0.33


def speed_m_outline(scale=0.85, shear=0.25):
    """Original 'speed M' glyph: an M with slanted, bolt-like leg cuts,
    italicised by a shear. CCW outline in local XY."""
    pts = [(-0.23, -0.17), (-0.12, -0.23), (-0.12, 0.03), (0.0, -0.11), (0.12, 0.03),
           (0.12, -0.17), (0.23, -0.23), (0.23, 0.20), (0.13, 0.20), (0.0, 0.04),
           (-0.13, 0.20), (-0.23, 0.20)]
    return [((x + shear * y) * scale, y * scale + 0.005) for (x, y) in pts]


def build_coin():
    gold = C.make_material("MAT_Coin_Gold", "#f4c542", 1.0, 0.25)
    gold_hi = C.make_material("MAT_Coin_Gold_Emboss", "#ffd966", 1.0, 0.2)
    root = C.make_root("Coin")
    # disc axis = local Z, rotated so local +Z -> world -Y
    R = C.xform((0, 0, 0), (math.pi / 2, 0, 0))

    b = C.Builder("Coin_Body")
    profile = [(R_FIELD, FIELD_Z), (R_FIELD + 0.015, HALF_T), (R_OUT - 0.01, HALF_T),
               (R_OUT, FIELD_Z), (R_OUT, -FIELD_Z), (R_OUT - 0.01, -HALF_T),
               (R_FIELD + 0.015, -HALF_T), (R_FIELD, -FIELD_Z)]
    b.lathe(profile, gold, segs=40, matrix=R)          # rim + both recessed fields (caps)
    # thin decorative inner ring on each face
    for sgn in (1, -1):
        # closed triangular profile (first point repeated -> merged into a torus)
        ring = [(0.30, sgn * (FIELD_Z - 0.002)), (0.31, sgn * (FIELD_Z + 0.006)),
                (0.315, sgn * (FIELD_Z - 0.002)), (0.30, sgn * (FIELD_Z - 0.002))]
        b.lathe(ring, gold_hi, segs=40, matrix=R, cap_start=False, cap_end=False)
    b.finish(parent=root, auto_smooth=35.0)

    s = C.Builder("Coin_Symbol")
    glyph = speed_m_outline()
    s.prism(glyph, 0.014, gold_hi, matrix=R, z0=FIELD_Z - 0.002)                # front
    s.prism([(-x, y) for (x, y) in glyph], 0.014, gold_hi, matrix=R,
            z0=-FIELD_Z - 0.012)                                               # back (mirrored)
    s.finish(parent=root)


BUILDERS = [("coin.glb", build_coin, 2000)]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
