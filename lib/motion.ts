import type {MapContext} from './map.ts';
import {moveTo,WORLD,type Point} from './map.ts';
export type MoveInput={n:number;dx:number;dy:number;ms:number};
export type MotionPose=Point&{ack:number;clock:number};
export function stepInput(p:Point,input:MoveInput,count:MapContext):Point {const magnitude=Math.max(1,Math.hypot(input.dx,input.dy)),seconds=input.ms/1000;return moveTo(p,{x:p.x+input.dx/magnitude*WORLD.speed*seconds,y:p.y+input.dy/magnitude*WORLD.speed*seconds},WORLD.speed*seconds,count);}
export function replayInputs(p:Point,inputs:MoveInput[],count:MapContext):Point {for(const input of inputs)p=stepInput(p,input,count);return p;}
// The acknowledged input number, not the age of an HTTP response, determines what to replay.
export function reconcileMotion(server:Point&{ack?:number},pending:MoveInput[],count:MapContext){const remaining=pending.filter(i=>i.n>(server.ack||0));return {pending:remaining,position:replayInputs(server,remaining,count)};}
export function consumeInputs(old:MotionPose,raw:unknown,now:number,count:MapContext):MotionPose {let pose={...old,clock:Math.max(old.clock,now-3000)};if(!Array.isArray(raw)||raw.length>200)return pose;for(const value of raw){const i=value as MoveInput;if(!i||!Number.isSafeInteger(i.n)||!Number.isFinite(i.ms)||!Number.isFinite(i.dx)||!Number.isFinite(i.dy)||i.ms<=0||i.ms>50||Math.abs(i.dx)>1||Math.abs(i.dy)>1)break;if(i.n<=pose.ack)continue;if(i.n!==pose.ack+1||pose.clock+i.ms>now+100)break;pose={...stepInput(pose,i,count),ack:i.n,clock:pose.clock+i.ms};}return pose;}
