"""Single isolated long hair volume. Continuous directional ridges, rounded tucked hem.
No source imagery, personal identifiers, or non-p5 outputs.
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
  # One uninterrupted side part: exposed right forehead, fuller diagonal left sweep.
  aa=abs(a); side=smooth(.36,1.35,aa)
  sweep=-.31*math.sin(a)*math.exp(-(aa/.85)**4)-.13*math.exp(-((a-.20)/.22)**2)
  end=.86+sweep+2.53*side
  end+=side*(.13*math.cos(a*2+.5)+.07*math.sin(a*3-.4))
  if a>0:end-=.20*math.exp(-((aa-1.25)/.45)**2)
  theta=v*end
  crown=min(theta,math.pi/2)
  y=.49*math.cos(crown)-max(0,theta-math.pi/2)*.49
  radius=math.sin(crown)
  lower=smooth(.43,1,v)
  inward=1+.045*math.sin(lower*math.pi)-.25*lower**3*side
  flow=a+.085*math.sin(v*math.pi)*math.sin(a+.6)
  ridge=(.0024*math.cos(flow*27+v*1.4)+.0015*math.cos(flow*43-v*.8))*math.sin(math.pi*v)**.6
  volume=.012*math.sin(v*7+a*2)*side+.012*math.exp(-((a+.7)/.6)**2)*math.sin(v*math.pi)
  x=(.486+ridge+volume)*radius*math.sin(flow)*inward
  z=(.414+ridge+volume*.7)*radius*math.cos(flow)*inward
  # Crown offset and flowing directions retain a soft, continuous asymmetry.
  x+=.035*(1-v)**2
  y+=(.028*math.sin(a*5+.4)+.012*math.sin(a*9))*smooth(.82,1,v)*side
  z+=.008+.018*lower**3*side
  verts.append((x,-z,y));uv.append((i/N,v))
for j in range(R):
 for i in range(N):
  k=j*(N+1)+i;faces.append((k,k+1,k+N+2,k+N+1))
me=bpy.data.meshes.new('p5 continuous swept long hair cage');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('p5 continuous side-part long hair',me);bpy.context.collection.objects.link(ob)
layer=me.uv_layers.new(name='Flow');
for p in me.polygons:
 p.use_smooth=True
 for li in p.loop_indices:layer.data[li].uv=uv[me.loops[li].vertex_index]
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
solid=ob.modifiers.new('Rounded hem volume','SOLIDIFY');solid.thickness=.026;solid.offset=-1
bev=ob.modifiers.new('Soft edge','BEVEL');bev.width=.009;bev.segments=3
mat=bpy.data.materials.new('p5 soft black hair base tint');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.8,.79,.77,1);bs.inputs['Roughness'].default_value=.64
# Subtle strand-scale bump; geometry owns silhouette rather than loose needles.
tex=mat.node_tree.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=95;tex.inputs['Detail'].default_value=2
bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.08;bump.inputs['Distance'].default_value=.007;mat.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal']);ob.data.materials.append(mat)
bpy.context.scene['scope']='Isolated p5 hair geometry; no original photos or identity data'
bpy.context.scene['authoring']='Continuous side part long hair surface, solid hem, soft directional geometry ridges'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'p5.blend'))
for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.export_scene.gltf(filepath=str(OUT/'p5.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
ob.data.calc_loop_triangles();p=OUT/'p5.glb';(OUT/'p5-outline-receipt.json').write_text(json.dumps({'blender':bpy.app.version_string,'triangles':len(ob.data.loop_triangles),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'scope':'p5 only; continuous opaque long hair'},indent=2))
