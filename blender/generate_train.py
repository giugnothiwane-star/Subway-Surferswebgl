"""
MNNROW - procedural rail vehicles.

Outputs: train_urban.glb, train_modern.glb, train_freight_loco.glb,
         wagon_container.glb, wagon_tank.glb

Run:  blender -b -P blender/generate_train.py -- --out blender/exports
 or:  python blender/generate_train.py --out blender/exports   (pip bpy)

Frame: X = width (2.3 m), Y = length (14 m, front/cab at -Y), Z = up.
Origin = base center; z = 0 is the rail top (wheel contact).
Max height 3.0 m (roof equipment included).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mnnrow_common as C  # noqa: E402

PI = math.pi
L = 14.0
HL = L / 2.0
W = 2.3
HW = W / 2.0
WHEEL_R = 0.36
GAUGE_HALF = 0.7175  # standard gauge 1.435 m


# --------------------------------------------------------------------------
# shared parts
# --------------------------------------------------------------------------

def common_mats():
    return dict(
        wheel=C.make_material("MAT_Train_Wheel", "#4a4e55", 0.9, 0.35),
        bogie=C.make_material("MAT_Train_Bogie", "#24262a", 0.6, 0.55),
        under=C.make_material("MAT_Train_Underframe", "#2e3034", 0.4, 0.7),
        glass=C.make_material("MAT_Train_Glass", "#16304a", 0.2, 0.06),
        rubber=C.make_material("MAT_Train_Rubber", "#101114", 0.0, 0.8),
        head=C.make_material("MAT_Train_Headlight", "#fff6d8", 0.0, 0.2,
                             emission="#fff2cc", emission_strength=3.0),
        tail=C.make_material("MAT_Train_Taillight", "#ff2a1a", 0.0, 0.3,
                             emission="#ff1a0a", emission_strength=2.5),
    )


def add_bogie(parent, name, y, M):
    """Two-axle bogie, 4 wheels with flanges, side frames, bolster, springs."""
    b = C.Builder(name)
    ry = (0, PI / 2, 0)
    for ay in (-1.0, 1.0):
        for sx in (-1, 1):
            x = sx * GAUGE_HALF
            b.cylinder(WHEEL_R, 0.11, (x, y + ay, WHEEL_R), M['wheel'], rot=ry, segs=18)
            b.cylinder(WHEEL_R + 0.035, 0.025, (x - sx * 0.065, y + ay, WHEEL_R), M['wheel'],
                       rot=ry, segs=18)                                   # flange (inner)
            b.cylinder(0.12, 0.03, (x + sx * 0.065, y + ay, WHEEL_R), M['bogie'], rot=ry, segs=10)
            b.box((0.18, 0.32, 0.24), (sx * 0.96, y + ay, WHEEL_R), M['bogie'])  # axle box
        b.cylinder(0.07, 1.7, (0, y + ay, WHEEL_R), M['bogie'], rot=ry, segs=8)    # axle
    for sx in (-1, 1):
        b.box((0.12, 2.9, 0.26), (sx * 0.96, y, 0.46), M['bogie'], bevel=0.04, segs=1)
        for sy in (-1, 1):
            b.cylinder(0.08, 0.2, (sx * 0.96, y + sy * 0.45, 0.68), M['under'], segs=8)
    b.box((1.9, 0.5, 0.2), (0, y, 0.66), M['bogie'])                          # bolster
    b.cylinder(0.22, 0.12, (0, y, 0.78), M['under'], segs=10)                 # pivot
    return b.finish(parent=parent)


def coupler(b, y, sign, M, z=0.72):
    """Coupler whose head ends exactly at y (keeps the 14 m length)."""
    b.box((0.22, 0.5, 0.2), (0, y - sign * 0.35, z), M['bogie'])
    b.box((0.34, 0.14, 0.3), (0, y - sign * 0.07, z), M['bogie'], bevel=0.03, segs=1)


def top_long_edges(e):
    a, c = e.verts[0].co, e.verts[1].co
    return a.z > 0 and c.z > 0 and abs(a.y - c.y) > 0.5


def right(y, z, d=0.0):
    return C.side_matrix((HW + d, y, z), (1, 0, 0))


def left(y, z, d=0.0):
    return C.side_matrix((-HW - d, y, z), (-1, 0, 0))


def front(x, z, y=-HL):
    return C.side_matrix((x, y, z), (0, -1, 0))


def back(x, z, y=HL):
    return C.side_matrix((x, y, z), (0, 1, 0))


# --------------------------------------------------------------------------
# Urban metro car
# --------------------------------------------------------------------------

def build_urban():
    M = common_mats()
    metal = C.make_material("MAT_Train_Metal", "#c9ced6", 0.85, 0.3)
    stripe = C.make_material("MAT_Train_Stripe", "#00b3a4", 0.3, 0.35)
    accent = C.make_material("MAT_Train_Accent", "#ff7a1a", 0.2, 0.4)
    door = C.make_material("MAT_Train_Door", "#9aa1ab", 0.8, 0.36)
    roof = C.make_material("MAT_Train_Roof", "#7d838c", 0.6, 0.5)
    display = C.make_material("MAT_Train_Display", "#ffb020", 0.0, 0.4,
                              emission="#ffaa10", emission_strength=1.5)

    root = C.make_root("Train_Urban")
    Z0, ZT = 0.82, 2.85
    BL = HL - 0.08          # shell half-length; bumpers end exactly at +-7.0

    body = C.Builder("Train_Body")
    body.box((W, 2 * BL, ZT - Z0), (0, 0, (Z0 + ZT) / 2), metal, bevel=0.38, segs=4,
             bevel_filter=top_long_edges)
    body.box((W - 0.78, L - 0.6, 0.016), (0, 0, ZT + 0.004), roof)            # roof plate

    # side windows (separate glass material + rubber frame)
    win_y = [-6.2, -2.95, -1.35, 1.35, 2.95, 5.85]
    win_w = [0.8, 1.2, 1.2, 1.2, 1.2, 1.2]
    doors_y = [-4.3, 0.0, 4.3]
    for side in (right, left):
        for y, w in zip(win_y, win_w):
            m = side(y, 1.95)
            body.box((w + 0.1, 0.9, 0.02), (0, 0, 0), M['rubber'], matrix=m)
            body.box((w, 0.8, 0.05), (0, 0, 0), M['glass'], matrix=m)
        for y in doors_y:
            m = side(y, 1.67)
            body.frame_ring(1.42, 1.62, 0.06, 0.03, m, M['rubber'])          # inset frame
            for sx in (-1, 1):
                body.box((0.64, 1.5, 0.012), (sx * 0.33, 0, 0), door, matrix=m)
                body.box((0.42, 0.72, 0.03), (sx * 0.33, 0.25, 0), M['glass'], matrix=m)
            body.box((0.02, 1.5, 0.022), (0, 0, 0), M['rubber'], matrix=m)   # seam
        # colored stripe + accent line (doors cover them)
        body.box((2 * BL - 0.3, 0.2, 0.02), (0, 0, 0), stripe, matrix=side(0, 1.3))
        body.box((2 * BL - 0.3, 0.05, 0.02), (0, 0, 0), accent, matrix=side(0, 1.46))

    # front: windshield, wipers, display, headlights, bumper
    wm = front(0, 2.05, -BL)
    body.frame_ring(2.0, 0.98, 0.08, 0.035, wm, M['rubber'], M['glass'], glass_offset=0.012)
    for px in (-0.5, 0.28):
        body.cylinder(0.03, 0.03, (px, -0.42, 0.04), M['rubber'], matrix=wm, segs=8)
        ang = math.radians(68)
        ln = 0.62
        cx, cy = px + math.cos(ang) * ln / 2, -0.42 + math.sin(ang) * ln / 2
        body.box((ln, 0.025, 0.018), (cx, cy, 0.04), M['rubber'], rot=(0, 0, ang), matrix=wm)
        body.box((0.55, 0.018, 0.02), (cx - 0.03, cy + 0.01, 0.055), M['rubber'],
                 rot=(0, 0, ang + 0.05), matrix=wm)
    body.box((1.25, 0.18, 0.03), (0, 0, 0), display, matrix=front(0, 2.66, -BL))
    body.box((W - 0.2, 0.2, 0.02), (0, 0, 0), stripe, matrix=front(0, 1.3, -BL))
    for sx in (-1, 1):
        hm = front(sx * 0.68, 1.12, -BL)
        body.box((0.55, 0.26, 0.04), (0, 0, 0), M['rubber'], matrix=hm)
        body.cylinder(0.1, 0.06, (sx * 0.1, 0, 0.02), M['head'], matrix=hm, segs=14)
        body.cylinder(0.06, 0.06, (-sx * 0.15, 0, 0.02), M['head'], matrix=hm, segs=10)
    body.box((W - 0.25, 0.16, 0.14), (0, -HL + 0.08, 0.9), M['bogie'], bevel=0.03, segs=1)

    # rear: window, tail lights
    rm = back(0, 2.0, BL)
    body.frame_ring(1.3, 0.85, 0.07, 0.03, rm, M['rubber'], M['glass'])
    body.box((W - 0.2, 0.2, 0.02), (0, 0, 0), stripe, matrix=back(0, 1.3, BL))
    for sx in (-1, 1):
        tm = back(sx * 0.72, 1.12, BL)
        body.box((0.36, 0.24, 0.04), (0, 0, 0), M['rubber'], matrix=tm)
        body.cylinder(0.085, 0.06, (0, 0, 0.02), M['tail'], matrix=tm, segs=12)
    body.box((W - 0.25, 0.16, 0.14), (0, HL - 0.08, 0.9), M['bogie'], bevel=0.03, segs=1)
    body.finish(parent=root)

    # underframe
    uf = C.Builder("Train_Underframe")
    uf.box((2.15, 6.6, 0.24), (0, 0, 0.72), M['under'])
    for y, lx in ((-2.0, 1.2), (0.4, 1.6), (2.4, 0.9)):
        uf.box((1.5, lx, 0.18), (0, y, 0.52), M['bogie'])
    coupler(uf, -HL, -1, M)
    coupler(uf, HL, 1, M)
    uf.finish(parent=root)

    # roof: AC units with fan grilles + vent slats
    rf = C.Builder("Train_Roof_Equipment")
    for y in (-3.6, 3.6):
        rf.box((1.5, 2.6, 0.13), (0, y, ZT + 0.065), roof, bevel=0.04, segs=1)
        for dy in (-0.65, 0.65):
            rf.cylinder(0.32, 0.02, (0, y + dy, ZT + 0.14), M['rubber'], segs=16)
            rf.cylinder(0.08, 0.02, (0, y + dy, ZT + 0.14), roof, segs=8)
    for k in range(7):
        rf.box((0.9, 0.09, 0.05), (0, -1.6 + k * 0.53, ZT + 0.03), M['under'])
    rf.finish(parent=root)

    add_bogie(root, "Train_Bogie_Front", -4.9, M)
    add_bogie(root, "Train_Bogie_Rear", 4.9, M)


# --------------------------------------------------------------------------
# Modern / high-speed car (lofted aerodynamic nose)
# --------------------------------------------------------------------------

HALF_PROFILE = [(0.0, 0.80), (0.82, 0.80), (1.06, 0.86), (1.15, 1.00), (1.15, 1.12),
                (1.15, 1.62), (1.14, 1.74), (1.08, 2.36), (1.00, 2.55), (0.82, 2.73),
                (0.46, 2.85), (0.0, 2.90)]
# half-profile segment ids: 3 = accent light band, 6 = panoramic window band
SEG_ACCENT, SEG_WINDOW = 3, 6


def full_profile():
    pts = list(HALF_PROFILE) + [(-x, z) for (x, z) in reversed(HALF_PROFILE[1:-1])]
    nh = len(HALF_PROFILE) - 1           # 11 half segments

    def half_seg(j):
        return j if j < nh else (2 * nh - 1 - j)
    return pts, half_seg


def build_modern():
    M = common_mats()
    body_m = C.make_material("MAT_Train_ModernBody", "#eef1f5", 0.55, 0.22)
    stripe = C.make_material("MAT_Train_ModernStripe", "#1b3fa8", 0.4, 0.3)
    led = C.make_material("MAT_Train_LED", "#ffffff", 0.0, 0.2,
                          emission="#e8f6ff", emission_strength=4.0)
    accent = C.make_material("MAT_Train_AccentLight", "#13e0ff", 0.0, 0.3,
                             emission="#13e0ff", emission_strength=2.5)
    door = C.make_material("MAT_Train_ModernDoor", "#cfd5dd", 0.6, 0.3)

    root = C.make_root("Train_Modern")
    prof, half_seg = full_profile()

    # sections: (y, sx, sz, zb, region, t)
    secs = []
    N = 14
    for k in range(N, -1, -1):                      # nose tip -> body
        t = math.sin(0.5 * PI * k / N)
        sx = 0.10 + 0.90 * math.sqrt(max(0.0, 1.0 - t ** 2.4))
        sz = 0.16 + 0.84 * (1.0 - t ** 1.35)
        secs.append((-4.2 - 2.8 * t, sx, sz, 0.80 + 0.22 * t ** 3, 'nose', t))
    for y in (-1.0, 2.5, 6.2):
        secs.append((y, 1.0, 1.0, 0.80, 'body', 0.0))
    for k in range(1, 5):
        t = k / 4.0
        secs.append((6.2 + 0.8 * t, 1.0 - 0.1 * t ** 2, 1.0 - 0.08 * t ** 2, 0.80 + 0.03 * t, 'tail', t))

    rings = []
    for (y, sx, sz, zb, _, _) in secs:
        rings.append([(x * sx, y, zb + (z - 0.80) * sz) for (x, z) in prof])

    palette = [body_m, M['glass'], led, accent, M['tail'], stripe, M['under']]
    BODY, GLASS, LED, ACC, TAIL, STRIPE, UNDER = range(7)

    def mat_of(i, j):
        a, b = secs[i], secs[i + 1]
        hs = half_seg(j)
        region = a[4] if a[4] == b[4] else ('nose' if 'nose' in (a[4], b[4]) else a[4])
        tm = (a[5] + b[5]) / 2.0 if a[4] == b[4] else 0.0
        if hs in (0, 1):
            return UNDER
        if hs == SEG_ACCENT:
            if region == 'nose' and tm > 0.42:
                return LED
            if region == 'tail' and i >= len(secs) - 3:
                return TAIL
            return ACC
        if hs == 2:
            return STRIPE
        if hs == SEG_WINDOW:
            return BODY if (region == 'nose' and tm > 0.6) else GLASS
        if hs >= 7 and region == 'nose' and 0.12 < tm < 0.62:
            return GLASS                                       # wraparound windshield
        return BODY

    shell = C.Builder("Train_Body")
    shell.loft(rings, palette, mat_of, cap_mat=BODY, smooth=True)
    # doors (2 per side) + roof fairing + tail-end details
    for sx in (-1, 1):
        for y in (-1.8, 3.6):
            shell.box((0.12, 1.32, 1.55), (sx * 1.10, y, 1.62), M['rubber'])
            shell.box((0.14, 1.2, 1.45), (sx * 1.10, y, 1.62), door)
            shell.box((0.03, 0.5, 0.6), (sx * 1.165, y, 1.95), M['glass'])
            shell.box((0.03, 0.02, 1.45), (sx * 1.172, y, 1.62), M['rubber'])
    shell.box((0.8, 3.0, 0.14), (0, 1.5, 2.93), body_m, bevel=0.05, segs=2)
    shell.box((1.4, 0.04, 0.5), (0, HL - 0.015, 2.0), M['glass'])
    shell.finish(parent=root, auto_smooth=50.0)

    uf = C.Builder("Train_Underframe")
    uf.box((2.1, 7.0, 0.22), (0, 0.6, 0.72), M['under'])
    coupler(uf, HL, 1, M)
    uf.finish(parent=root)

    add_bogie(root, "Train_Bogie_Front", -4.4, M)
    add_bogie(root, "Train_Bogie_Rear", 4.9, M)


# --------------------------------------------------------------------------
# Freight locomotive (hood unit)
# --------------------------------------------------------------------------

def build_loco():
    M = common_mats()
    paint = C.make_material("MAT_Loco_Paint", "#1f3f8f", 0.35, 0.45)
    yellow = C.make_material("MAT_Loco_Yellow", "#f2c230", 0.2, 0.45)
    soot = C.make_material("MAT_Loco_Exhaust", "#1a1a1a", 0.5, 0.8)
    grille = C.make_material("MAT_Loco_Grille", "#3a3f46", 0.7, 0.5)
    number = C.make_material("MAT_Loco_NumberBoard", "#ffffff", 0.0, 0.4,
                             emission="#fff8e0", emission_strength=1.2)

    root = C.make_root("Train_Freight_Loco")
    DECK_Z = 1.1

    fr = C.Builder("Loco_Frame")
    fr.box((W, L, 0.25), (0, 0, DECK_Z - 0.125), M['under'])
    for sx in (-1, 1):
        fr.box((0.02, L - 0.1, 0.1), (sx * (HW + 0.005), 0, DECK_Z - 0.12), yellow)
        for sy in (-1, 1):                                       # corner steps
            fr.box((0.42, 0.06, 0.5), (sx * 0.95, sy * (HL - 0.35), 0.75), yellow)
    fr.box((1.9, 4.8, 0.42), (0, 0, 0.64), M['under'], bevel=0.12, segs=3)  # fuel tank
    for sy in (-1, 1):
        fr.box((2.2, 0.25, 0.35), (0, sy * (HL - 0.125), 0.78), M['bogie'])  # pilot
        coupler(fr, sy * HL, sy, M, z=0.68)
    fr.finish(parent=root)

    bd = C.Builder("Loco_Body")
    # short hood (front), cab, long hood
    bd.box((1.7, 0.9, 0.95), (0, -6.45, DECK_Z + 0.475), paint, bevel=0.1, segs=2)
    bd.box((W, 2.2, 1.75), (0, -4.9, DECK_Z + 0.875), paint)
    bd.box((W, 2.3, 0.15), (0, -4.9, 2.925), paint, bevel=0.06, segs=2)
    bd.box((1.7, 10.5, 1.45), (0, 1.45, DECK_Z + 0.725), paint, bevel=0.08, segs=2)
    # cab glazing
    for sx in (-1, 1):
        bd.frame_ring(0.85, 0.6, 0.05, 0.03, C.side_matrix((sx * 0.5, -6.0, 2.38), (0, -1, 0)),
                      M['rubber'], M['glass'])
        bd.frame_ring(0.8, 0.6, 0.05, 0.03, C.side_matrix((sx * HW, -5.3, 2.38), (sx, 0, 0)),
                      M['rubber'], M['glass'])
        bd.frame_ring(0.6, 1.3, 0.04, 0.02, C.side_matrix((sx * HW, -4.3, 1.85), (sx, 0, 0)),
                      M['rubber'])                                  # cab door
        bd.box((0.02, 0.6, 0.45), (sx * (HW + 0.01), -4.3, 2.2), M['glass'])
        # yellow stripes
        bd.box((0.02, 10.4, 0.12), (sx * 0.855, 1.45, 1.35), yellow)
        bd.box((0.02, 2.1, 0.12), (sx * (HW + 0.005), -4.9, 1.35), yellow)
        # louver panels on the long hood
        for py in (-1.8, 0.8, 3.4):
            m = C.side_matrix((sx * 0.85, py, 1.95), (sx, 0, 0))
            for k in range(6):
                bd.box((1.3, 0.06, 0.035), (0, -0.3 + k * 0.12, 0.01), grille,
                       rot=(0.5, 0, 0), matrix=m)
    bd.box((1.6, 0.02, 0.14), (0, -6.0 - 0.005, 1.35), yellow)
    # radiator fans, exhaust stacks, dynamic-brake blister
    for y in (4.6, 5.7):
        bd.cylinder(0.45, 0.05, (0, y, 2.575), grille, segs=16)
        bd.cylinder(0.1, 0.06, (0, y, 2.59), M['rubber'], segs=8)
    for y in (-1.6, -0.9):
        bd.cylinder(0.12, 0.38, (0, y, 2.74), soot, segs=10)
        bd.cylinder(0.08, 0.02, (0, y, 2.93), M['rubber'], segs=8)
    bd.box((1.5, 1.6, 0.2), (0, 1.2, 2.65), paint, bevel=0.06, segs=2)
    # lights
    fm = C.side_matrix((0, -6.9, 1.85), (0, -1, 0))
    for sx in (-1, 1):
        bd.cylinder(0.1, 0.06, (sx * 0.32, 0, 0.02), M['head'], matrix=fm, segs=12)
        bd.cylinder(0.07, 0.08, (sx * 0.95, -HL + 0.04, 1.25), M['head'], rot=(PI / 2, 0, 0), segs=10)
        bd.cylinder(0.08, 0.06, (sx * 0.45, 6.72, 2.25), M['tail'], rot=(PI / 2, 0, 0), segs=10)
    bd.box((0.5, 0.14, 0.03), (0, 0.12, 0.01), number, matrix=fm)
    bd.box((0.7, 0.02, 0.5), (0, 6.71, 1.8), grille)
    bd.finish(parent=root)

    hr = C.Builder("Loco_Handrails")
    rx = 1.08
    for sx in (-1, 1):
        hr.cylinder(0.022, 10.5, (sx * rx, 1.45, 1.95), yellow, rot=(PI / 2, 0, 0), segs=6)
        for k in range(9):
            hr.cylinder(0.018, 0.85, (sx * rx, -3.6 + k * 1.28, DECK_Z + 0.425), yellow, segs=6)
        hr.cylinder(0.022, 0.95, (sx * rx, -6.45, 1.95), yellow, rot=(PI / 2, 0, 0), segs=6)
        for y in (-6.92, -6.0):
            hr.cylinder(0.018, 0.85, (sx * rx, y, DECK_Z + 0.425), yellow, segs=6)
    for y in (-6.95, 6.95):
        hr.cylinder(0.022, 2.16, (0, y, 1.95), yellow, rot=(0, PI / 2, 0), segs=6)
    hr.finish(parent=root)

    add_bogie(root, "Loco_Bogie_Front", -4.6, M)
    add_bogie(root, "Loco_Bogie_Rear", 4.6, M)


# --------------------------------------------------------------------------
# Container wagon (flat car + corrugated ~12 m container)
# --------------------------------------------------------------------------

def corrugated_wall(b, sx, mat, y0, y1, z0, z1, pitch=0.3, x_peak=1.15, x_val=1.11, x_in=1.07):
    pts = []
    n = int(round((y1 - y0) / pitch))
    p = (y1 - y0) / n
    for k in range(n):
        y = y0 + k * p
        pts += [(x_val, y), (x_val, y + p * 0.2), (x_peak, y + p * 0.35), (x_peak, y + p * 0.85)]
    pts += [(x_val, y1), (x_in, y1), (x_in, y0)]
    poly = [(sx * x, y) for (x, y) in pts]
    b.prism(poly, z1 - z0, mat, z0=z0)


def build_container_wagon():
    M = common_mats()
    cont = C.make_material("MAT_Container", "#c4502a", 0.35, 0.55)
    post = C.make_material("MAT_Container_Frame", "#8f3a20", 0.4, 0.5)
    lockbar = C.make_material("MAT_Container_Lockbar", "#b8bcc2", 0.9, 0.35)

    root = C.make_root("Wagon_Container")
    fr = C.Builder("Wagon_Flatcar")
    fr.box((W, L, 0.18), (0, 0, 0.9), M['under'])
    for sx in (-1, 1):
        fr.box((0.12, L, 0.32), (sx * 1.09, 0, 0.78), M['bogie'])
        for sy in (-1, 1):
            fr.box((0.12, 0.12, 0.05), (sx * 1.0, sy * 6.0, 1.01), lockbar)  # twistlocks
    for sy in (-1, 1):
        fr.box((W, 0.2, 0.36), (0, sy * (HL - 0.1), 0.8), M['bogie'])
        coupler(fr, sy * HL, sy, M)
    fr.finish(parent=root)

    c = C.Builder("Container_40ft")
    CL = 12.19
    hy = CL / 2
    zb, zt = 0.99, 3.0
    for sx in (-1, 1):
        corrugated_wall(c, sx, cont, -hy + 0.14, hy - 0.14, zb + 0.09, zt - 0.09)
        for sy in (-1, 1):
            c.box((0.16, 0.16, zt - zb - 0.02), (sx * 1.07, sy * (hy - 0.08), (zb + zt) / 2 - 0.01), post)
        for z in (zb + 0.045, zt - 0.075):
            c.box((0.12, CL, 0.09), (sx * 1.09, 0, z), post)
    c.box((2.18, CL - 0.1, 0.06), (0, 0, 2.95), cont)
    for k in range(20):
        c.box((2.06, 0.1, 0.02), (0, -hy + 0.5 + k * (CL - 1.0) / 19, 2.99), cont)
    # front end wall (ribbed) and rear doors with locking bars
    c.box((2.14, 0.06, zt - zb - 0.2), (0, -hy + 0.03, (zb + zt) / 2), cont)
    for k in range(5):
        c.box((2.0, 0.05, 0.1), (0, -hy - 0.01, zb + 0.35 + k * 0.33), cont)
    c.box((2.14, 0.06, zt - zb - 0.2), (0, hy - 0.03, (zb + zt) / 2), cont)
    c.box((0.02, 0.02, zt - zb - 0.25), (0, hy + 0.005, (zb + zt) / 2), M['rubber'])
    for x in (-0.8, -0.3, 0.3, 0.8):
        c.cylinder(0.025, zt - zb - 0.3, (x, hy + 0.06, (zb + zt) / 2), lockbar, segs=6)
        c.box((0.06, 0.08, 0.2), (x + 0.05, hy + 0.07, 1.6), lockbar)
    c.finish(parent=root)

    add_bogie(root, "Wagon_Bogie_Front", -4.9, M)
    add_bogie(root, "Wagon_Bogie_Rear", 4.9, M)


# --------------------------------------------------------------------------
# Tank wagon
# --------------------------------------------------------------------------

def build_tank_wagon():
    M = common_mats()
    tank = C.make_material("MAT_Tank_Shell", "#2b2f36", 0.55, 0.3)
    band = C.make_material("MAT_Tank_Band", "#18a999", 0.3, 0.35)
    steel = C.make_material("MAT_Tank_Steel", "#9aa0a8", 0.85, 0.4)
    grate = C.make_material("MAT_Tank_Walkway", "#5d636b", 0.7, 0.6)

    root = C.make_root("Wagon_Tank")
    fr = C.Builder("Wagon_Frame")
    fr.box((0.55, L - 0.8, 0.3), (0, 0, 0.85), M['under'])
    for sy in (-1, 1):
        fr.box((W, 0.9, 0.12), (0, sy * 6.55, 0.94), grate)
        fr.box((W, 0.2, 0.34), (0, sy * (HL - 0.1), 0.78), M['bogie'])
        coupler(fr, sy * HL, sy, M)
        fr.box((1.7, 0.5, 0.42), (0, sy * 4.6, 1.12), M['under'])          # saddles
    fr.finish(parent=root)

    tk = C.Builder("Tank_Body")
    TZ = 1.92
    rot_m = C.xform((0, 0, TZ), (PI / 2, 0, 0))
    profile = [(0.30, -6.05), (0.62, -5.97), (0.85, -5.80), (0.97, -5.55), (1.0, -5.25),
               (1.0, 0.0), (1.0, 5.25), (0.97, 5.55), (0.85, 5.80), (0.62, 5.97), (0.30, 6.05)]
    tk.lathe(profile, tank, segs=24, matrix=rot_m)
    tk.lathe([(1.012, -0.7), (1.012, 0.7)], band, segs=24, matrix=rot_m)
    for yy in (-4.2, -2.4, 2.4, 4.2):
        tk.lathe([(1.02, yy - 0.04), (1.02, yy + 0.04)], steel, segs=24, matrix=rot_m)
    tk.cylinder(0.35, 0.16, (0, 0, 2.92), steel, segs=14)                  # dome
    tk.cylinder(0.38, 0.02, (0, 0, 2.99), steel, segs=14)
    tk.box((1.1, 1.6, 0.04), (0, 0, 2.88), grate)                          # walkway
    for sx in (-1, 1):
        for sy in (-1, 1):
            tk.cylinder(0.015, 0.1, (sx * 0.53, sy * 0.78, 2.95), steel, segs=6)
        tk.cylinder(0.018, 1.6, (sx * 0.53, 0, 2.98), steel, rot=(PI / 2, 0, 0), segs=6)
        # side ladder
        for ly in (-0.25, 0.25):
            tk.cylinder(0.02, 1.4, (sx * 1.08, ly, 1.7), steel, segs=6)
        for k in range(5):
            tk.cylinder(0.015, 0.5, (sx * 1.08, 0, 1.15 + k * 0.28), steel, rot=(PI / 2, 0, 0), segs=6)
    tk.cylinder(0.12, 0.3, (0, 0, 0.85), steel, segs=10)                   # bottom outlet
    tk.finish(parent=root)

    add_bogie(root, "Wagon_Bogie_Front", -4.9, M)
    add_bogie(root, "Wagon_Bogie_Rear", 4.9, M)


BUILDERS = [
    ("train_urban.glb", build_urban, 6000),
    ("train_modern.glb", build_modern, 6000),
    ("train_freight_loco.glb", build_loco, 6000),
    ("wagon_container.glb", build_container_wagon, 6000),
    ("wagon_tank.glb", build_tank_wagon, 6000),
]


def main(out_dir=None):
    return C.run_builders(BUILDERS, out_dir or C.output_dir())


if __name__ == "__main__":
    main()
