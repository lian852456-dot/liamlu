"""Blender bob remaster, using the approved procedural bob as the style guide.
Thin compound fringe volumes, connected sculpted flow, and directional PBR maps.
Editable cages are saved before export; no face/body or rig is exported.
"""
import bpy,bmesh,math,json,hashlib
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/hair-glb-v2';OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
hair=[]
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def bc(p):return (p[0],-p[2],p[1])
def mesh(name,pos,faces,uv,sub=False):
 m=bpy.data.meshes.new(name);m.from_pydata([bc(p) for p in pos],[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o)
 layer=m.uv_layers.new(name='Directional hair flow')
 for poly in m.polygons:
  poly.use_smooth=True
  for li in poly.loop_indices:layer.data[li].uv=uv[m.loops[li].vertex_index]
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(m);bm.free();m.update();hair.append(o)
 if sub:
  mod=o.modifiers.new('Silhouette smoothing','SUBSURF');mod.levels=1;mod.render_levels=1
 return o

def cat(points,t):
 q=t*(len(points)-1);i=min(len(points)-2,int(q));u=q-i;p1=Vector(points[i]);p2=Vector(points[i+1]);p0=Vector(points[i-1]) if i else 2*p1-p2;p3=Vector(points[i+2]) if i+2<len(points) else 2*p2-p1
 return .5*(2*p1+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)

def strand(name,points,width,depth,phase=0,steps=9,sides=8,sub=True):
 pos=[];faces=[];uv=[]
 for i in range(steps+1):
  t=i/steps;c=cat(points,t);tan=(cat(points,min(1,t+.002))-cat(points,max(0,t-.002))).normalized();out=Vector((c.x,0,c.z)).normalized();across=tan.cross(out).normalized();normal=across.cross(tan).normalized()
  # Long, tapering shape from the approved fringe, not V1's broad petal profile.
  w=width*(.34+.72*math.sin(math.pi*t**.82))*(1-t)**.42+.0012
  d=depth*(.55+.45*math.sin(math.pi*t))*(1-t)**.25+.0008
  for j in range(sides+1):
   a=j/sides*math.tau;u=math.cos(a);v=math.sin(a)
   # A shallow compound crest gives two or three related sub-locks, not cylinders.
   crest=1+.12*math.cos(u*math.pi*2+phase+t*.8)
   p=c+across*(w*u)+normal*(d*v*crest);pos.append(tuple(p));uv.append((j/sides+.13*phase,t))
 for i in range(steps):
  for j in range(sides):
   a=i*(sides+1)+j;b=a+sides+1;faces.append((a,a+1,b+1,b))
 for row in (0,steps):
  k=len(pos);pos.append(tuple(cat(points,row/steps)));uv.append((.5,row/steps))
  for j in range(sides):
   a=row*(sides+1)+j;faces.append((k,a+1,a) if row==0 else (k,a,a+1))
 return mesh(name,pos,faces,uv,sub)

def radius(y):
 low=max(0,min(1,(.08-y)/.505))
 r=.486*math.sqrt(max(0,1-((y-.043)/.486)**2)) if y>=.08 else .485+.060*math.sin(low*math.pi)**1.3-.023*low*low
 r+=.025*math.exp(-((y+.025)/.12)**2)*(1-smooth(.075,.16,y))
 return r

def shellpoint(a,y,offset=0):
 front=min(a%(math.tau),math.tau-a%(math.tau));safety=smooth(1.8,2.4,front)*smooth(.02,.12,y)
 offset=offset*(1-safety)+max(offset,-.002)*safety
 r=radius(y)+offset;return (math.sin(a)*r,y,math.cos(a)*r*(.855+.055*math.cos(a))-.018)

# Hidden continuous foundation retains the original bob outline and ear coverage.
pos=[];faces=[];uv=[];around=96;rows=30
for i in range(rows+1):
 t=i/rows
 for j in range(around+1):
  a=j/around*math.tau;front=min(a,math.tau-a);blend=smooth(.65,1.05,front)
  end=.232*(1-blend)+(-.415+.010*math.cos(a*11+.2)+.005*math.sin(a*17))*blend;y=.529*(1-t)+end*t
  # Low relief follows the growth direction rather than vertical embossed bars.
  flow=a+.033*math.sin(t*4+a*2)+.015*math.sin(t*7-a*3)
  offset=(-.004+.011*math.cos(flow*12+.3*math.sin(a*3))+.0035*math.cos(flow*29+t*.6))*math.sin(t*math.pi)**.8
  pos.append(shellpoint(a,y,offset));uv.append((j/around*4,t))
for i in range(rows):
 for j in range(around):
  a=i*(around+1)+j;b=a+around+1;faces.append((a,b,b+1,a+1))
mesh('Approved bob inner foundation',pos,faces,uv)

# The connected side/back surface carries interleaved raised flow and fine grooves.
# Only the face-framing layers and sparse tips remain independent closed volumes.

# Keep the approved seven primary fringe divisions and the same root/endpoint rhythm.
xs=[-.335,-.245,-.14,-.025,.105,.225,.33]
widths=[.063,.065,.066,.067,.064,.061,.055]
for i,x in enumerate(xs):
 sg=-1 if x<0 else 1;z=.433-(abs(x)/.40)**2*.057;tip=.140+(.5+.5*math.sin(i*2.3))*.030
 points=[(x*.40-.035,.476-abs(x)*.09,.16),(x*.75-.025,.365,.338),(x-.008*sg,.237,z-.006),(x+sg*.023,tip,z)]
 strand('Original fringe division '+str(i),points,widths[i],.0125,phase=i*.47)
 # Fine sibling tips remain part of the same haircut, underneath alternate locks.
 if i in (0,2,4,5):
  points=[(x*.43-.035,.464-abs(x)*.08,.15),(x*.78-.008,.346,.335),(x+.027,.221,z-.003),(x+sg*.036+.012,tip-.018,z-.001)]
  strand('Fine fringe split '+str(i),points,.021,.006,phase=i*.47+.4,steps=8,sub=False)

# Two related face-framing layers per side, matching the original's lengths.
for side in (-1,1):
 def mirror(p):return [(side*x,y,z) for x,y,z in p]
 strand('Temple inner '+str(side),mirror([(.18,.38,.15),(.375,.15,.280),(.404,-.15,.307),(.378,-.371,.257)]),.029,.007,phase=.6,steps=11)
 strand('Temple outer '+str(side),mirror([(.24,.36,.10),(.410,.03,.254),(.441,-.24,.231),(.405,-.416,.183)]),.023,.0065,phase=1.1,steps=11)
 # Sparse tapered flyaways, all inside a small silhouette envelope, no physics.
 for n in range(1):
  z=.12-n*.14;x=.485+.005*math.sin(n);end=-.404-.012*(n%2)
  strand('Loose tapered end '+str(side)+'-'+str(n),mirror([(x-.014,-.27,z),(x+.002,-.34,z+.009),(x-.009,end,z+.012),(x-.018,end-.014,z+.008)]),.005,.002,phase=n,steps=7,sides=6,sub=False)

# Small directional textures: roots, soft strand groups and varied roughness.
def texture(name,size,fn,space):
 im=bpy.data.images.new(name,width=size,height=size,alpha=False);im.colorspace_settings.name=space;pixels=[]
 for y in range(size):
  for x in range(size):pixels.extend((*fn((x+.5)/size,(y+.5)/size),1))
 im.pixels.foreach_set(pixels);im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im

def fiber(u,v):return u+.012*math.sin(v*4.4)+.003*math.sin(v*13+u*9)
def col(u,v):
 f=fiber(u,v);group=.013*math.cos(f*math.tau*7)+.007*math.cos(f*math.tau*17+.6);fine=.006*math.sin(f*math.tau*61+v)+.003*math.sin(f*math.tau*121-v*.4)
 root=.78+.17*math.sin(math.pi*(.12+v*.70));k=root+group+fine
 return(k,k*.973,k*.929)
def nor(u,v):
 f=fiber(u,v);return(.5+.022*math.sin(f*math.tau*61+v)+.010*math.sin(f*math.tau*17),.5+.006*math.sin(v*5),.997)
base=texture('hair-v2-color',512,col,'sRGB');normal=texture('hair-v2-normal',256,nor,'Non-Color');orm=texture('hair-v2-orm',256,lambda u,v:(1,.63+.065*math.cos(fiber(u,v)*math.tau*7)+.025*math.sin(v*5),0),'Non-Color')
mat=bpy.data.materials.new('Soft directional bob • opaque PBR');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.68
b=n.new('ShaderNodeTexImage');b.image=base;l.new(b.outputs['Color'],p.inputs['Base Color'])
b=n.new('ShaderNodeTexImage');b.image=normal;nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.35;l.new(b.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])
b=n.new('ShaderNodeTexImage');b.image=orm;sep=n.new('ShaderNodeSeparateColor');l.new(b.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
for o in hair:o.data.materials.append(mat)
bpy.context.scene['style_reference']='approved procedural head-integrated.1 bob; same seven fringe divisions and original lengths'
bpy.context.scene['scope']='Hair only. Face, eyes, skin, body and animation excluded.'
bpy.context.scene['authoring']='Blender Python editable layered volume cages, connected sculpted hair flow, thin fringe cages, smooth normals, UV/PBR; not a manual sculpt claim'
bpy.ops.object.select_all(action='DESELECT')
for o in hair:o.select_set(True)
bpy.context.view_layer.objects.active=hair[0];bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'short-bob-v2.blend'))
for o in hair:
 bpy.context.view_layer.objects.active=o
 for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.join();joined=bpy.context.view_layer.objects.active;joined.name='Approved bob remaster V2'
simplify=joined.modifiers.new('Remove redundant surface samples','DECIMATE');simplify.ratio=.72;bpy.ops.object.modifier_apply(modifier=simplify.name)
bpy.ops.export_scene.gltf(filepath=str(OUT/'short-bob-v2.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False)
joined.data.calc_loop_triangles();data={'blenderVersion':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),'triangles':len(joined.data.loop_triangles),'materials':1,'opaque':True,'physics':False,'styleReference':'head-integrated.1 procedural bob','glbBytes':(OUT/'short-bob-v2.glb').stat().st_size,'sha256':hashlib.sha256((OUT/'short-bob-v2.glb').read_bytes()).hexdigest(),'textures':{'color':512,'normal':256,'orm':256},'authoring':bpy.context.scene['authoring']};(OUT/'build-receipt.json').write_text(json.dumps(data,indent=2)+'\n');print('CITY_HAIR_V2',json.dumps(data))
