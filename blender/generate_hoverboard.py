"""
MNNROW - hoverboards, 5 original styles.

Outputs: hoverboard_classic.glb, hoverboard_neon.glb, hoverboard_futuristic.glb,
         hoverboard_urban.glb, hoverboard_energy.glb
Length 1.6 m (along Y, nose at +Y = running direction), width 0.5 m,
deck thickness ~0.08 m, rounded nose/tail, thruster pods underneath.
Origin = base center (bottom of the pods at z = 0).

Run:  blender -b -P blender/generate_hoverboard.py -- --out blender/exports
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402

PI = math.pi
HALF_LEN = 0.8
MAX_HW = 0.25
THICK = 0.08
POD_R = 0.055
DECK_Z = 0.145          # deck center height (pods below)


def sgn(v):
    return 1.0 if v >= 0 else -1.0


def deck(b, halfw, kick, mats, sq=4.0, n_len=30, n_prof=16):
    """Lofted deck. mats = [top, edge, bottom]. halfw(t), kick(t) with
    t in [-1, 1] along the length (t=+1 = nose)."""
    rings = []
    for i in range(n_len + 1):
        s = -1.0 + 2.0 * i / n_len
        t = math.sin(s * PI / 2)
        w = max(0.012, halfw(t))
        h = THICK * (0.55 + 0.45 * min(1.0, w / MAX_HW))
        zc = DECK_Z + kick(t)
        ring = []
        for k in range(n_prof):
            a = 2 * PI * k / n_prof + PI / n_prof
            c, sn = math.cos(a), math.sin(a)
            ring.append((w * sgn(c) * abs(c) ** (2 / sq), t * HALF_LEN,
                         zc + h / 2 * sgn(sn) * abs(sn) ** (2 / sq)))
        rings.append(ring)

    def mat_of(i, j):
        a = 2 * PI * (j + 1) / n_prof
        sn = math.sin(a)
        return 0 if sn > 0.7 else (2 if sn < -0.7 else 1)
    b.loft(rings, mats, mat_of, cap_mat=1, smooth=True)


def kick_both(amount, start=0.55):
    return lambda t: amount * max(0.0, abs(t) - start) ** 2 / (1 - start) ** 2


def kick_nose(amount, start=0.5):
    return lambda t: amount * max(0.0, t - start) ** 2 / (1 - start) ** 2 if t > 0 else 0.0


def pod(b, x, y, body, glow, r=POD_R, length=0.3):
    b.cylinder(r, length, (x, y, r), body, rot=(PI / 2, 0, 0), segs=12)
    b.cylinder(r * 0.75, 0.02, (x, y - length / 2 - 0.005, r), glow, rot=(PI / 2, 0, 0), segs=12)
    b.box((0.03, length * 0.6, DECK_Z - r), (x, y, r + (DECK_Z - r) / 2), body)   # strut


def top_z(t_kick=0.0):
    return DECK_Z + THICK / 2 + t_kick


# --------------------------------------------------------------------------

def build_classic():
    top = C.make_material("MAT_Board_Classic_Grip", "#2b2b30", 0.0, 0.85)
    edge = C.make_material("MAT_Board_Classic_Deck", "#e2572b", 0.1, 0.45)
    bottom = C.make_material("MAT_Board_Classic_Bottom", "#f3e2c0", 0.0, 0.5)
    stripe = C.make_material("MAT_Board_Classic_Stripe", "#f7f7f2", 0.0, 0.5)
    metal = C.make_material("MAT_Board_Pod_Metal", "#9ea4ad", 0.9, 0.3)
    glow = C.make_material("MAT_Board_Classic_Glow", "#7fd8ff", 0.0, 0.3,
                           emission="#5fcfff", emission_strength=2.0)
    root = C.make_root("Hoverboard_Classic")
    d = C.Builder("Hoverboard_Deck")
    deck(d, lambda t: MAX_HW * (1 - abs(t) ** 4) ** 0.25, kick_both(0.07), [top, edge, bottom])
    for x in (-0.1, 0.1):
        d.box((0.05, 0.8, 0.006), (x, 0, top_z()), stripe)
    d.finish(parent=root, auto_smooth=50)
    p = C.Builder("Hoverboard_Thrusters")
    for y in (-0.45, 0.45):
        pod(p, 0, y, metal, glow)
    p.finish(parent=root)


def build_neon():
    top = C.make_material("MAT_Board_Neon_Top", "#0d0d14", 0.3, 0.15)
    edge = C.make_material("MAT_Board_Neon_Edge", "#ff2bd6", 0.0, 0.3,
                           emission="#ff2bd6", emission_strength=3.0)
    bottom = C.make_material("MAT_Board_Neon_Bottom", "#1a1a26", 0.4, 0.3)
    line = C.make_material("MAT_Board_Neon_Line", "#20f0ff", 0.0, 0.3,
                           emission="#20f0ff", emission_strength=3.0)
    metal = C.make_material("MAT_Board_Neon_Pod", "#2a2a35", 0.8, 0.25)
    root = C.make_root("Hoverboard_Neon")

    def hw(t):
        if t > 0:
            return MAX_HW * (1 - t ** 2.2) ** 0.6          # pointed nose
        return MAX_HW * (1 - abs(t) ** 4) ** 0.25          # round tail
    d = C.Builder("Hoverboard_Deck")
    deck(d, hw, kick_nose(0.1), [top, edge, bottom])
    d.box((0.02, 1.0, 0.006), (0, -0.05, top_z()), line)
    d.box((0.3, 0.9, 0.01), (0, -0.05, DECK_Z - THICK / 2 - 0.004), line)        # underglow
    d.finish(parent=root, auto_smooth=50)
    p = C.Builder("Hoverboard_Thrusters")
    for x in (-0.12, 0.12):
        for y in (-0.48, 0.4):
            pod(p, x, y, metal, line, r=0.045, length=0.24)
    p.finish(parent=root)


def build_futuristic():
    top = C.make_material("MAT_Board_Futur_Shell", "#f4f6fa", 0.3, 0.12)
    edge = C.make_material("MAT_Board_Futur_Trim", "#9aa6b8", 0.8, 0.2)
    bottom = C.make_material("MAT_Board_Futur_Bottom", "#3d4452", 0.6, 0.3)
    glow = C.make_material("MAT_Board_Futur_Glow", "#2f7bff", 0.0, 0.2,
                           emission="#2f7bff", emission_strength=3.0)
    root = C.make_root("Hoverboard_Futuristic")

    def hw(t):
        base = 0.205 * (1 - abs(t) ** 3) ** (1 / 3)
        wings = 0.045 * math.exp(-((t + 0.35) / 0.22) ** 2)            # rear "hips"
        return base + wings
    d = C.Builder("Hoverboard_Deck")
    deck(d, hw, lambda t: 0.0, [top, edge, bottom], sq=3.0)
    for x in (-0.07, 0.07):
        d.box((0.015, 0.9, 0.006), (x, 0.05, top_z()), glow)
    fin = [(-0.72, 0.0), (-0.32, 0.0), (-0.6, 0.13), (-0.7, 0.13)]
    d.prism(fin, 0.02, top, matrix=C.xform((0, 0, top_z() - 0.005), (PI / 2, 0, PI / 2)))
    d.finish(parent=root, auto_smooth=50)
    p = C.Builder("Hoverboard_Thrusters")
    for x in (-0.13, 0.13):
        pod(p, x, 0.4, edge, glow, r=0.045, length=0.24)
    pod(p, 0, -0.45, edge, glow, r=POD_R, length=0.34)
    p.finish(parent=root)


def build_urban():
    top = C.make_material("MAT_Board_Urban_Grip", "#1c1c1c", 0.0, 0.9)
    edge = C.make_material("MAT_Board_Urban_Deck", "#ffcf1f", 0.0, 0.5)
    bottom = C.make_material("MAT_Board_Urban_Bottom", "#262626", 0.0, 0.6)
    paint = [C.make_material("MAT_Board_Urban_Paint_A", "#ff4f8b", 0.0, 0.5),
             C.make_material("MAT_Board_Urban_Paint_B", "#2ad4c0", 0.0, 0.5),
             C.make_material("MAT_Board_Urban_Paint_C", "#ffcf1f", 0.0, 0.5)]
    truck = C.make_material("MAT_Board_Urban_Truck", "#b5bac2", 0.9, 0.35)
    glow = C.make_material("MAT_Board_Urban_Glow", "#ff8a1f", 0.0, 0.3,
                           emission="#ff8a1f", emission_strength=2.0)
    root = C.make_root("Hoverboard_Urban")
    d = C.Builder("Hoverboard_Deck")
    deck(d, lambda t: MAX_HW * (1 - abs(t) ** 6) ** (1 / 6), kick_both(0.09, 0.6),
         [top, edge, bottom], sq=6.0)
    for k, m in enumerate(paint):                        # graffiti-ish slashes on top
        y0 = -0.35 + k * 0.25
        para = [(-0.2, y0), (-0.2, y0 + 0.08), (0.2, y0 + 0.2), (0.2, y0 + 0.12)]
        d.prism(para, 0.006, m, matrix=C.xform((0, 0, top_z())))
    d.finish(parent=root, auto_smooth=50)
    p = C.Builder("Hoverboard_Thrusters")
    for y in (-0.5, 0.5):
        p.box((0.36, 0.12, 0.05), (0, y, DECK_Z - THICK / 2 - 0.02), truck, bevel=0.01, segs=1)
        for x in (-0.15, 0.15):
            p.cylinder(0.05, 0.14, (x, y, 0.05), truck, rot=(PI / 2, 0, 0), segs=12)
            p.cylinder(0.038, 0.02, (x, y - 0.075, 0.05), glow, rot=(PI / 2, 0, 0), segs=12)
    p.finish(parent=root)


def build_energy():
    top = C.make_material("MAT_Board_Energy_Top", "#1d2b24", 0.5, 0.2)
    edge = C.make_material("MAT_Board_Energy_Edge", "#d4ff3a", 0.0, 0.3,
                           emission="#c8ff2a", emission_strength=3.0)
    bottom = C.make_material("MAT_Board_Energy_Bottom", "#101814", 0.6, 0.3)
    core = C.make_material("MAT_Board_Energy_Core", "#3affb0", 0.0, 0.2,
                           emission="#3affb0", emission_strength=4.0)
    metal = C.make_material("MAT_Board_Energy_Pod", "#56605a", 0.9, 0.25)
    root = C.make_root("Hoverboard_Energy")
    d = C.Builder("Hoverboard_Deck")
    deck(d, lambda t: MAX_HW * (1 - abs(t) ** 1.8) ** 0.7, kick_both(0.04, 0.6),
         [top, edge, bottom], sq=3.0)
    d.box((0.07, 1.1, 0.008), (0, 0, top_z()), core)
    for y in (-0.3, 0.0, 0.3):                                       # chevrons
        d.prism([(-0.12, y - 0.04), (0.0, y + 0.04), (0.12, y - 0.04), (0.12, y - 0.0),
                 (0.0, y + 0.08), (-0.12, y - 0.0)], 0.007, core, matrix=C.xform((0, 0, top_z())))
    d.finish(parent=root, auto_smooth=50)
    p = C.Builder("Hoverboard_Thrusters")
    p.lathe([(0.12, 0.0), (0.16, 0.0), (0.16, 0.03), (0.12, 0.03), (0.12, 0.0)], core,
            segs=24, cap_start=False, cap_end=False,
            matrix=C.xform((0, 0, DECK_Z - THICK / 2 - 0.035)))          # emitter ring
    for y in (-0.48, 0.48):
        pod(p, 0, y, metal, core, r=0.05, length=0.26)
    p.finish(parent=root)


BUILDERS = [
    ("hoverboard_classic.glb", build_classic, 3000),
    ("hoverboard_neon.glb", build_neon, 3000),
    ("hoverboard_futuristic.glb", build_futuristic, 3000),
    ("hoverboard_urban.glb", build_urban, 3000),
    ("hoverboard_energy.glb", build_energy, 3000),
]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
