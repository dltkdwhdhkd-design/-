import type {Point} from './map.ts';
export const INPUT_STEP_MS=20;
const directions:Record<string,Point>={KeyW:{x:0,y:-1},ArrowUp:{x:0,y:-1},KeyS:{x:0,y:1},ArrowDown:{x:0,y:1},KeyA:{x:-1,y:0},ArrowLeft:{x:-1,y:0},KeyD:{x:1,y:0},ArrowRight:{x:1,y:0}};
export function movementKey(code:string){return Object.hasOwn(directions,code);}
export function movementVector(held:Set<string>,stick:Point={x:0,y:0}):Point{let x=stick.x,y=stick.y;const up=held.has('KeyW')||held.has('ArrowUp'),down=held.has('KeyS')||held.has('ArrowDown'),left=held.has('KeyA')||held.has('ArrowLeft'),right=held.has('KeyD')||held.has('ArrowRight');x+=Number(right)-Number(left);y+=Number(down)-Number(up);const scale=Math.max(1,Math.hypot(x,y));return{x:x/scale,y:y/scale};}
export function inputSteps(remainder:number,delta:number){const total=remainder+Math.max(0,Math.min(100,delta)),steps=Math.floor((total+1e-7)/INPUT_STEP_MS);return{steps,remainder:Math.max(0,total-steps*INPUT_STEP_MS)};}
