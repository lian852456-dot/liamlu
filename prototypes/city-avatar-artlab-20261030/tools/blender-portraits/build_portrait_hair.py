"""Build three isolated portrait hair assets for the avatar art-lab.

The meshes are head-local, opaque, low-cost layered volume cages.  This file is
an authoring source, not an in-game integration or a photo-to-mesh pipeline:
it deliberately exports hair only (no face, body, rig, or employee data).
"""
import bpy
import bmesh
import hashlib
import json
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "portrait-hair"
OUT.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        # Do not remove shared images/materials while the three assets are
        # generated in one Blender invocation.
        pass


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def bc(p):
    # Source coordinates are Three-style (x, depth, y); Blender is x, y, z.
    return (p[0], -p[2], p[1])


HAIR_OBJECTS = []


def make_mesh(name, positions, faces, uvs, subsurf=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([bc(p) for p in positions], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    uv_layer = mesh.uv_layers.new(name="Directional hair flow")
    for poly in mesh.polygons:
        poly.use_smooth = True
        for loop_index in poly.loop_indices:
            uv_layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    if subsurf:
        mod = obj.modifiers.new("Silhouette smoothing", "SUBSURF")
        mod.levels = 1
        mod.render_levels = 1
    HAIR_OBJECTS.append(obj)
    return obj


def catmull(points, t):
    q = t * (len(points) - 1)
    i = min(len(points) - 2, int(q))
    u = q - i
    p1 = Vector(points[i])
    p2 = Vector(points[i + 1])
    p0 = Vector(points[i - 1]) if i else 2 * p1 - p2
    p3 = Vector(points[i + 2]) if i + 2 < len(points) else 2 * p2 - p1
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)


def strand(name, points, width, depth, phase=0.0, steps=9, sides=8, subsurf=False):
    """Create a tapered, closed volume strand with a shallow compound crest."""
    positions, faces, uvs = [], [], []
    for i in range(steps + 1):
        t = i / steps
        center = catmull(points, t)
        tangent = (catmull(points, min(1.0, t + 0.002)) - catmull(points, max(0.0, t - 0.002))).normalized()
        outward = Vector((center.x, 0.0, center.z)).normalized()
        across = tangent.cross(outward).normalized()
        normal = across.cross(tangent).normalized()
        taper = max(0.0, 1.0 - t)
        w = width * (0.34 + 0.72 * math.sin(math.pi * t ** 0.82)) * taper ** 0.42 + 0.0012
        d = depth * (0.55 + 0.45 * math.sin(math.pi * t)) * taper ** 0.25 + 0.0008
        for j in range(sides + 1):
            a = j / sides * math.tau
            u, v = math.cos(a), math.sin(a)
            crest = 1.0 + 0.12 * math.cos(u * math.pi * 2.0 + phase + t * 0.8)
            p = center + across * (w * u) + normal * (d * v * crest)
            positions.append(tuple(p))
            uvs.append(((j / sides + 0.13 * phase) % 1.0, t))
    for i in range(steps):
        for j in range(sides):
            a = i * (sides + 1) + j
            b = a + sides + 1
            faces.append((a, a + 1, b + 1, b))
    for row in (0, steps):
        cap_index = len(positions)
        positions.append(tuple(catmull(points, row / steps)))
        uvs.append((0.5, row / steps))
        for j in range(sides):
            a = row * (sides + 1) + j
            faces.append((cap_index, a + 1, a) if row == 0 else (cap_index, a, a + 1))
    return make_mesh(name, positions, faces, uvs, subsurf)


def head_radius(y):
    """Head-local radius matching the approved 2.5-head avatar baseline."""
    low = max(0.0, min(1.0, (0.08 - y) / 0.505))
    if y >= 0.08:
        r = 0.486 * math.sqrt(max(0.0, 1.0 - ((y - 0.043) / 0.486) ** 2))
    else:
        r = 0.485 + 0.060 * math.sin(low * math.pi) ** 1.3 - 0.023 * low * low
    return r + 0.025 * math.exp(-((y + 0.025) / 0.12) ** 2) * (1.0 - smooth(0.075, 0.16, y))


def cap_point(angle, y, offset=0.0, depth_scale=0.91):
    front = min(angle % math.tau, math.tau - angle % math.tau)
    safety = smooth(1.8, 2.4, front) * smooth(0.02, 0.12, y)
    offset = offset * (1.0 - safety) + max(offset, -0.002) * safety
    r = head_radius(y) + offset
    return (math.sin(angle) * r, y, math.cos(angle) * r * depth_scale - 0.018)


def cap_surface(style, front_drop, side_drop, back_drop, depth_scale=0.91):
    """Connected foundation shell; bottom varies around the head to form a hairline."""
    positions, faces, uvs = [], [], []
    around, rows = 72, 22
    for i in range(rows + 1):
        t = i / rows
        for j in range(around + 1):
            a = j / around * math.tau
            frontness = math.cos(a)  # +1 is face, -1 is rear
            angle_front = min(a, math.tau - a)
            if frontness >= 0:
                blend = smooth(0.52, 1.15, angle_front)
                end = front_drop * (1.0 - blend) + side_drop * blend
            else:
                blend = smooth(0.0, 1.0, -frontness)
                end = side_drop * (1.0 - blend) + back_drop * blend
            end += 0.018 * math.cos(a * 2.0) * max(frontness, 0.0)
            if style == "c":
                # A single continuous crown-to-tip surface avoids a cape seam.
                end = end if frontness > 0.86 else -0.87 + 0.018 * math.cos(a * 11.0) + 0.012 * math.sin(a * 17.0)
                blend_front = smooth(0.52, 1.15, angle_front)
                end = (front_drop + 0.02 * math.cos(a * 2.0)) * (1.0 - blend_front) + (-0.87 + 0.018 * math.cos(a * 11.0) + 0.012 * math.sin(a * 17.0)) * blend_front
            y = 0.535 * (1.0 - t) + end * t
            flow = a + 0.025 * math.sin(t * 4.2 + a * 2.0) + 0.012 * math.sin(t * 7.0 - a * 3.0)
            relief = (-0.004 + 0.009 * math.cos(flow * 12.0) + 0.003 * math.cos(flow * 29.0 + t * 0.6)) * math.sin(math.pi * t) ** 0.8
            if style == "c" and y < -0.18:
                lower = smooth(-0.18, -0.83, y)
                r = head_radius(-0.18) + relief + 0.015 * math.sin(lower * math.pi)
                positions.append((math.sin(a) * r, y, math.cos(a) * r * depth_scale - 0.018 - 0.035 * lower))
            else:
                positions.append(cap_point(a, y, relief, depth_scale))
            uvs.append((j / around * 4.0, t))
    for i in range(rows):
        for j in range(around):
            a = i * (around + 1) + j
            b = a + around + 1
            faces.append((a, b, b + 1, a + 1))
    return make_mesh(style + " cap foundation", positions, faces, uvs, subsurf=False)


def mirror_points(points, side):
    return [(side * x, y, z) for x, y, z in points]


def add_flyaway(name, points, phase=0.0):
    return strand(name, points, 0.006, 0.0022, phase=phase, steps=7, sides=6, subsurf=False)


def build_a():
    """Dark brown middle-part hair with thin curtains and a light low pony."""
    cap_surface("a", front_drop=0.34, side_drop=-0.10, back_drop=-0.34, depth_scale=0.91)
    # Center-part curtain fringe: small, separated strands retain the photo's airy front.
    for side in (-1, 1):
        for n, (start_x, end_x, end_y) in enumerate(((0.025, 0.15, 0.24), (0.042, 0.21, 0.14))):
            s = side
            strand(f"a fringe center {side} {n}", mirror_points([
                (start_x * 0.65, 0.484 - n * 0.012, 0.16),
                (0.085 + n * 0.016, 0.342 - n * 0.018, 0.378),
                (end_x, 0.258 - n * 0.022, 0.390),
                (end_x + 0.018, end_y, 0.385),
            ], s), 0.028 - n * 0.003, 0.008, phase=0.4 + n * .3, steps=9)
        # Light face-framing layers, tapering before the shoulder.
        strand(f"a side layer inner {side}", mirror_points([
            (.22, .35, .26), (.34, .10, .33), (.39, -.17, .32), (.37, -.39, .28)
        ], side), .030, .007, phase=.55, steps=11)
        strand(f"a side layer outer {side}", mirror_points([
            (.27, .32, .17), (.41, .02, .27), (.45, -.25, .24), (.42, -.47, .18)
        ], side), .022, .006, phase=1.1, steps=11)
        add_flyaway(f"a face flyaway {side}", mirror_points([(.43, -.20, .22), (.47, -.30, .25), (.46, -.43, .22), (.45, -.46, .20)], side), .2)
    # Conservative low-tied rear pony inferred from the supplied front photograph.
    for n, dx in enumerate((-.055, 0.0, .055)):
        strand(f"a back low pony {n}", [
            (dx * .45, .05, -.405), (dx * .80, -.18, -.505), (dx, -.43, -.56), (dx * .72, -.66, -.53)
        ], .047 if n == 1 else .036, .020, phase=n * .7, steps=13)
    strand("a low pony tie", [(0, -.20, -.515), (0, -.25, -.545), (0, -.29, -.53)], .030, .016, phase=.5, steps=6)
    for n in range(2):
        add_flyaway(f"a pony flyaway {n}", [(-.05 + n * .10, -.15, -.43), (-.11 + n * .17, -.25, -.50), (-.07 + n * .14, -.38, -.53), (-.03 + n * .10, -.45, -.50)], n)


def build_b():
    """Nearly black short pixie/crop with uneven fringe and exposed ears."""
    cap_surface("b", front_drop=0.27, side_drop=0.04, back_drop=-0.19, depth_scale=0.91)
    # Uneven small fringe above the brows.
    xs = [-.31, -.22, -.12, -.02, .09, .19, .29]
    lengths = [.18, .16, .19, .14, .17, .15, .18]
    for i, x in enumerate(xs):
        tip = .22 + (i % 3 - 1) * .018
        strand(f"b fringe {i}", [(x * .52, .31, .34), (x * .82, .255, .375), (x, tip, .392), (x + (0.012 if x >= 0 else -0.012), tip - .035, .383)], .035, .011, phase=i * .45, steps=8)
    for side in (-1, 1):
        # Tapered sideburn/pixie tufts stop above the jaw; ears remain visible.
        for n in range(3):
            x = .31 + n * .052
            strand(f"b side tuft {side} {n}", mirror_points([
                (x, .20 - n * .018, .24), (x + .045, .07 - n * .02, .32), (x + .02, .02 - n * .01, .29), (x - .005, -.04 - n * .01, .25)
            ], side), .031 - n * .004, .008, phase=.5 + n * .3, steps=8)
        add_flyaway(f"b ear flyaway {side}", mirror_points([(.41, .02, .28), (.46, -.03, .33), (.45, -.04, .29), (.43, -.07, .25)], side), .7)
    # Small rear crop flow rather than a helmet shell.
    for n, x in enumerate((-.25, -.12, 0, .12, .25)):
        strand(f"b nape flow {n}", [(x, .10, -.41), (x * 1.08, -.01, -.45), (x * .98, -.12, -.45), (x * .9, -.21, -.40)], .032, .012, phase=n * .38, steps=8)
    for n in range(3):
        add_flyaway(f"b crown flyaway {n}", [(-.18 + n * .16, .39, .10), (-.12 + n * .12, .43, .04), (-.06 + n * .10, .44, -.02), (-.02 + n * .08, .42, -.06)], n * .3)


def build_c():
    """Dark long center-part layers with inward lower ends and rear flow."""
    cap_surface("c", front_drop=0.34, side_drop=-0.27, back_drop=-0.28, depth_scale=0.90)
    for side in (-1, 1):
        # Airy middle-part strands; lower layers follow the continuous side surface.
        for n, end_y in enumerate((.22, .13, .03)):
            strand(f"c center fringe {side} {n}", mirror_points([
                (.015 + n * .012, .484 - n * .012, .16), (.10 + n * .018, .33, .38), (.18 + n * .025, .23 - n * .025, .42), (.22 + n * .02, end_y, .43)
            ], side), .030 - n * .004, .008, phase=.3 + n * .35, steps=9)
        # Closely overlapped long front layers with softly inward lower ends.
        strand(f"c side inner {side}", mirror_points([
            (.22, .34, .28), (.40, .10, .31), (.46, -.25, .29), (.45, -.79, .22)
        ], side), .043, .011, phase=.55, steps=14)
        strand(f"c side outer {side}", mirror_points([
            (.29, .29, .20), (.47, -.03, .25), (.51, -.36, .24), (.49, -.84, .16)
        ], side), .037, .010, phase=1.05, steps=15)
        strand(f"c side inner short {side}", mirror_points([
            (.35, .25, .24), (.45, -.02, .27), (.47, -.31, .27), (.46, -.68, .20)
        ], side), .024, .007, phase=1.6, steps=12)
        add_flyaway(f"c side flyaway {side}", mirror_points([(.50, -.37, .22), (.53, -.49, .25), (.53, -.64, .23), (.50, -.77, .18)], side), .4)
    # Rear curtain flow: connected at the cap, layered rather than one rigid shell.
    for n, x in enumerate((-.34, -.22, -.11, 0, .11, .22, .34)):
        end_y = -.84 - (.05 if n in (0, 6) else 0)
        strand(f"c back flow {n}", [(x, .09, -.39), (x * 1.08, -.20, -.52), (x * 1.04, -.53, -.56), (x * .98, end_y, -.50)], .040 if n in (2, 3, 4) else .032, .015, phase=n * .34, steps=16)
    for side in (-1, 1):
        add_flyaway(f"c rear edge flyaway {side}", mirror_points([(.34, -.38, -.50), (.41, -.55, -.53), (.43, -.72, -.48), (.41, -.86, -.41)], side), .3)


def make_texture(name, size, fn, colorspace):
    image = bpy.data.images.get(name) or bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = colorspace
    pixels = []
    for y in range(size):
        for x in range(size):
            pixels.extend((*fn((x + 0.5) / size, (y + 0.5) / size), 1.0))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(OUT / (name + ".png"))
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def make_material():
    def fiber(u, v):
        return u + 0.012 * math.sin(v * 4.4) + 0.003 * math.sin(v * 13.0 + u * 9.0)

    def col(u, v):
        f = fiber(u, v)
        group = 0.013 * math.cos(f * math.tau * 7.0) + 0.007 * math.cos(f * math.tau * 17.0 + .6)
        fine = 0.006 * math.sin(f * math.tau * 61.0 + v) + 0.003 * math.sin(f * math.tau * 121.0 - v * .4)
        root = .78 + .17 * math.sin(math.pi * (.12 + v * .70))
        k = max(0.0, min(1.0, root + group + fine))
        return (k, k * .973, k * .929)

    def nor(u, v):
        f = fiber(u, v)
        return (.5 + .022 * math.sin(f * math.tau * 61.0 + v) + .010 * math.sin(f * math.tau * 17.0), .5 + .006 * math.sin(v * 5.0), .997)

    base = make_texture("portrait-hair-color", 512, col, "sRGB")
    normal = make_texture("portrait-hair-normal", 256, nor, "Non-Color")
    orm = make_texture("portrait-hair-orm", 256, lambda u, v: (1.0, .73 + .035 * math.cos(fiber(u, v) * math.tau * 7.0) + .015 * math.sin(v * 5.0), 0.0), "Non-Color")
    mat = bpy.data.materials.get("Portrait hair • soft directional PBR") or bpy.data.materials.new("Portrait hair • soft directional PBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = .68
    color_node = nodes.new("ShaderNodeTexImage")
    color_node.image = base
    links.new(color_node.outputs["Color"], bsdf.inputs["Base Color"])
    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.image = normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = .35
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    orm_node = nodes.new("ShaderNodeTexImage")
    orm_node.image = orm
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm_node.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    return mat


def save_export(style, mat):
    for obj in HAIR_OBJECTS:
        obj.data.materials.append(mat)
    bpy.context.scene["scope"] = "Hair only. Face, eyes, skin, body and animation excluded."
    bpy.context.scene["authoring"] = "Blender Python editable layered volume cages with closed tapered strands, smooth normals and UV/PBR; not a manual sculpt claim"
    bpy.context.scene["style"] = style
    bpy.ops.object.select_all(action="DESELECT")
    for obj in HAIR_OBJECTS:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = HAIR_OBJECTS[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{style}.blend"))
    for obj in HAIR_OBJECTS:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = f"Portrait hair {style}"
    joined.data.calc_loop_triangles()
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{style}.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_normals=True, export_tangents=True, export_materials="EXPORT", export_animations=False, export_cameras=False, export_lights=False)
    joined.data.calc_loop_triangles()
    glb = OUT / f"{style}.glb"
    result = {
        "style": style,
        "blenderVersion": bpy.app.version_string,
        "buildHash": bpy.app.build_hash.decode(),
        "triangles": len(joined.data.loop_triangles),
        "materials": 1,
        "opaque": True,
        "physics": False,
        "hairOnly": True,
        "glbBytes": glb.stat().st_size,
        "sha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
        "textures": {"color": 512, "normal": 256, "orm": 256},
        "authoring": bpy.context.scene["authoring"],
    }
    bpy.data.objects.remove(joined, do_unlink=True)
    HAIR_OBJECTS.clear()
    return result


def main():
    clear_scene()
    mat = make_material()
    results = []
    for style, builder in (("a", build_a), ("b", build_b), ("c", build_c)):
        clear_scene()
        builder()
        results.append(save_export(style, mat))
    receipt = {
        "assetSet": "portrait-hair-20261030",
        "scope": "isolated three-person trial assets; hair only; no employee IDs or source photos",
        "styles": {r["style"]: r for r in results},
        "visualReferences": {"a": "dark-brown center-part low-tied hair", "b": "near-black short pixie crop", "c": "dark-brown center-part long layered hair"},
        "limits": ["No hair physics", "No transparent cards", "No face/body/rig", "Not formal city deployment"],
    }
    (OUT / "build-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print("PORTRAIT_HAIR_BUILD", json.dumps(receipt, ensure_ascii=False))


main()
