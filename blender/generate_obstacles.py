"""
MNNROW - track obstacles.

Outputs:
  barrier_low.glb   width 2.0, height 1.0  (jump over)
                    red/white diagonal-striped panel on two legs
  barrier_high.glb  width 2.2, height 2.6  (roll under)
                    striped bar from z 1.05 to 1.6, open gap below 1.05
  ramp.glb          length 6 (Y), width 2.3, rises from z 0 (at -Y) to 3.0 (at +Y)

Frame: X = across the lane, Y = along the track (player runs towards +Y,
i.e. glTF -Z), Z up. Origin = base center.

Run:  blender -b -P blender/generate_obstacles.py -- --out blender/exports
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402

PI = math.pi


def mats():
    return dict(
        red=C.make_material("MAT_Barrier_Red", "#d81e2a", 0.1, 0.45),
        white=C.make_material("MAT_Barrier_White", "#f2f2ee", 0.0, 0.5),
        post=C.make_material("MAT_Barrier_Post", "#3b3f45", 0.7, 0.45),
        foot=C.make_material("MAT_Barrier_Foot", "#24262a", 0.3, 0.7),
        lamp=C.make_material("MAT_Barrier_Lamp", "#ffb300", 0.0, 0.3,
                             emission="#ffa000", emission_strength=2.5),
    )


def striped_panel(b, x0, x1, z0, z1, thick, M, band=0.22):
    """Diagonal red/white stripes clipped to the rectangle [x0,x1]x[z0,z1].
    Each stripe is its own prism, extruded along Y (thickness)."""
    rot = C.xform((0, 0, 0), (PI / 2, 0, 0))       # local XY -> world XZ
    h = z1 - z0
    xs = x0 - h - band
    k = 0
    while xs < x1:
        poly = [(xs, z0), (xs + band, z0), (xs + band + h, z1), (xs + h, z1)]
        clipped = C.clip_polygon(poly, x0, x1, z0, z1)
        if len(clipped) >= 3:
            b.prism(clipped, thick, M['red'] if k % 2 == 0 else M['white'], matrix=rot)
        xs += band
        k += 1


def build_barrier_low():
    M = mats()
    root = C.make_root("Barrier_Low")
    b = C.Builder("Barrier_Low_Mesh")
    striped_panel(b, -1.0, 1.0, 0.55, 0.95, 0.08, M)
    b.box((2.0, 0.1, 0.05), (0, 0, 0.975), M['post'])                 # top cap -> 1.0
    b.box((2.0, 0.1, 0.04), (0, 0, 0.53), M['post'])                  # bottom rail
    for sx in (-1, 1):
        b.box((0.1, 0.1, 0.95), (sx * 0.8, 0, 0.475), M['post'])       # legs
        b.box((0.16, 0.7, 0.06), (sx * 0.8, 0, 0.03), M['foot'], bevel=0.02, segs=1)
        b.box((0.05, 0.1, 0.1), (sx * 0.975, 0, 0.75), M['lamp'])        # end reflectors
    b.finish(parent=root)


def build_barrier_high():
    M = mats()
    root = C.make_root("Barrier_High")
    b = C.Builder("Barrier_High_Mesh")
    striped_panel(b, -1.0, 1.0, 1.05, 1.6, 0.09, M, band=0.25)        # bar 1.05 .. 1.6
    for sx in (-1, 1):
        b.box((0.1, 0.12, 2.6), (sx * 1.05, 0, 1.3), M['post'])       # posts, outer x = 1.1
        b.box((0.1, 0.8, 0.06), (sx * 1.05, 0, 0.03), M['foot'], bevel=0.02, segs=1)
        b.cylinder(0.07, 0.1, (sx * 0.55, 0.12, 2.25), M['lamp'], segs=12)  # hanging lamps
        b.cylinder(0.012, 0.2, (sx * 0.55, 0.12, 2.4), M['post'], segs=6)
    b.box((2.2, 0.14, 0.12), (0, 0, 2.54), M['post'])                 # top beam -> 2.6
    b.box((1.6, 0.04, 0.22), (0, -0.09, 2.49), M['red'])               # sign plate
    b.box((1.3, 0.05, 0.08), (0, -0.1, 2.49), M['white'])
    b.finish(parent=root)


def build_ramp():
    M = mats()
    deck = C.make_material("MAT_Ramp_Deck", "#6b7078", 0.75, 0.45)
    frame = C.make_material("MAT_Ramp_Frame", "#3a3e44", 0.7, 0.5)
    yellow = C.make_material("MAT_Ramp_Hazard", "#f5c400", 0.1, 0.45)
    black = C.make_material("MAT_Ramp_HazardDark", "#151515", 0.1, 0.6)
    root = C.make_root("Ramp")
    LEN, H, WID = 6.0, 3.0, 2.3
    hy = LEN / 2
    slope = math.atan2(H, LEN)
    side = C.xform((0, 0, 0), (PI / 2, 0, PI / 2))   # local XY -> world (Y, Z), extrude X

    b = C.Builder("Ramp_Mesh")
    # deck slab (top surface goes exactly from (y=-3, z=0) to (y=3, z=3))
    t = 0.12
    b.prism([(-hy, 0.0), (hy, H - 0.015), (hy, H - t / math.cos(slope)), (-hy + t / math.sin(slope), 0.0)],
            WID, deck, matrix=side)
    # side truss panels (thin triangles) + hazard edge strips
    for sx in (-1, 1):
        m = C.xform((sx * (WID / 2 - 0.03), 0, 0), (PI / 2, 0, PI / 2))
        b.prism([(-hy + 0.4, 0.0), (hy, 0.0), (hy, H - 0.15)], 0.06, frame, matrix=m)
        n_seg = 10
        for k in range(n_seg):
            y0 = -hy + LEN * k / n_seg
            y1 = -hy + LEN * (k + 1) / n_seg
            # the deck tops out at H - 0.015; the hazard strips sit 3-15 mm
            # above it, so they end exactly at z = 3.0
            z0, z1 = (H - 0.015) * k / n_seg, (H - 0.015) * (k + 1) / n_seg
            strip = [(y0, z0 + 0.003), (y1, z1 + 0.003), (y1, z1 + 0.015), (y0, z0 + 0.015)]
            mm = C.xform((sx * (WID / 2 - 0.09), 0, 0), (PI / 2, 0, PI / 2))
            b.prism(strip, 0.18, yellow if k % 2 == 0 else black, matrix=mm)
    # grip cleats across the slope
    for k in range(1, 12):
        y = -hy + k * LEN / 12
        z = H * (y + hy) / LEN
        b.box((WID - 0.4, 0.06, 0.03), (0, y, z + 0.012), frame, rot=(slope, 0, 0))
    # back posts + base rails + cross braces
    for sx in (-1, 1):
        b.box((0.12, 0.12, H - 0.15), (sx * 0.9, hy - 0.08, (H - 0.15) / 2), frame)
        b.box((0.12, LEN, 0.08), (sx * 0.9, 0, 0.04), frame)
    b.box((1.9, 0.1, 0.1), (0, hy - 0.08, 1.4), frame)
    b.box((1.9, 0.1, 0.1), (0, 0.0, 0.7), frame)
    b.finish(parent=root)


BUILDERS = [
    ("barrier_low.glb", build_barrier_low, 2000),
    ("barrier_high.glb", build_barrier_high, 2000),
    ("ramp.glb", build_ramp, 3000),
]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
