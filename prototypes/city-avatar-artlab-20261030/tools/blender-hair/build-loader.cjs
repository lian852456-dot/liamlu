// Wrap the pinned r170 ES module for the existing single THREE instance.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
let s=fs.readFileSync(path.join(__dirname,'GLTFLoader.r170.js'),'utf8');
s=s.replace("} from 'three';",'} = root.THREE;').replace('import {','const {');
const u=fs.readFileSync(path.join(__dirname,'BufferGeometryUtils.r170.js'),'utf8');
const f=u.slice(u.indexOf('function toTrianglesDrawMode('),u.indexOf('/**\n * Calculates the morphed'));
s=s.replace("import { toTrianglesDrawMode } from '../utils/BufferGeometryUtils.js';",'const {TrianglesDrawMode}=root.THREE;\n'+f).replace('export { GLTFLoader };','root.CozyGLTFLoader=GLTFLoader;');
fs.writeFileSync(path.join(root,'gltf-loader.js'),'/* three.js r170 GLTFLoader + toTrianglesDrawMode, MIT.\n * Upstream source and reproducible wrapper: tools/blender-hair/. */\n(function(root){\n'+s+'\n})(globalThis);\n');
