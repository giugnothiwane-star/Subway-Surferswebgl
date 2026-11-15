"""
MNNROW - shared helpers for the procedural Blender (bpy) asset generators.

All generator scripts insert their own directory into sys.path and do
`import mnnrow_common as C`.

Conventions
-----------
* Units: meters. Blender is Z-up; GLB export uses export_yup=True so the
  glTF files are Y-up (Blender X -> glTF X, Blender Z -> glTF Y,
  Blender Y -> glTF -Z).
* Track direction: length of vehicles / track pieces runs along Blender Y.
  The FRONT of vehicles points to Blender -Y (== glTF +Z, i.e. towards a
  camera that follows a player running towards glTF -Z).
* Origins: base center (z = 0 at the bottom) unless a script says otherwise.
  For rail vehicles z = 0 is the rail top.

Geometry is built with bmesh "primitives" that are each cleaned
(remove doubles + outward normals) and then appended into one mesh per
object with per-face material slots. That keeps draw calls low and gives
clean, closed shells.
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def log(*args):
    print("[MNNROW]", *args, flush=True)


# --------------------------------------------------------------------------
# CLI / scene
# --------------------------------------------------------------------------

def script_args():
    """Arguments after '--' (blender -b -P x.py -- --out dir) or, when run
    with the pip `bpy` module (python x.py --out dir), sys.argv[1:]."""
    argv = sys.argv
    if "--" in argv:
        return argv[argv.index("--") + 1:]
    if bpy.app.background and any(a in ("-P", "--python") for a in argv):
        return []
    return argv[1:]


def output_dir(default=None):
    args = script_args()
    out = None
    for i, a in enumerate(args):
        if a == "--out" and i + 1 < len(args):
            out = args[i + 1]
        elif a.startswith("--out="):
            out = a.split("=", 1)[1]
    if out is None:
        out = default or os.path.join(SCRIPT_DIR, "exports")
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    return out


def reset_scene():
    """Remove every object / mesh / material so each asset exports alone."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves,
                 bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for block in list(coll):
            coll.remove(block)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    us = bpy.context.scene.unit_settings
    us.system = 'METRIC'
    us.scale_length = 1.0
    try:
        us.length_unit = 'METERS'
    except Exception:
        pass


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color(value):
    """'#rrggbb' (sRGB) or an (r, g, b) tuple already in linear space."""
    if isinstance(value, str):
        h = value.lstrip('#')
        return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))
    return tuple(value[:3])


def _set_input(node, names, value):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


def make_material(name, base, metallic=0.0, roughness=0.5, emission=None,
                  emission_strength=1.0, alpha=1.0, double_sided=False):
    """Principled BSDF material (glTF metallic-roughness friendly)."""
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    rgb = color(base)
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if out is None:
            out = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    _set_input(bsdf, ('Base Color',), (*rgb, 1.0))
    _set_input(bsdf, ('Metallic',), float(metallic))
    _set_input(bsdf, ('Roughness',), float(roughness))
    if emission is not None:
        erg = color(emission)
        _set_input(bsdf, ('Emission Color', 'Emission'), (*erg, 1.0))
        _set_input(bsdf, ('Emission Strength',), float(emission_strength))
    else:
        _set_input(bsdf, ('Emission Color', 'Emission'), (0.0, 0.0, 0.0, 1.0))
        _set_input(bsdf, ('Emission Strength',), 0.0)
    if alpha < 1.0:
        _set_input(bsdf, ('Alpha',), float(alpha))
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass
    mat.use_backface_culling = not double_sided
    mat.diffuse_color = (*rgb, alpha)
    mat.metallic = metallic
    mat.roughness = roughness
    return mat


# --------------------------------------------------------------------------
# Matrices
# --------------------------------------------------------------------------

def xform(loc=(0, 0, 0), rot=(0, 0, 0), scale=None, parent=None):
    m = Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
    if scale is not None:
        m = m @ Matrix.Diagonal((*scale, 1.0))
    if parent is not None:
        m = parent @ m
    return m


def side_matrix(origin, normal, up=(0, 0, 1)):
    """Frame whose local +Z is `normal`, local +Y is (roughly) `up` and local
    +X = up x normal (right-handed). Used to place panels on faces."""
    n = Vector(normal).normalized()
    up = Vector(up)
    if abs(n.dot(up)) > 0.99:
        up = Vector((0, 1, 0))
    v = (up - n * up.dot(n)).normalized()
    u = v.cross(n)
    m = Matrix((
        (u.x, v.x, n.x, origin[0]),
        (u.y, v.y, n.y, origin[1]),
        (u.z, v.z, n.z, origin[2]),
        (0, 0, 0, 1)))
    return m


