import * as T from 'three';
import {createDoll,DOLL} from './doll-character';
import {stageLights} from './doll-stage';
import {withDollRenderer} from './doll-render';
const cache=new Map<number,Promise<string>>();
// The card shows the figure exactly as other players see it in the 3D map: same model, same
// light rig, tone mapping and floor, seen from first-person eye height at a few steps.
export function dollPortrait(index:number):Promise<string>{const id=((index%16)+16)%16;const cached=cache.get(id);if(cached)return cached;
 const result=withDollRenderer(renderer=>{renderer.setSize(384,448);
  const scene=new T.Scene();scene.background=new T.Color('#102c40');const camera=new T.PerspectiveCamera(34,384/448,.1,30);camera.position.set(1.3,1.43,-3.2);camera.lookAt(0,DOLL.height*.53,0);
  stageLights(scene);
  const doll=createDoll(id);doll.head.rotation.y=-.08;scene.add(doll.root);
  const floor=new T.Mesh(new T.CircleGeometry(.62,40),new T.MeshLambertMaterial({color:'#485d64'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
  renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/webp',.93);doll.dispose();floor.geometry.dispose();floor.material.dispose();return url;});
 cache.set(id,result);result.catch(()=>cache.delete(id));return result;}
