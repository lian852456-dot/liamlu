"""One authored bob asset in Blender 4.5 LTS. No character retargeting.

Control sections describe the approved Y-up head space. Blender subdivision,
smooth normals and UV material export are applied to these editable volumes.
No particle/curve hair, alpha cards, rig, paid add-on or external asset is used.
"""
import bpy, bmesh, math, json, hashlib
from mathutils import Vector
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/hair-glb'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)
hair_objects=[]

def bcoord(p): return (p[0],-p[2],p[1])
def make_mesh(name,positions,faces,uvs):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([bcoord(p) for p in positions],[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    layer=mesh.uv_layers.new(name='HairFlow')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:layer.data[li].uv=uvs[mesh.loops[li].vertex_index]
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.000001);bm.to_mesh(mesh);bm.free();mesh.update()
    hair_objects.append(ob)
    return ob

def cat(points,t):
    # Uniform Catmull-Rom with endpoint extrapolation to keep rooted flow.
    q=t*(len(points)-1);i=min(len(points)-2,int(q));u=q-i
    p1=Vector(points[i]);p2=Vector(points[i+1]);p0=Vector(points[i-1]) if i else p1*2-p2
    p3=Vector(points[i+2]) if i+2<len(points) else p2*2-p1
    return .5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)

def lock(name,points,width,depth,twist=0,steps=10,sides=8):
    """Closed, rounded sculpt volume; roots buried, blunt swept tips, not leaf cards."""
    pos=[];uv=[];faces=[]
    for i in range(steps+1):
        t=i/steps;c=cat(points,t);tangent=(cat(points,min(1,t+.002))-cat(points,max(0,t-.002))).normalized()
        out=Vector((c.x, .1, c.z)).normalized()
        across=tangent.cross(out).normalized();normal=across.cross(tangent).normalized()
        # Root narrow enough to bury in scalp; fullness carried through lower body.
        w=width*(.43+.57*math.sin(math.pi*(.12+.78*t))**.6)*(1-t**6)**.55+.003
        d=depth*(.6+.4*math.sin(math.pi*t))*(1-t**7)**.5+.002
        for j in range(sides+1):
            a=j/sides*math.tau;side=math.cos(a);front=math.sin(a)
            # One low sculpted channel; no faceted strand sticks.
            swell=1+.055*math.cos(a*3+twist+t*1.8)
            p=c+across*(w*side)+normal*(d*front*swell)
            pos.append(tuple(p));uv.append((j/sides,t))
    for i in range(steps):
        for j in range(sides):
            a=i*(sides+1)+j;b=a+sides+1;faces.append((a,a+1,b+1,b))
    for row in (0,steps):
        center=len(pos);pos.append(tuple(cat(points,row/steps)));uv.append((.5,row/steps))
        for j in range(sides):
            a=row*(sides+1)+j;faces.append((center,a+1,a) if row==0 else (center,a,a+1))
    ob=make_mesh(name,pos,faces,uv)
    # Authoring control cage remains in the .blend; evaluated smoothed mesh exports.
    sub=ob.modifiers.new('Soft sculpt surface','SUBSURF');sub.subdivision_type='CATMULL_CLARK';sub.levels=1;sub.render_levels=1
    return ob

# Continuous bob foundation, carefully cut away from the approved forehead.
pos=[];faces=[];uv=[];around=72;rows=22
for i in range(rows+1):
    t=i/rows
    for j in range(around+1):
        a=j/around*math.tau;front=min(a,math.tau-a);q=max(0,min(1,(front-.67)/.38));blend=q*q*(3-2*q)
        end=.255*(1-blend)+(-.397+.022*math.cos(a*9+.25)+.005*math.sin(a*5))*blend
        y=.526*(1-t)+end*t
        low=max(0,min(1,(.08-y)/.49))
        radius=.478*math.sqrt(max(0,1-((y-.043)/.483)**2)) if y>=.08 else .477+.058*math.sin(low*math.pi)-.012*low**2+.020*math.exp(-((y+.025)/.16)**2)*math.sin(low*math.pi)
        # Broad hair masses; continuous natural waves, tapered under-curled edge.
        channel=.009*math.cos(a*12+.30*math.sin(t*3))+.003*math.cos(a*23+t)
        radius+=channel*math.sin(t*math.pi)**.7
        radius-=.023*max(0,(t-.82)/.18)**2*blend
        x=math.sin(a)*radius;z=math.cos(a)*radius*(.855+.055*math.cos(a))-.018
        pos.append((x,y,z));uv.append((j/around*3.0,t))
for i in range(rows):
    for j in range(around):
        a=i*(around+1)+j;b=a+around+1;faces.append((a,b,b+1,a+1))
make_mesh('Bob continuous foundation',pos,faces,uv)

