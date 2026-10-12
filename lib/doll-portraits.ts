import * as T from 'three';
import {createDoll,DOLL} from './doll-character';
import {stageLights} from './doll-stage';
import {withDollRenderer,DOLL_CANVAS} from './doll-render';
const cache=new Map<number,Promise<string>>(),wanted=new Map<number,number>();
// The card shows the figure exactly as other players see it in the 3D map: same model, same
// light rig, tone mapping and floor, seen from first-person eye height at a few steps.
// A portrait is only rendered while some card still waits for it: cards pass a signal that
// aborts when they unmount, and a queued job nobody waits for is dropped (the avatar picker
// of a player who rejoins straight into a game used to keep rendering 16 portraits in play).
export function dollPortrait(index:number,signal?:AbortSignal):Promise<string>{const id=((index%16)+16)%16;wanted.set(id,(wanted.get(id)||0)+1);signal?.addEventListener('abort',()=>wanted.set(id,(wanted.get(id)||1)-1),{once:true});const cached=cache.get(id);if(cached)return cached;
 const result=withDollRenderer(async renderer=>{if(!wanted.get(id))throw new DOMException('portrait no longer shown','AbortError');
  const scene=new T.Scene();scene.background=new T.Color('#102c40');const camera=new T.PerspectiveCamera(34,DOLL_CANVAS.width/DOLL_CANVAS.height,.1,30);camera.position.set(1.3,1.43,-3.2);camera.lookAt(0,DOLL.height*.53,0);
  stageLights(scene);
  const doll=createDoll(id);doll.head.rotation.y=-.08;scene.add(doll.root);
  const floor=new T.Mesh(new T.CircleGeometry(.62,40),new T.MeshLambertMaterial({color:'#485d64'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
  // Encoded off the main thread (toBlob) rather than with the blocking toDataURL.
  renderer.render(scene,camera);const blob=await new Promise<Blob|null>(resolve=>renderer.domElement.toBlob(resolve,'image/webp',.93));doll.dispose();floor.geometry.dispose();floor.material.dispose();if(!blob)throw Error('portrait');return URL.createObjectURL(blob);});
 cache.set(id,result);result.catch(()=>cache.delete(id));return result;}
