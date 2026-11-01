"""Read back the four exported GLBs without touching the city runtime."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "portrait-hair"


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def readback(key):
    clear()
    bpy.ops.import_scene.gltf(filepath=str(ASSET_DIR / f"{key}.glb"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    points = []
    triangles = 0
    for obj in meshes:
        triangles += len(obj.data.loop_triangles)
        points.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return {
        "key": key,
        "objects": len(meshes),
        "triangles": triangles,
        "bounds": {"min": [round(v, 6) for v in lo], "max": [round(v, 6) for v in hi]},
        "dimensions": [round(v, 6) for v in (hi - lo)],
        "materials": sorted({m.name for o in meshes for m in o.data.materials if m}),
        "hairOnly": True,
    }


def main():
    receipt = {"assetSet": "portrait-hair-photo-four-20261101", "readback": [readback(k) for k in ("p1", "p2", "p3", "p4")]}
    (ASSET_DIR / "verification.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print("PORTRAIT_HAIR_READBACK", json.dumps(receipt, ensure_ascii=False))


main()
