"""
MNNROW - environment props.

Outputs:
  lamp.glb          street lamp, 4.5 m tall, arm reaching towards +X
  rail_segment.glb  2 m track piece: 2 rails + 4 sleepers + ballast bed
                    (2.5 m wide = lane width). Origin: rail TOP at z = 0,
                    centered; tiles seamlessly every 2 m along Y.
  palm.glb          curved palm tree (~6.5 m)
  fir.glb           layered fir tree (~5.3 m)
  fir_snow.glb      same fir with snow caps + snow mound
  cactus.glb        ribbed saguaro-like cactus (~3 m) with two arms
  rock.glb          faceted low-poly rock cluster
  station.glb       desert station: platform (12 m) + slanted canopy,
                    adobe back wall, benches, emissive sign. Track side = -X.

Origin = base center unless noted. Z up.

Run:  blender -b -P blender/generate_props.py -- --out blender/exports
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402  (imports bpy first: needed by pip-bpy for mathutils)
from mathutils import Vector, noise  # noqa: E402

PI = math.pi


# --------------------------------------------------------------------------

def build_lamp():
    dark = C.make_material("MAT_Lamp_Pole", "#2f343b", 0.8, 0.4)
    head = C.make_material("MAT_Lamp_Head", "#454b53", 0.8, 0.35)
    bulb = C.make_material("MAT_Lamp_Light", "#fff4d6", 0.0, 0.2,
                           emission="#ffe9b0", emission_strength=5.0)
    root = C.make_root("Lamp")
    b = C.Builder("Lamp_Mesh")
    b.cylinder(0.2, 0.3, (0, 0, 0.15), dark, segs=12)
    b.cylinder(0.13, 0.25, (0, 0, 0.42), dark, segs=12, r2=0.09)
    b.cylinder(0.075, 3.75, (0, 0, 0.45 + 3.75 / 2), dark, segs=10, r2=0.055)   # 0.45 -> 4.2
    arm = [(0, 0, 4.0), (0, 0, 4.22), (0.08, 0, 4.36), (0.25, 0, 4.44), (0.5, 0, 4.46), (0.78, 0, 4.45)]
    b.sweep(arm, C.circle2d(0.035, 8), dark, smooth=True)
    b.box((0.62, 0.3, 0.1), (1.0, 0, 4.45), head, bevel=0.03, segs=2)           # top = 4.5
    b.box((0.5, 0.22, 0.02), (1.0, 0, 4.395), bulb)
    b.finish(parent=root)


def build_rail_segment():
    steel = C.make_material("MAT_Rail_Steel", "#8d939b", 0.9, 0.3)
    sleeper = C.make_material("MAT_Rail_Sleeper", "#6e5a48", 0.0, 0.85)
    ballast = C.make_material("MAT_Rail_Ballast", "#77736d", 0.0, 0.95)
    clip = C.make_material("MAT_Rail_Clip", "#2c2f33", 0.6, 0.5)
    root = C.make_root("Rail_Segment")
    b = C.Builder("Rail_Segment_Mesh")
    # I-shaped rail profile (x, z), top at z = 0
    prof = [(-0.036, 0.0), (0.036, 0.0), (0.036, -0.042), (0.009, -0.05), (0.009, -0.12),
            (0.07, -0.135), (0.07, -0.15), (-0.07, -0.15), (-0.07, -0.135), (-0.009, -0.12),
            (-0.009, -0.05), (-0.036, -0.042)]
    for sx in (-1, 1):
        b.prism(prof, 2.0, steel, matrix=C.xform((sx * 0.7175, 0, 0), (PI / 2, 0, 0)))
    for k in range(4):
        y = -0.75 + 0.5 * k
        b.box((2.4, 0.22, 0.14), (0, y, -0.22), sleeper)
        for sx in (-1, 1):
            for dx in (-0.1, 0.1):
                b.box((0.06, 0.12, 0.03), (sx * 0.7175 + dx, y, -0.14), clip)
    b.prism([(-1.25, -0.45), (1.25, -0.45), (1.12, -0.24), (-1.12, -0.24)], 2.0, ballast,
            matrix=C.xform((0, 0, 0), (PI / 2, 0, 0)))
    b.finish(parent=root)


def build_palm():
    bark = C.make_material("MAT_Palm_Bark", "#8a6a48", 0.0, 0.9)
    bark2 = C.make_material("MAT_Palm_Bark_Ring", "#6d5238", 0.0, 0.9)
    leaf = C.make_material("MAT_Palm_Leaf", "#3f9a3a", 0.0, 0.6, double_sided=True)
    nut = C.make_material("MAT_Palm_Coconut", "#5a3d22", 0.0, 0.7)
    root = C.make_root("Palm")
    b = C.Builder("Palm_Mesh")
    n = 22
    path, scales = [], []
    for i in range(n + 1):
        s = i / n
        path.append((0.9 * s * s, 0.0, 6.0 * s))
        scales.append((1.0 - 0.38 * s) * (1.08 if i % 2 else 1.0))
    b.sweep(path, C.circle2d(0.22, 10), [bark, bark2],
            mat_of=lambda i, j: i % 2, scales=scales, smooth=True)
    top = Vector(path[-1])
    b.sphere(0.28, tuple(top + Vector((0, 0, 0.05))), nut, segs=10, rings=6)
    for k in range(3):
        a = k * 2 * PI / 3 + 0.4
        b.sphere(0.12, tuple(top + Vector((0.22 * math.cos(a), 0.22 * math.sin(a), -0.18))), nut,
                 segs=8, rings=6)
    # fronds: arched V-section strips, double-sided material
    n_leaf, steps, length = 8, 9, 2.7
    for k in range(n_leaf):
        phi = k * 2 * PI / n_leaf + (0.15 if k % 2 else -0.1)
        d = Vector((math.cos(phi), math.sin(phi), 0.0))
        side = Vector((-math.sin(phi), math.cos(phi), 0.0))
        rise = 0.55 if k % 2 else 0.35
        rings = []
        for i in range(steps + 1):
            u = i / steps
            c = top + Vector((0, 0, 0.1)) + d * (length * u) + Vector((0, 0, rise * u - 1.7 * u * u))
            w = 0.04 + 0.4 * math.sin(PI * min(1.0, u * 1.08)) ** 0.6
            rings.append([tuple(c - side * w + Vector((0, 0, -0.08 * w))), tuple(c + Vector((0, 0, 0.04))),
                          tuple(c + side * w + Vector((0, 0, -0.08 * w)))])
        b.loft(rings, leaf, closed=False, recalc=False, smooth=True)
    b.finish(parent=root, auto_smooth=60)


def fir(snow):
    trunk = C.make_material("MAT_Fir_Trunk", "#5b3e29", 0.0, 0.9)
    green = C.make_material("MAT_Fir_Needles" + ("_Winter" if snow else ""),
                            "#1f5a3a" if snow else "#2d7a45", 0.0, 0.8)
    snow_m = C.make_material("MAT_Snow", "#f4f8ff", 0.0, 0.6) if snow else None
    root = C.make_root("Fir_Snow" if snow else "Fir")
    b = C.Builder("Fir_Mesh")
    b.cylinder(0.18, 1.0, (0, 0, 0.5), trunk, segs=8)
    tiers = [(1.5, 0.8, 2.0), (1.2, 1.9, 1.8), (0.9, 2.9, 1.6), (0.55, 3.9, 1.4)]
    for r, z0, h in tiers:
        b.cylinder(r, h, (0, 0, z0 + h / 2), green, segs=10, r2=0.02)
        if snow:
            f = 0.5                                      # snow covers the top 50 % of each tier
            hs = h * f + 0.04
            b.cylinder(r * f + 0.05, hs, (0, 0, z0 + h * (1 - f) + hs / 2), snow_m, segs=10, r2=0.03)
    if snow:
        b.lathe([(1.7, 0.0), (1.45, 0.1), (0.9, 0.2), (0.25, 0.24)], snow_m, segs=16)  # snow mound
    b.finish(parent=root, auto_smooth=45)


def build_fir():
    fir(False)


def build_fir_snow():
    fir(True)


def ribbed(r, n=16, depth=0.14):
    return [((r * (1.0 if k % 2 == 0 else 1.0 - depth)) * math.cos(2 * PI * k / n),
             (r * (1.0 if k % 2 == 0 else 1.0 - depth)) * math.sin(2 * PI * k / n)) for k in range(n)]


def build_cactus():
    green = C.make_material("MAT_Cactus", "#4f8a3c", 0.0, 0.7)
    flower = C.make_material("MAT_Cactus_Flower", "#ff6fa8", 0.0, 0.5)
    root = C.make_root("Cactus")
    b = C.Builder("Cactus_Mesh")
    prof = ribbed(1.0)
    rings = []
    for z, s in ((0.0, 0.3), (0.5, 0.31), (1.5, 0.3), (2.4, 0.29), (2.7, 0.27), (2.85, 0.22),
                 (2.95, 0.14), (3.0, 0.04)):
        rings.append([(x * s, y * s, z) for x, y in prof])
    b.loft(rings, green, smooth=True)
    for sx, z0, z1, reach in ((1, 1.1, 2.3, 0.62), (-1, 1.6, 2.55, 0.5)):
        path = [(0.0, 0, z0), (sx * reach * 0.5, 0, z0 + 0.02), (sx * reach * 0.85, 0, z0 + 0.12),
                (sx * reach, 0, z0 + 0.35), (sx * reach, 0, z0 + 0.7), (sx * reach, 0, z1 - 0.12),
                (sx * reach, 0, z1 - 0.04), (sx * reach, 0, z1)]
        sc = [0.19, 0.19, 0.19, 0.19, 0.18, 0.17, 0.12, 0.04]
        b.sweep(path, ribbed(1.0), green, scales=sc, normal0=(0, 1, 0), smooth=True)
        b.sphere(0.06, (sx * reach, 0, z1 + 0.02), flower, segs=8, rings=5)
    b.sphere(0.07, (0, 0, 3.02), flower, segs=8, rings=5)
    b.finish(parent=root, auto_smooth=55)


def build_rock():
    stone = C.make_material("MAT_Rock", "#8d8478", 0.0, 0.9)
    root = C.make_root("Rock")
    b = C.Builder("Rock_Mesh")

    def displace(scale, seed, lift):
        def f(v):
            n = noise.noise(v * 1.4 + Vector((seed, seed * 0.7, seed * 1.3)))
            v = v * (1.0 + 0.28 * n)
            v = Vector((v.x * scale[0], v.y * scale[1], v.z * scale[2]))
            v.z = max(v.z, -0.25 * scale[2]) + lift
            return v
        return f
    b.icosphere(1.0, (0, 0, 0), stone, subdiv=3, displace=displace((0.9, 0.7, 0.55), 3.1, 0.12))
    b.icosphere(1.0, (0.85, 0.45, 0), stone, subdiv=2, displace=displace((0.4, 0.35, 0.3), 7.7, 0.06))
    b.finish(parent=root, auto_smooth=None)


def build_station():
    concrete = C.make_material("MAT_Station_Platform", "#cdb48a", 0.0, 0.85)
    edge = C.make_material("MAT_Station_SafetyEdge", "#f2c230", 0.0, 0.6)
    adobe = C.make_material("MAT_Station_Adobe", "#d08b5b", 0.0, 0.9)
    steel = C.make_material("MAT_Station_Steel", "#2f6f73", 0.7, 0.4)
    roof = C.make_material("MAT_Station_Roof", "#b5543a", 0.2, 0.6)
    wood = C.make_material("MAT_Station_Wood", "#8a5a34", 0.0, 0.75)
    sign = C.make_material("MAT_Station_Sign", "#ffd27a", 0.0, 0.4,
                           emission="#ffc24d", emission_strength=1.8)
    glass = C.make_material("MAT_Station_Window", "#2a3b4a", 0.3, 0.1)
    root = C.make_root("Station")
    b = C.Builder("Station_Mesh")
    PZ = 0.9
    b.box((3.2, 12.0, PZ), (0, 0, PZ / 2), concrete)                                # platform
    b.box((0.3, 12.0, 0.02), (-1.45, 0, PZ + 0.01), edge)                           # safety edge
    b.box((0.3, 12.0, 2.6), (1.45, 0, PZ + 1.3), adobe)                             # back wall
    b.box((0.4, 12.2, 0.15), (1.45, 0, PZ + 2.65), wood)
    for y in (-3.5, 3.5):
        b.frame_ring(1.2, 1.0, 0.1, 0.08, C.side_matrix((1.3, y, PZ + 1.6), (-1, 0, 0)), wood, glass)
    b.frame_ring(1.2, 2.1, 0.1, 0.1, C.side_matrix((1.3, 0.0, PZ + 1.05), (-1, 0, 0)), wood, wood)
    # columns + braces
    for y in (-4.5, -1.5, 1.5, 4.5):
        b.cylinder(0.09, 3.1, (0.75, y, PZ + 1.55), steel, segs=10)
        b.box((0.08, 0.08, 1.3), (0.2, y, PZ + 2.75), steel, rot=(0, -0.75, 0))
    # slanted canopy, fascia, roof ribs
    tilt = math.radians(6)
    b.box((3.7, 12.6, 0.12), (0.05, 0, PZ + 3.15), roof, rot=(0, tilt, 0))
    b.box((0.06, 12.6, 0.3), (-1.8, 0, PZ + 3.05), steel)
    for k in range(9):
        b.box((3.6, 0.06, 0.05), (0.05, -6.0 + k * 1.5, PZ + 3.24), roof, rot=(0, tilt, 0))
    # hanging sign
    for y in (-0.8, 0.8):
        b.cylinder(0.012, 0.45, (-0.6, y, PZ + 2.8), steel, segs=6)
    b.box((0.08, 2.0, 0.45), (-0.6, 0, PZ + 2.35), sign)
    b.box((0.1, 2.1, 0.06), (-0.6, 0, PZ + 2.6), steel)
    # benches + barrels
    for y in (-3.0, 3.0):
        b.box((0.45, 1.6, 0.06), (0.95, y, PZ + 0.45), wood)
        b.box((0.06, 1.6, 0.4), (1.2, y, PZ + 0.7), wood)
        for dy in (-0.7, 0.7):
            b.box((0.4, 0.06, 0.42), (0.95, y + dy, PZ + 0.21), steel)
    for y in (-5.4, 5.4):
        b.cylinder(0.28, 0.85, (1.0, y, PZ + 0.425), wood, segs=12)
        b.cylinder(0.29, 0.05, (1.0, y, PZ + 0.6), steel, segs=12)
    b.finish(parent=root)


BUILDERS = [
    ("lamp.glb", build_lamp, 2000),
    ("rail_segment.glb", build_rail_segment, 1000),
    ("palm.glb", build_palm, 3000),
    ("fir.glb", build_fir, 1500),
    ("fir_snow.glb", build_fir_snow, 2000),
    ("cactus.glb", build_cactus, 3000),
    ("rock.glb", build_rock, 1500),
    ("station.glb", build_station, 4000),
]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
