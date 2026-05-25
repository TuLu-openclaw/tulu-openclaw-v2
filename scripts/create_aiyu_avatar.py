import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'digital-human' / 'model' / 'openclaw-avatar.glb'
OUT.parent.mkdir(parents=True, exist_ok=True)

# ---------- scene ----------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1

# ---------- helpers ----------
def mat(name, color, roughness=0.55, metallic=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        m.blend_method = 'BLEND'
        m.use_screen_refraction = True
    return m

skin = mat('Aiyu warm skin PBR', (0.86, 0.58, 0.47, 1), 0.48)
skin_blush = mat('soft blush', (1.0, 0.38, 0.43, 1), 0.7)
hair_mat = mat('deep graphite hair', (0.045, 0.038, 0.05, 1), 0.34)
cloth = mat('midnight teal tailored suit', (0.025, 0.18, 0.22, 1), 0.62)
cloth2 = mat('inner pearl blouse', (0.88, 0.92, 0.94, 1), 0.52)
black = mat('soft black', (0.005, 0.005, 0.007, 1), 0.4)
white = mat('eye sclera warm white', (0.96, 0.92, 0.86, 1), 0.28)
iris = mat('AI cyan iris', (0.03, 0.46, 0.72, 1), 0.24)
glow = mat('OpenClaw blue glow', (0.1, 0.75, 1.0, 1), 0.2)

# set emission for glow
bsdf = glow.node_tree.nodes.get('Principled BSDF')
try:
    bsdf.inputs['Emission Color'].default_value = (0.1, 0.75, 1.0, 1)
    bsdf.inputs['Emission Strength'].default_value = 1.5
except Exception:
    pass


def shade(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    obj.select_set(False)
    return obj


def add_uv(name, loc, scale, material, seg=64, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return shade(obj)


def add_cube(name, loc, scale, material, bevel=0.05):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('soft bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 8
        obj.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return shade(obj)


def add_cyl(name, loc, radius, depth, material, vertices=48, rot=(0,0,0), scale=(1,1,1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    obj.modifiers.new('soft bevel', 'BEVEL').width = 0.015
    obj.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return shade(obj)


def parent(child, p):
    child.parent = p
    child.matrix_parent_inverse = p.matrix_world.inverted()

# ---------- named control empties (frontend animates these) ----------
def empty(name, loc):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'SPHERE'
    obj.empty_display_size = 0.12
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj

root = empty('AiyuRoot', (0, 0, 0))
torso_ctrl = empty('AiyuTorso', (0, 0, 1.05)); parent(torso_ctrl, root)
neck_ctrl = empty('AiyuNeck', (0, 0, 2.12)); parent(neck_ctrl, torso_ctrl)
head_ctrl = empty('AiyuHead', (0, -0.02, 2.43)); parent(head_ctrl, neck_ctrl)
left_arm_ctrl = empty('AiyuLeftArm', (-0.48, 0, 1.65)); parent(left_arm_ctrl, torso_ctrl)
right_arm_ctrl = empty('AiyuRightArm', (0.48, 0, 1.65)); parent(right_arm_ctrl, torso_ctrl)

# ---------- body ----------
neck = add_cyl('neck warm skin', (0, 0, 2.12), 0.105, 0.28, skin, rot=(0,0,0), scale=(0.86,0.86,1)); parent(neck, neck_ctrl)
chest = add_uv('tailored upper body', (0, 0, 1.46), (0.34, 0.20, 0.50), cloth, 64, 24); parent(chest, torso_ctrl)
waist = add_uv('tailored waist', (0, -0.005, 0.98), (0.25, 0.16, 0.30), cloth, 64, 20); parent(waist, torso_ctrl)
blouse = add_uv('pearl blouse center', (0, -0.205, 1.43), (0.115, 0.020, 0.34), cloth2, 32, 12); parent(blouse, torso_ctrl)
collar_l = add_cube('left angular collar', (-0.105, -0.215, 1.78), (0.105,0.018,0.050), cloth2, 0.018); collar_l.rotation_euler[2]=math.radians(-18); parent(collar_l, torso_ctrl)
collar_r = add_cube('right angular collar', (0.105, -0.215, 1.78), (0.105,0.018,0.050), cloth2, 0.018); collar_r.rotation_euler[2]=math.radians(18); parent(collar_r, torso_ctrl)
core = add_uv('OpenClaw chest core', (0, -0.232, 1.37), (0.032,0.010,0.032), glow, 32, 12); parent(core, torso_ctrl)

# arms/hands
for side, sx, ctrl in [('left', -1, left_arm_ctrl), ('right', 1, right_arm_ctrl)]:
    shoulder = add_uv(f'Aiyu {side} shoulder', (sx*0.36, -0.005, 1.68), (0.085,0.075,0.105), cloth, 32, 16); parent(shoulder, ctrl)
    upper = add_cyl(f'Aiyu {side} upper arm', (sx*0.45, -0.018, 1.30), 0.044, 0.54, cloth, rot=(math.radians(6*sx), 0, math.radians(7*sx)), scale=(0.82,0.72,1)); parent(upper, ctrl)
    fore = add_cyl(f'Aiyu {side} forearm', (sx*0.46, -0.026, 0.88), 0.035, 0.48, skin, rot=(math.radians(5*sx), 0, math.radians(-2*sx)), scale=(0.78,0.70,1)); parent(fore, ctrl)
    hand = add_uv(f'Aiyu {side} hand', (sx*0.46, -0.055, 0.57), (0.045,0.028,0.075), skin, 32, 16); hand.rotation_euler[0]=math.radians(8); parent(hand, ctrl)
    for i in range(4):
        finger = add_cyl(f'Aiyu {side} finger {i+1}', (sx*(0.425+i*0.016), -0.078, 0.465), 0.0055, 0.10, skin, vertices=16, rot=(math.radians(86),0,math.radians(4*sx))); parent(finger, ctrl)

# ---------- head and face ----------
head = add_uv('Aiyu realistic face base', (0, 0, 2.43), (0.235, 0.185, 0.305), skin, 96, 48); parent(head, head_ctrl)
chin = add_uv('soft chin and jaw', (0, -0.012, 2.245), (0.170, 0.145, 0.095), skin, 64, 24); parent(chin, head_ctrl)

# face details
nose = add_uv('defined nose bridge', (0, -0.188, 2.43), (0.030,0.033,0.070), skin, 32, 16); parent(nose, head_ctrl)
nose_tip = add_uv('soft nose tip', (0, -0.208, 2.375), (0.035,0.024,0.026), skin, 32, 16); parent(nose_tip, head_ctrl)
for sx in [-1, 1]:
    eye_white = add_uv(('left' if sx<0 else 'right')+' eye white', (sx*0.080, -0.180, 2.505), (0.034,0.010,0.020), white, 32, 16); parent(eye_white, head_ctrl)
    iris_obj = add_uv(('left' if sx<0 else 'right')+' cyan iris', (sx*0.080, -0.188, 2.505), (0.014,0.0035,0.014), iris, 32, 12); parent(iris_obj, head_ctrl)
    pupil = add_uv(('left' if sx<0 else 'right')+' pupil', (sx*0.080, -0.192, 2.505), (0.0055,0.002,0.0055), black, 24, 8); parent(pupil, head_ctrl)
    brow = add_cube(('left' if sx<0 else 'right')+' eyebrow', (sx*0.080, -0.190, 2.565), (0.044,0.005,0.007), hair_mat, 0.006); brow.rotation_euler[1]=math.radians(0); brow.rotation_euler[2]=math.radians(-7*sx); parent(brow, head_ctrl)
    blush = add_uv(('left' if sx<0 else 'right')+' cheek blush', (sx*0.112, -0.188, 2.385), (0.030,0.006,0.020), skin_blush, 32, 10); parent(blush, head_ctrl)
    ear = add_uv(('left' if sx<0 else 'right')+' ear', (sx*0.215, -0.010, 2.43), (0.025,0.018,0.055), skin, 32, 16); parent(ear, head_ctrl)

upper_lip = add_uv('natural upper lip', (0, -0.198, 2.305), (0.052,0.007,0.010), mat('muted rose upper lip', (0.58,0.18,0.18,1), 0.55), 32, 8); parent(upper_lip, head_ctrl)
lower_lip = add_uv('natural lower lip', (0, -0.201, 2.279), (0.060,0.008,0.012), mat('muted rose lower lip', (0.72,0.27,0.25,1), 0.50), 32, 8); parent(lower_lip, head_ctrl)

# hair cap and bangs
hair_cap = add_uv('smooth shoulder-length hair cap', (0, 0.018, 2.55), (0.252,0.205,0.285), hair_mat, 96, 32); parent(hair_cap, head_ctrl)
# cutaway face impression: add subtle front swept bangs rather than covering the face
for i, (x,z,rot,sc) in enumerate([(-0.095,2.665,-22,(0.030,0.015,0.120)),(-0.028,2.690,-6,(0.032,0.015,0.130)),(0.045,2.685,10,(0.030,0.015,0.120)),(0.110,2.650,24,(0.026,0.014,0.100))]):
    bang = add_uv(f'soft bang strand {i+1}', (x,-0.19,z), sc, hair_mat, 32, 12)
    bang.rotation_euler[0] = math.radians(12)
    bang.rotation_euler[2] = math.radians(rot)
    parent(bang, head_ctrl)
for sx in [-1,1]:
    side_hair = add_uv(('left' if sx<0 else 'right')+' side hair lock', (sx*0.220,-0.035,2.31), (0.036,0.030,0.205), hair_mat, 48, 18)
    side_hair.rotation_euler[1] = math.radians(8*sx)
    parent(side_hair, head_ctrl)

# subtle feet/base shadow for grounding
base = add_cyl('soft hologram base', (0,0,0.18), 0.48, 0.025, mat('transparent blue base', (0.04,0.55,0.80,0.55), 0.35, 0.0, 0.55), vertices=96, scale=(1.0,0.62,1)); parent(base, root)

# ---------- animation keyframes on control nodes ----------
scene.frame_start = 1
scene.frame_end = 96
for frame, val in [(1,0),(48,1),(96,0)]:
    scene.frame_set(frame)
    head_ctrl.rotation_euler = (math.radians(2 + 4*math.sin(val*math.pi)), math.radians(-4 + 8*val), math.radians(-1 + 2*val))
    torso_ctrl.rotation_euler = (math.radians(0), math.radians(-2 + 4*val), math.radians(-1 + 2*val))
    right_arm_ctrl.rotation_euler = (math.radians(-4 + 10*val), math.radians(0), math.radians(-4 - 12*val))
    left_arm_ctrl.rotation_euler = (math.radians(-2 - 4*val), math.radians(0), math.radians(3 + 6*val))
    for obj in [head_ctrl, torso_ctrl, right_arm_ctrl, left_arm_ctrl]:
        obj.keyframe_insert(data_path='rotation_euler', frame=frame)

# ---------- camera/lights for embedded preview if opened in blender ----------
bpy.ops.object.light_add(type='AREA', location=(0,-3.2,4.5))
key_light = bpy.context.object
key_light.name = 'large softbox key light'
key_light.data.energy = 450
key_light.data.size = 4
bpy.ops.object.camera_add(location=(0,-4.7,2.05), rotation=(math.radians(68),0,0))
scene.camera = bpy.context.object

# ---------- cleanup transforms ----------
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
for obj in bpy.context.scene.objects:
    obj.select_set(False)

# ---------- export ----------
bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_animations=True,
    export_lights=False,
    export_cameras=False,
)
print(f'EXPORT_OK {OUT}')
