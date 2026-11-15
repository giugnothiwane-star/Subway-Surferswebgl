"""
MNNROW - background buildings, 3 variants.

Outputs:
  building_a.glb  ~9.6 m  brick shop-house (3 floors), shop front + awning,
                  rooftop AC box
  building_b.glb  ~18.6 m plaster apartment block (6 floors), balconies,
                  rooftop water tank on legs
  building_c.glb  30.0 m  concrete/glass tower (9 floors), pilasters,
                  two AC boxes + antenna mast with red beacon

All variants: window grids on the four facades (separate window frame and
glass materials: extruded frame ring + recessed glass pane), roof ledge
(parapet), base plinth. Some panes use a warm emissive "lit" glass.
Origin = base center. X/Y = footprint, Z up.

Run:  blender -b -P blender/generate_buildings.py -- --out blender/exports
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402

PI = math.pi


def common():
    return dict(
        glass=C.make_material("MAT_Bldg_Window_Glass", "#1d3550", 0.4, 0.08),
        lit=C.make_material("MAT_Bldg_Window_Lit", "#ffd58a", 0.0, 0.3,
                            emission="#ffc870", emission_strength=1.2),
        frame=C.make_material("MAT_Bldg_Window_Frame", "#e8e4dc", 0.1, 0.5),
        roof=C.make_material("MAT_Bldg_Roof", "#4a4d52", 0.0, 0.9),
        metal=C.make_material("MAT_Bldg_Metal", "#a3a9b1", 0.85, 0.4),
        dark=C.make_material("MAT_Bldg_Dark", "#25272b", 0.3, 0.7),
    )


def facades(w, d):
    """(center offset, outward normal, facade width) for the 4 sides."""
    return [((w / 2, 0), (1, 0, 0), d), ((-w / 2, 0), (-1, 0, 0), d),
            ((0, d / 2), (0, 1, 0), w), ((0, -d / 2), (0, -1, 0), w)]


def window_grid(b, w, d, floors, floor_h, z_start, cols, win_w, win_h, M, frame_mat,
                rng, lit_ratio=0.25, skip=None, border=0.08, depth=0.1):
    for (ox, oy), n, fw in facades(w, d):
        ncol = cols if isinstance(cols, int) else cols[0 if abs(n[0]) > 0 else 1]
        pitch = fw / ncol
        for f in range(floors):
            z = z_start + f * floor_h + floor_h * 0.55
            for c in range(ncol):
                u = -fw / 2 + pitch * (c + 0.5)
                if skip and skip(n, f, c):
                    continue
                # tangent u direction = up x n
                tx, ty = -n[1], n[0]
                origin = (ox + tx * u, oy + ty * u, z)
                m = C.side_matrix(origin, n)
                g = M['lit'] if rng.random() < lit_ratio else M['glass']
                b.frame_ring(win_w, win_h, border, depth, m, frame_mat, g, glass_offset=0.02)


def roof_ledge(b, w, d, z, mat, h=0.6, t=0.3, over=0.15):
    """Parapet ring (4 boxes) sticking out `over` from the walls."""
    W, D = w + 2 * over, d + 2 * over
    b.box((W, t, h), (0, D / 2 - t / 2, z + h / 2), mat)
    b.box((W, t, h), (0, -D / 2 + t / 2, z + h / 2), mat)
    b.box((t, D - 2 * t, h), (W / 2 - t / 2, 0, z + h / 2), mat)
    b.box((t, D - 2 * t, h), (-W / 2 + t / 2, 0, z + h / 2), mat)
    b.box((W, D, 0.12), (0, 0, z - 0.06), mat)                     # cornice slab


def ac_box(b, x, y, z, M):
    b.box((1.4, 1.0, 0.8), (x, y, z + 0.4), M['metal'], bevel=0.04, segs=1)
    b.cylinder(0.32, 0.03, (x, y, z + 0.81), M['dark'], segs=14)
    b.box((0.06, 0.06, 0.4), (x + 0.6, y + 0.6, z + 0.2), M['dark'])          # pipe


def water_tank(b, x, y, z, M, wood):
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((0.12, 0.12, 1.4), (x + sx * 0.7, y + sy * 0.7, z + 0.7), M['dark'])
    b.box((1.7, 1.7, 0.1), (x, y, z + 1.45), M['dark'])
    b.cylinder(0.95, 1.8, (x, y, z + 2.4), wood, segs=16)
    for k in range(3):
        b.cylinder(0.97, 0.05, (x, y, z + 1.8 + k * 0.6), M['dark'], segs=16)
    b.cylinder(1.02, 0.6, (x, y, z + 3.6), M['roof'], segs=16, r2=0.05)      # cone roof


# --------------------------------------------------------------------------

def build_a():
    M = common()
    rng = random.Random(11)
    brick = C.make_material("MAT_Bldg_A_Brick", "#9c4a36", 0.0, 0.85)
    trim = C.make_material("MAT_Bldg_A_Trim", "#e9dcc4", 0.0, 0.6)
    awning = C.make_material("MAT_Bldg_A_Awning", "#1f8a70", 0.0, 0.6)
    sign = C.make_material("MAT_Bldg_A_Sign", "#ff5a36", 0.0, 0.4,
                           emission="#ff6a3d", emission_strength=1.5)
    root = C.make_root("Building_A")
    w, d, fh, floors = 8.0, 8.0, 3.0, 3
    H = fh * floors
    b = C.Builder("Building_A_Mesh")
    b.box((w + 0.2, d + 0.2, 0.3), (0, 0, 0.15), trim)                       # plinth
    b.box((w, d, H), (0, 0, H / 2), brick)
    for z in (fh, 2 * fh):                                                  # floor bands
        b.box((w + 0.12, d + 0.12, 0.15), (0, 0, z), trim)
    window_grid(b, w, d, floors - 1, fh, fh, 3, 1.2, 1.5, M, M['frame'], rng)
    # ground floor shop fronts on +-X (track sides), doors on +-Y
    for sx in (-1, 1):
        m = C.side_matrix((sx * w / 2, 0, 1.45), (sx, 0, 0))
        b.frame_ring(5.6, 2.3, 0.12, 0.12, m, M['dark'], M['lit'], glass_offset=0.03)
        # local frame of m: x along facade, y up, z outward
        b.box((6.4, 0.08, 1.2), (0, 1.35, 0.6), awning, rot=(0.35, 0, 0), matrix=m)
        b.box((3.0, 0.5, 0.08), (0, 2.0, 0.04), sign, matrix=m)
    for sy in (-1, 1):
        m = C.side_matrix((0, sy * d / 2, 1.2), (0, sy, 0))
        b.frame_ring(1.4, 2.4, 0.1, 0.12, m, M['frame'], M['dark'], glass_offset=0.02)
        b.frame_ring(1.8, 1.4, 0.08, 0.1, C.side_matrix((-2.5, sy * d / 2, 1.5), (0, sy, 0)),
                     M['frame'], M['glass'], glass_offset=0.02)
        b.frame_ring(1.8, 1.4, 0.08, 0.1, C.side_matrix((2.5, sy * d / 2, 1.5), (0, sy, 0)),
                     M['frame'], M['glass'], glass_offset=0.02)
    roof_ledge(b, w, d, H, trim, h=0.5)
    b.box((w - 0.2, d - 0.2, 0.05), (0, 0, H + 0.02), M['roof'])
    ac_box(b, 1.5, -1.0, H, M)
    b.cylinder(0.12, 1.0, (-2.5, 2.0, H + 0.5), M['metal'], segs=8)          # vent pipe
    b.finish(parent=root)


def build_b():
    M = common()
    rng = random.Random(23)
    plaster = C.make_material("MAT_Bldg_B_Plaster", "#d9c7a3", 0.0, 0.8)
    trim = C.make_material("MAT_Bldg_B_Trim", "#8a6f52", 0.0, 0.7)
    wood = C.make_material("MAT_Bldg_B_TankWood", "#7a5235", 0.0, 0.8)
    rail = C.make_material("MAT_Bldg_B_Railing", "#2f3338", 0.6, 0.5)
    root = C.make_root("Building_B")
    w, d, fh, floors = 10.0, 9.0, 3.0, 6
    H = fh * floors
    b = C.Builder("Building_B_Mesh")
    b.box((w + 0.3, d + 0.3, 0.6), (0, 0, 0.3), trim)
    b.box((w, d, H), (0, 0, H / 2), plaster)
    window_grid(b, w, d, floors, fh, 0.0, (4, 4), 1.3, 1.6, M, M['frame'], rng,
                skip=lambda n, f, c: f == 0 and abs(n[1]) > 0 and c in (1, 2))
    for sy in (-1, 1):                                                      # entrances
        m = C.side_matrix((0, sy * d / 2, 1.3), (0, sy, 0))
        b.frame_ring(2.2, 2.6, 0.12, 0.15, m, trim, M['dark'], glass_offset=0.03)
        b.box((3.0, 1.0, 0.12), (0, 1.55, 0.5), trim, matrix=m)
    # balconies on the track-facing sides (+-X), floors 1..5
    for sx in (-1, 1):
        for f in range(1, floors):
            z = f * fh
            for yc in (-1.125, 1.125):
                b.box((0.9, 1.9, 0.15), (sx * (w / 2 + 0.45), yc, z + 0.05), trim)
                b.box((0.05, 1.9, 0.9), (sx * (w / 2 + 0.88), yc, z + 0.55), rail)
                for ey in (-0.93, 0.93):
                    b.box((0.9, 0.05, 0.9), (sx * (w / 2 + 0.45), yc + ey, z + 0.55), rail)
    roof_ledge(b, w, d, H, trim, h=0.6)
    b.box((w - 0.2, d - 0.2, 0.05), (0, 0, H + 0.02), M['roof'])
    water_tank(b, -2.5, 1.5, H, M, wood)
    ac_box(b, 2.8, -2.0, H, M)
    b.finish(parent=root)


def build_c():
    M = common()
    rng = random.Random(37)
    concrete = C.make_material("MAT_Bldg_C_Concrete", "#b7bcc2", 0.0, 0.75)
    accent = C.make_material("MAT_Bldg_C_Accent", "#3f6f9e", 0.4, 0.35)
    beacon = C.make_material("MAT_Bldg_C_Beacon", "#ff2020", 0.0, 0.3,
                             emission="#ff1010", emission_strength=4.0)
    root = C.make_root("Building_C")
    w, d, fh, floors = 12.0, 12.0, 3.0, 9
    H = fh * floors + 0.6                                                   # 27.6
    b = C.Builder("Building_C_Mesh")
    b.box((w + 0.4, d + 0.4, 0.6), (0, 0, 0.3), M['dark'])
    b.box((w, d, H), (0, 0, H / 2), concrete)
    # lobby glazing (ground floor) + upper window grid
    for (ox, oy), n, fw in facades(w, d):
        m = C.side_matrix((ox, oy, 1.7), n)
        b.frame_ring(fw - 1.6, 2.8, 0.15, 0.15, m, M['dark'], M['lit'], glass_offset=0.03)
    window_grid(b, w, d, floors - 1, fh, fh, 4, 2.2, 1.9, M, M['dark'], rng,
                lit_ratio=0.3, border=0.1, depth=0.12)
    # vertical pilasters between window columns + floor bands
    for (ox, oy), n, fw in facades(w, d):
        tx, ty = -n[1], n[0]
        for k in range(5):
            u = -fw / 2 + k * fw / 4
            x, y = ox + tx * u + n[0] * 0.12, oy + ty * u + n[1] * 0.12
            sz = (0.35, 0.24, H - fh) if abs(n[1]) > 0 else (0.24, 0.35, H - fh)
            b.box(sz, (x, y, fh + (H - fh) / 2), accent)
    roof_ledge(b, w, d, H, concrete, h=0.6, over=0.25)
    b.box((w - 0.2, d - 0.2, 0.05), (0, 0, H + 0.02), M['roof'])
    ac_box(b, 2.5, -2.5, H, M)
    ac_box(b, -2.5, -2.5, H, M)
    b.box((3.0, 3.0, 1.6), (-1.5, 3.0, H + 0.8), concrete)                 # stair/lift housing
    b.cylinder(0.08, 30.0 - H - 0.25, (3.5, 3.5, H + (30.0 - H - 0.25) / 2), M['metal'], segs=8)
    b.sphere(0.13, (3.5, 3.5, 30.0 - 0.13), beacon, segs=10, rings=6)       # tip at 30.0
    b.finish(parent=root)


BUILDERS = [
    ("building_a.glb", build_a, 6000),
    ("building_b.glb", build_b, 8000),
    ("building_c.glb", build_c, 8000),
]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
