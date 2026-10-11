import * as T from 'three';
import {createDoll,DOLL} from './doll-character';
import {stageLights} from './doll-stage';
import {withDollRenderer} from './doll-render';
import {DOLL_FRAMES,type DollSheet} from './characters';
// Top-view (Aurora) character frames rendered from the same 3D figure as the 3D map and the
// selection portraits, with the same lights. Frames face right; the 2D renderer mirrors them.
const W=170,H=190,UNIT=80,ELEVATION=.38,TURN=.78;
const cache=new Map<number,Promise<DollSheet>>();
export function dollSheet(index:number):Promise<DollSheet>{const id=((index%16)+16)%16;const cached=cache.get(id);if(cached)return cached;
 const result=withDollRenderer(renderer=>{renderer.setSize(W,H);renderer.setClearColor(0x000000,0);
  const scene=new T.Scene();stageLights(scene);
  const camera=new T.OrthographicCamera(-W/2/UNIT,W/2/UNIT,H/2/UNIT,-H/2/UNIT,.1,30),target=new T.Vector3(0,.93,0);
  camera.position.copy(target).add(new T.Vector3(0,Math.sin(ELEVATION),-Math.cos(ELEVATION)).multiplyScalar(8));camera.lookAt(target);camera.updateMatrixWorld();
  const foot=new T.Vector3(0,0,0).project(camera),footX=(foot.x+1)/2*W,footY=(1-foot.y)/2*H;
  const doll=createDoll(id);doll.shadow.visible=false;scene.add(doll.root);
  const sheet=document.createElement('canvas');sheet.width=W*DOLL_FRAMES;sheet.height=H;const ctx=sheet.getContext('2d')!;
  // 0 idle · 1-4 walk (same limb swing as the 3D map) · 5 knife strike · 6 strike without knife
  const strides=[0,.5,.18,-.5,-.18];
  for(let f=0;f<DOLL_FRAMES;f++){
   const stride=f<5?strides[f]:0,strike=f>=5;
   doll.root.rotation.y=strike?TURN+.45:TURN;doll.legs[0].rotation.x=stride;doll.legs[1].rotation.x=-stride;doll.arms[0].rotation.x=-stride*.65;doll.arms[1].rotation.x=strike?2.0:stride*.65;doll.knife.visible=f===5;
   renderer.clear();renderer.render(scene,camera);ctx.drawImage(renderer.domElement,f*W,0);
  }
  doll.dispose();
  return{image:sheet,frameW:W,frameH:H,footX,footY,scale:94/(DOLL.height*Math.cos(ELEVATION)*UNIT)};
 });
 cache.set(id,result);result.catch(()=>cache.delete(id));return result;}