# --------------------------------------------------------------------------
# Mesh-level cleanup helpers (bmesh)
# --------------------------------------------------------------------------

def bm_remove_doubles(bm, dist=1e-5):
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=dist)


def bm_recalc_normals_outward(bm, faces=None):
    bmesh.ops.recalc_face_normals(bm, faces=faces if faces is not None else bm.faces[:])


def set_auto_smooth(mesh, angle_deg=40.0):
    """Blender 4.1+: Mesh.set_sharp_from_angle. Older: use_auto_smooth."""
    ang = math.radians(angle_deg)
    if hasattr(mesh, "set_sharp_from_angle"):
        mesh.set_sharp_from_angle(angle=ang)
    elif hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = ang


def shade_smooth(obj, angle_deg=40.0):
    for p in obj.data.polygons:
        p.use_smooth = True
    set_auto_smooth(obj.data, angle_deg)


def apply_transforms(obj):
    """Bake the object's local transform into its mesh (no bpy.ops needed)."""
    if obj.type == 'MESH':
        obj.data.transform(obj.matrix_basis)
        obj.matrix_basis = Matrix.Identity(4)


def remove_doubles(obj, dist=1e-5):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm_remove_doubles(bm, dist)
    bm.to_mesh(obj.data)
    bm.free()


def recalc_normals_outward(obj):
    """Whole-object recalculation. Builder already does this per primitive
    (safer for open panels such as glass quads), so this is optional."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm_recalc_normals_outward(bm)
    bm.to_mesh(obj.data)
    bm.free()


# --------------------------------------------------------------------------
# Builder: one object, many primitives, per-face materials
# --------------------------------------------------------------------------

class Builder:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    # material slot index
    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _commit(self, tmp, palette, matrix=None, recalc=True, merge=True):
        if matrix is not None:
            bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts[:])
        if merge:
            bm_remove_doubles(tmp)
        if recalc:
            bm_recalc_normals_outward(tmp)
        vmap = {v: self.bm.verts.new(v.co) for v in tmp.verts}
        slots = [self.mi(m) for m in palette]
        for f in tmp.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = slots[min(f.material_index, len(slots) - 1)]
            nf.smooth = f.smooth
        tmp.free()

    @staticmethod
    def _palette(mat):
        return list(mat) if isinstance(mat, (list, tuple)) else [mat]

    # ---------------- primitives ----------------
    def box(self, size, loc, mat, rot=(0, 0, 0), matrix=None, bevel=0.0,
            segs=2, bevel_filter=None, smooth=None):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        sx, sy, sz = size
        for v in tmp.verts:
            v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        if bevel > 0:
            edges = [e for e in tmp.edges if bevel_filter is None or bevel_filter(e)]
            if edges:
                bmesh.ops.bevel(tmp, geom=edges, offset=bevel, segments=segs,
                                profile=0.5, affect='EDGES', clamp_overlap=True)
        sm = (bevel > 0) if smooth is None else smooth
        for f in tmp.faces:
            f.smooth = sm
        self._commit(tmp, [mat], xform(loc, rot, parent=matrix))

    def cylinder(self, r, depth, loc, mat, rot=(0, 0, 0), matrix=None,
                 segs=16, r2=None, cap=True, smooth=True):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=cap, cap_tris=False, segments=segs,
                              radius1=r, radius2=r if r2 is None else r2, depth=depth)
        for f in tmp.faces:
            f.smooth = smooth
        self._commit(tmp, [mat], xform(loc, rot, parent=matrix))

    def sphere(self, r, loc, mat, segs=12, rings=8, scale=(1, 1, 1),
               rot=(0, 0, 0), matrix=None, smooth=True):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=segs, v_segments=rings, radius=r)
        for v in tmp.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        for f in tmp.faces:
            f.smooth = smooth
        self._commit(tmp, [mat], xform(loc, rot, parent=matrix))

    def icosphere(self, r, loc, mat, subdiv=2, displace=None, smooth=False, matrix=None):
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=r)
        if displace is not None:
            for v in tmp.verts:
                v.co = displace(v.co.copy())
        for f in tmp.faces:
            f.smooth = smooth
        self._commit(tmp, [mat], xform(loc, parent=matrix))

    def loft(self, rings, mat, mat_of=None, closed=True, cap_start=True,
             cap_end=True, cap_mat=0, smooth=True, recalc=True, matrix=None):
        """Bridge consecutive rings (lists of 3D points, equal length).
        mat may be a palette list; mat_of(i, j) -> palette index of the quad
        between ring i and i+1, point j and j+1."""
        tmp = bmesh.new()
        vr = [[tmp.verts.new(Vector(p)) for p in ring] for ring in rings]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n if closed else n - 1):
                j2 = (j + 1) % n
                try:
                    f = tmp.faces.new((vr[i][j], vr[i][j2], vr[i + 1][j2], vr[i + 1][j]))
                except ValueError:
                    continue
                f.material_index = mat_of(i, j) if mat_of else 0
                f.smooth = smooth
        if closed:
            for ring, use in ((vr[0], cap_start), (vr[-1], cap_end)):
                if use:
                    f = tmp.faces.new(ring[::-1] if ring is vr[0] else ring)
                    f.material_index = cap_mat
                    f.smooth = False
        self._commit(tmp, self._palette(mat), matrix, recalc=recalc)

    def lathe(self, profile, mat, segs=24, mat_of_seg=None, cap_start=True,
              cap_end=True, cap_mat=0, smooth=True, matrix=None):
        """Revolve [(r, z), ...] around local Z."""
        rings = []
        for r, z in profile:
            rings.append([(r * math.cos(2 * math.pi * k / segs),
                           r * math.sin(2 * math.pi * k / segs), z) for k in range(segs)])
        self.loft(rings, mat, (lambda i, j: mat_of_seg(i)) if mat_of_seg else None,
                  cap_start=cap_start, cap_end=cap_end, cap_mat=cap_mat,
                  smooth=smooth, matrix=matrix)

    def sweep(self, path, profile, mat, mat_of=None, scales=None, normal0=None,
              cap_start=True, cap_end=True, cap_mat=0, smooth=True, matrix=None):
        """Sweep a closed 2D profile [(u, v)] along a 3D path with
        parallel-transport frames. scales[i] scales the profile at point i."""
        pts = [Vector(p) for p in path]
        n = len(pts)
        tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
        if normal0 is None:
            ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
            nrm = tans[0].cross(ref).normalized()
        else:
            nrm = Vector(normal0).normalized()
        rings = []
        for i in range(n):
            if i > 0:
                nrm = tans[i - 1].rotation_difference(tans[i]) @ nrm
            b = tans[i].cross(nrm)
            s = scales[i] if scales else 1.0
            sx, sy = (s, s) if not isinstance(s, (tuple, list)) else s
            rings.append([pts[i] + nrm * (u * sx) + b * (v * sy) for (u, v) in profile])
        self.loft(rings, mat, mat_of, cap_start=cap_start, cap_end=cap_end,
                  cap_mat=cap_mat, smooth=smooth, matrix=matrix)

    def prism(self, poly, depth, mat, matrix=None, z0=None, smooth=False):
        """Extrude a 2D polygon (local XY, CCW or CW, may be concave) along
        local +Z. Default: centered on z=0."""
        if z0 is None:
            z0 = -depth / 2.0
        tmp = bmesh.new()
        bot = [tmp.verts.new((x, y, z0)) for x, y in poly]
        top = [tmp.verts.new((x, y, z0 + depth)) for x, y in poly]
        faces = [tmp.faces.new(bot[::-1]), tmp.faces.new(top)]
        m = len(poly)
        for i in range(m):
            k = (i + 1) % m
            faces.append(tmp.faces.new((bot[i], bot[k], top[k], top[i])))
        for f in faces:
            f.smooth = smooth
        self._commit(tmp, self._palette(mat), matrix)

    def frame_ring(self, w, h, border, depth, matrix, frame_mat, glass_mat=None,
                   glass_offset=0.01):
        """Window/door frame: rectangular ring (w x h, border thick, protruding
        `depth` along local +Z) + optional recessed glass quad. Open at the
        back (it sits on a wall), normals built explicitly (no recalc)."""
        tmp = bmesh.new()
        hw, hh = w / 2.0, h / 2.0
        iw, ih = hw - border, hh - border
        oc = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        ic = [(-iw, -ih), (iw, -ih), (iw, ih), (-iw, ih)]
        O0 = [tmp.verts.new((x, y, 0.0)) for x, y in oc]
        O1 = [tmp.verts.new((x, y, depth)) for x, y in oc]
        I1 = [tmp.verts.new((x, y, depth)) for x, y in ic]
        I0 = [tmp.verts.new((x, y, 0.0)) for x, y in ic]
        for k in range(4):
            k2 = (k + 1) % 4
            for quad in ((O1[k], O1[k2], I1[k2], I1[k]),
                         (O0[k], O0[k2], O1[k2], O1[k]),
                         (I1[k], I1[k2], I0[k2], I0[k])):
                f = tmp.faces.new(quad)
                f.material_index = 0
        palette = [frame_mat]
        if glass_mat is not None:
            g = [tmp.verts.new((x, y, glass_offset)) for x, y in ic]
            f = tmp.faces.new(g)
            f.material_index = 1
            palette.append(glass_mat)
        self._commit(tmp, palette, matrix, recalc=False, merge=False)

    def quad(self, pts, mat, matrix=None, smooth=False):
        """Single face (winding as given, no normal recalculation)."""
        tmp = bmesh.new()
        f = tmp.faces.new([tmp.verts.new(Vector(p)) for p in pts])
        f.smooth = smooth
        self._commit(tmp, [mat], matrix, recalc=False, merge=False)

    # ---------------- finish ----------------
    def finish(self, name=None, auto_smooth=40.0, parent=None):
        name = name or self.name
        me = bpy.data.meshes.new(name + "_Mesh")
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        if auto_smooth:
            set_auto_smooth(me, auto_smooth)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        return ob


def make_root(name):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    bpy.context.scene.collection.objects.link(ob)
    return ob


# --------------------------------------------------------------------------
# 2D helpers
# --------------------------------------------------------------------------

def clip_polygon(poly, xmin, xmax, ymin, ymax):
    """Sutherland-Hodgman clip of a 2D polygon to an axis-aligned rect."""
    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia:
                    out.append(inter(a, b))
                out.append(b)
            elif ia:
                out.append(inter(a, b))
        return out

    def ix(x0):
        return lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))

    def iy(y0):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)

    pts = list(poly)
    for inside, inter in ((lambda p: p[0] >= xmin, ix(xmin)), (lambda p: p[0] <= xmax, ix(xmax)),
                          (lambda p: p[1] >= ymin, iy(ymin)), (lambda p: p[1] <= ymax, iy(ymax))):
        if not pts:
            break
        pts = clip(pts, inside, inter)
    # drop near-duplicate consecutive points
    clean = []
    for p in pts:
        if not clean or (abs(p[0] - clean[-1][0]) > 1e-6 or abs(p[1] - clean[-1][1]) > 1e-6):
            clean.append(p)
    if len(clean) > 1 and abs(clean[0][0] - clean[-1][0]) < 1e-6 and abs(clean[0][1] - clean[-1][1]) < 1e-6:
        clean.pop()
    return clean


def rounded_rect(w, h, r, n_corner=3, cx=0.0, cy=0.0):
    """CCW rounded rectangle outline in 2D."""
    pts = []
    corners = ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
               (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270))
    for x, y, a0 in corners:
        for k in range(n_corner + 1):
            a = math.radians(a0 + 90.0 * k / n_corner)
            pts.append((cx + x + r * math.cos(a), cy + y + r * math.sin(a)))
    return pts


def circle2d(r, n, phase=0.0):
    return [(r * math.cos(phase + 2 * math.pi * k / n), r * math.sin(phase + 2 * math.pi * k / n))
            for k in range(n)]


# --------------------------------------------------------------------------
# Reporting / export
# --------------------------------------------------------------------------

def triangle_count(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for ob in (objs if objs is not None else bpy.context.scene.objects):
        if ob.type != 'MESH':
            continue
        eo = ob.evaluated_get(dg)
        me = eo.to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        eo.to_mesh_clear()
    return total


def _ensure_gltf_exporter():
    try:
        bpy.ops.export_scene.gltf.get_rna_type()
        return
    except Exception:
        pass
    import addon_utils
    addon_utils.enable("io_scene_gltf2", default_set=True)


def export_glb(filepath):
    _ensure_gltf_exporter()
    for ob in bpy.context.scene.objects:
        if ob.parent is None:
            apply_transforms(ob)
    full = dict(filepath=filepath, export_format='GLB', export_yup=True,
                export_apply=True, use_selection=False, export_materials='EXPORT',
                export_cameras=False, export_lights=False, export_animations=False)
    try:
        bpy.ops.export_scene.gltf(**full)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=filepath, export_format='GLB',
                                  export_yup=True, export_apply=True)
    return os.path.getsize(filepath)


def save_asset(out_dir, filename, budget=None):
    """Triangle report + GLB export of everything currently in the scene."""
    tris = triangle_count()
    path = os.path.join(out_dir, filename)
    size = export_glb(path)
    mats = len([m for m in bpy.data.materials if m.users > 0])
    note = "" if budget is None or tris <= budget else "  (OVER BUDGET %d)" % budget
    log("%-26s tris=%6d  materials=%2d  size=%8d bytes%s" % (filename, tris, mats, size, note))
    return {"file": filename, "tris": tris, "materials": mats, "bytes": size}


def run_builders(builders, out_dir):
    """builders: list of (filename, callable, budget). Each callable builds a
    fresh scene (reset is done here)."""
    results = []
    for filename, fn, budget in builders:
        reset_scene()
        fn()
        results.append(save_asset(out_dir, filename, budget))
    return results
