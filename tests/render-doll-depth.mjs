// Offline geometry inspection with depth buffering (no browser or WebGL needed).
import * as T from 'three';
import {createDoll} from '../lib/doll-character.ts';
import {writeFileSync} from 'node:fs';
const scene=new T.Scene(),camera=new T.OrthographicCamera(-2.1,2.1,1.4,-1.4,.1,20);
camera.position.set(0,1.35,-6);camera.lookAt(0,.96,0);camera.updateMatrixWorld();
for(let i=0;i<3;i++){const d=createDoll(0);d.root.position.x=(i-1)*1.35;d.root.rotation.y=[0,-.65,-1.57][i];scene.add(d.root);}
scene.updateMatrixWorld(true);const triangles=[];
scene.traverse(o=>{if(!o.isMesh||!o.visible||!o.parent.visible||o.material.transparent)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=g.attributes.position,normal=g.attributes.normal;const nm=new T.Matrix3().getNormalMatrix(o.matrixWorld);
for(let i=0;i<p.count;i+=3){const v=[],n=new T.Vector3();for(let j=0;j<3;j++){const q=new T.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(o.matrixWorld).project(camera);v.push([(q.x+1)*420,(1-q.y)*280,q.z]);n.add(new T.Vector3().fromBufferAttribute(normal,i+j).applyMatrix3(nm));}n.normalize();const lit=o.material.isMeshBasicMaterial?1:.62+Math.max(0,n.dot(new T.Vector3(-.3,.6,-.8).normalize()))*.48,c=o.material.color.clone().multiplyScalar(lit).convertLinearToSRGB();triangles.push([v,[c.r*255,c.g*255,c.b*255]]);}});
writeFileSync('/workspace/doll-triangles.json',JSON.stringify(triangles));
