import type {MapContext} from './map.ts';
import {population,mapIdentity,mapFor,sight,distance,type Point} from './map.ts';
export function securityConsole(count:MapContext){const rooms=mapFor(count).locations,r=rooms.find(r=>r.id==='security')||rooms.find(r=>r.id==='control')!;return {x:r.x+r.w*.32,y:r.y+r.h*.7,room:r.name};}
export function communicationsConsole(count:MapContext){const r=mapFor(count).locations.find(r=>r.id==='comms')!;return{x:r.x+r.w*.45,y:r.y+r.h*.76,room:r.name};}
function buildCameras(count:MapContext){const rooms=mapFor(count).locations,ids=['lab','power','comms','medical',...(population(count)>10?['security','loading']:[]),...(population(count)>20?['navigation','hangar']:[])];return ids.map((id,i)=>{const r=rooms.find(r=>r.id===id)!;return{id,number:i+1,name:r.name,x:r.x+r.w/2,y:r.y+r.h*.6,w:640,h:420,mount:{x:r.x+r.w*.64,y:r.y+28}};});}
export function cameraSees(camera:ReturnType<typeof camerasFor>[number],p:Point,count:MapContext){return Math.abs(p.x-camera.x)<=camera.w/2&&Math.abs(p.y-camera.y)<=camera.h/2&&sight(camera,p,count);}
export function atSecurity(p:Point,count:MapContext){const console=securityConsole(count);return distance(p,console)<=100&&sight(p,console,count);}

const cameraCache=new Map<string,ReturnType<typeof buildCameras>>();
export function camerasFor(count:MapContext){const key=mapIdentity(count)+':'+population(count);let cameras=cameraCache.get(key);if(!cameras){cameras=buildCameras(count);cameraCache.set(key,cameras);}return cameras;}
