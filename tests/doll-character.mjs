import assert from 'node:assert/strict';
import * as T from 'three';
import {createDoll} from '../lib/doll-character.ts';
import {configOf} from '../lib/game.ts';
import {readFileSync} from 'node:fs';
let maxMeshes=0,maxTriangles=0;
// v22 figure proportions: 1.6-1.9 tall (bun included), head about half of the height,
// one mesh per joint group and material kind, shared materials, bounded triangle count.
const materials=new Set();
for(let i=0;i<16;i++){const d=createDoll(i);d.root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(d.root),head=new T.Box3().setFromObject(d.head);assert.ok(bounds.max.y>1.6&&bounds.max.y<1.9,`height ${bounds.max.y}`);assert.ok((head.max.y-head.min.y)/bounds.max.y>.45,'big figure head');assert.ok(bounds.min.y>-.01&&bounds.min.y<.03,'stands on the floor');assert.ok(bounds.max.x-bounds.min.x>.85);assert.equal(d.arms.length,2);assert.equal(d.legs.length,2);assert.ok(d.arms.every(a=>a.position.y>.7)&&d.legs.every(l=>l.position.y>.3&&l.position.y<.5),'shoulder and hip pivots');let meshes=0,triangles=0;d.root.traverse(o=>{if(o instanceof T.Mesh){meshes++;materials.add(o.material);const p=o.geometry.attributes.position;triangles+=(o.geometry.index?.count||p.count)/3;assert.ok(p.array.every(Number.isFinite));assert.ok(o.geometry.attributes.normal);}});maxMeshes=Math.max(maxMeshes,meshes);maxTriangles=Math.max(maxTriangles,triangles);assert.ok(meshes<=12,'static parts must be merged per joint group');assert.ok(triangles<20000,`triangle budget (${triangles})`);d.dispose();}
assert.ok(materials.size<=4,`all figures share their materials (${materials.size})`);
assert.equal(configOf({mapId:'nereid',viewMode:'topdown'}).viewMode,'fps');
for(const file of ['components/FirstPersonViewport.tsx','components/FieldGame.tsx']){const text=readFileSync(file,'utf8');assert.ok(!/onFallback|setFps|2D 전환/.test(text));}
console.log(`PASS: all 16 doll rigs, finite geometry, figure proportions (head ≈ half), shared materials, animated limbs, max ${maxMeshes} meshes / ${maxTriangles} triangles, legacy Nereid forced to 3D, no 2D switch.`);