# Individually composed side-swept fringe. Unequal divisions and slightly curved
# tips break the old repeated triangular leaf rhythm without touching eye space.
fringe=[
 ('fringe far left',[(-.12,.455,.14),(-.28,.365,.31),(-.365,.255,.334),(-.378,.145,.329)],.055,.024),
 ('fringe left outer',[(-.075,.483,.15),(-.23,.370,.355),(-.285,.245,.396),(-.272,.137,.417)],.077,.024),
 ('fringe left',[(-.02,.491,.16),(-.115,.386,.379),(-.17,.255,.437),(-.181,.162,.442)],.083,.026),
 ('fringe middle',[(.028,.493,.17),(.027,.385,.400),(-.020,.265,.462),(.014,.151,.459)],.082,.027),
 ('fringe right',[(.076,.480,.16),(.157,.386,.371),(.171,.254,.435),(.133,.179,.455)],.079,.024),
 ('fringe right outer',[(.12,.455,.12),(.259,.355,.335),(.288,.224,.389),(.255,.135,.408)],.071,.023),
 ('fringe far right',[(.17,.431,.09),(.332,.316,.287),(.370,.205,.316),(.365,.103,.337)],.049,.022),
]
for i,(name,points,w,d) in enumerate(fringe):lock(name,points,w,d,twist=i*.3)

# Long temple volumes flow from under the crown into the bob. Their roots no
# longer end as little pasted-on rectangles; lower curls turn into the mass.
for side in (-1,1):
    def mirrored(points):return [(side*x,y,z) for x,y,z in points]
    lock('temple main '+str(side),mirrored([(.22,.410,.12),(.340,.255,.285),(.433,-.085,.290),(.420,-.275,.272),(.376,-.383,.220)]),.050,.021,twist=side*.3,steps=12)

# Tiny crown flow becomes an inset ridge in the foundation, not a raised shell.
# One shared low-cost metallic/roughness material, three small images.
def image(name,size,fn,colorspace):
    im=bpy.data.images.new(name,width=size,height=size,alpha=False)
    im.colorspace_settings.name=colorspace
    pixels=[]
    for y in range(size):
        for x in range(size):pixels.extend((*fn((x+.5)/size,(y+.5)/size),1))
    im.pixels.foreach_set(pixels);im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
def color(u,v):
    # Neutral tintable strands with softly shaded roots, no baked white glare.
    flow=u+.008*math.sin(v*5);fine=.004*math.sin(flow*math.tau*67+v*2)+.002*math.sin(flow*math.tau*133)
    k=.88-.16*math.exp(-((v-.05)/.18)**2)+.035*math.sin(v*math.pi)+fine
    return (k,k*.991,k*.972)
def normal(u,v):
    f=u+.008*math.sin(v*5);return (.5+.017*math.sin(f*math.tau*67+v*2),.5+.003*math.cos(v*9),.999)
base=image('hair-color',512,color,'sRGB');norm=image('hair-normal',256,normal,'Non-Color')
orm=image('hair-orm',256,lambda u,v:(1,.74+.035*math.cos(u*math.tau*11+v),0),'Non-Color')
mat=bpy.data.materials.new('Soft tinted bob • opaque PBR');mat.use_nodes=True
n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.76
bc=n.new('ShaderNodeTexImage');bc.image=base;l.new(bc.outputs['Color'],p.inputs['Base Color'])
nc=n.new('ShaderNodeTexImage');nc.image=norm;nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.28;l.new(nc.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])
oc=n.new('ShaderNodeTexImage');oc.image=orm;sep=n.new('ShaderNodeSeparateColor');l.new(oc.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
for ob in hair_objects:ob.data.materials.append(mat)

# Record locked asset provenance, and only select the hair collection for GLB.
bpy.context.scene['scope']='Single independent hair; approved face/eyes/body not exported or altered'
bpy.context.scene['coordinate_contract']='local head pivot (0,1.784,0) in game; asset itself local Y-up'
bpy.context.scene['authoring']='Blender Python authored volume cages + subdivision + UV/PBR; no manual sculpt claim'
bpy.ops.object.select_all(action='DESELECT')
for ob in hair_objects:ob.select_set(True)
bpy.context.view_layer.objects.active=hair_objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'short-bob-v1.blend'))
# Keep editable source cages in .blend, export a welded single-material mesh.
for ob in hair_objects:
    bpy.context.view_layer.objects.active=ob
    for modifier in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.join()
joined=bpy.context.view_layer.objects.active;joined.name='Short bob · sculpted volumes'
simplify=joined.modifiers.new('Mobile curvature simplification','DECIMATE');simplify.ratio=.65
bpy.ops.object.modifier_apply(modifier=simplify.name)
hair_objects=[joined]
bpy.ops.export_scene.gltf(filepath=str(OUT/'short-bob-v1.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False)
deps=bpy.context.evaluated_depsgraph_get();triangles=0
for ob in hair_objects:
    mesh=ob.evaluated_get(deps).to_mesh();mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);ob.evaluated_get(deps).to_mesh_clear()
receipt={'blenderVersion':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),'objects':len(hair_objects),'triangles':triangles,'materialCount':1,'transparency':False,'hairPhysics':False,'authoring':bpy.context.scene['authoring'],'glbBytes':(OUT/'short-bob-v1.glb').stat().st_size,'sha256':hashlib.sha256((OUT/'short-bob-v1.glb').read_bytes()).hexdigest(),'textures':{'color':512,'normal':256,'orm':256}}
(OUT/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print('CITY_HAIR_BUILD',json.dumps(receipt))
