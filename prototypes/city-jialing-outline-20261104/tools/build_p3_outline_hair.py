"""Single isolated bob volume. Continuous directional ridges, rounded tucked hem.
No source imagery, personal identifiers, or non-p3 outputs.
"""
import bpy, math, json, hashlib
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'assets'/'portrait-hair'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
verts=[];uv=[];faces=[];N=160;R=72
for j in range(R+1):
 v=j/R
 for i in range(N+1):
  a=(i/N*2-1)*math.pi
  # Offset part: fuller viewer-right curtain, tucked left ear.
  aa=abs(a); side=smooth(.38,1.30,aa)
  end=.83+1.54*side
  if a<0:end-=.80*math.exp(-((aa-1.18)/.32)**2)
  theta=v*end
  crown=min(theta,math.pi/2)
  y=.49*math.cos(crown)-max(0,theta-math.pi/2)*.49
  radius=math.sin(crown)
  inward=1-.10*smooth(.76,1,v)*side
  ridge=(.0038*math.cos(a*27+v*.6)+.002*math.cos(a*43-v*.5))*math.sin(math.pi*v)**.6
  x=(.474+ridge)*radius*math.sin(a)*inward
  z=(.414+ridge)*radius*math.cos(a)*inward
  # Root volume and flowing hairline are on the same surface, never hanging bars.
  x+=-.036*(1-v)**2
  y+=.009*math.sin(a*7+.4)*smooth(.88,1,v)*side
  z+=.008
  verts.append((x,-z,y));uv.append((i/N,v))
for j in range(R):
 for i in range(N):
  k=j*(N+1)+i;faces.append((k,k+1,k+N+2,k+N+1))
me=bpy.data.meshes.new('p3 continuous swept bob cage');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('p3 continuous side-part bob',me);bpy.context.collection.objects.link(ob)
layer=me.uv_layers.new(name='Flow');
for p in me.polygons:
 p.use_smooth=True
 for li in p.loop_indices:layer.data[li].uv=uv[me.loops[li].vertex_index]
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
solid=ob.modifiers.new('Rounded hem volume','SOLIDIFY');solid.thickness=.026;solid.offset=-1
bev=ob.modifiers.new('Soft edge','BEVEL');bev.width=.009;bev.segments=3
mat=bpy.data.materials.new('p3 soft black hair base tint');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.8,.79,.77,1);bs.inputs['Roughness'].default_value=.64
# Subtle strand-scale bump; geometry owns silhouette rather than loose needles.
tex=mat.node_tree.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=95;tex.inputs['Detail'].default_value=2
bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.08;bump.inputs['Distance'].default_value=.007;mat.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal']);ob.data.materials.append(mat)
bpy.context.scene['scope']='Isolated p3 hair geometry; no original photos or identity data'
bpy.context.scene['authoring']='Continuous side part bob surface, solid hem, soft directional geometry ridges'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'p3.blend'))
for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.export_scene.gltf(filepath=str(OUT/'p3.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
ob.data.calc_loop_triangles();p=OUT/'p3.glb';(OUT/'p3-outline-receipt.json').write_text(json.dumps({'blender':bpy.app.version_string,'triangles':len(ob.data.loop_triangles),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'scope':'p3 only; continuous opaque bob'},indent=2))
