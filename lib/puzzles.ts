import {scienceProblem,type ScienceKind} from './science.ts';
import type { Puzzle } from './map';
const random=(max:number)=>crypto.getRandomValues(new Uint32Array(1))[0]%max;
export function puzzleSolution(kind:Puzzle):number[]{
 if(kind.startsWith('science_'))return [random(4)];
 if(kind==='wires')return [0,1,2,3].sort(()=>random(3)-1);
 if(kind==='code')return Array.from({length:4},()=>random(10));
 if(kind==='sequence')return [1,2,3,4,5,6];
 if(kind==='pattern'){const pool=[0,1,2,3,4,5,6,7,8];for(let i=8;i>0;i--){const j=random(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,4).sort((a,b)=>a-b);}
 if(kind==='calibrate')return [50];
 if(kind==='align')return Array.from({length:3},()=>20+random(61));
 if(kind==='switches')return Array.from({length:6},()=>random(2));
 if(kind==='asteroids')return [0,1,2,3,4,5,6,7];
 if(kind==='filter')return [0,1,2,3,4,5];
 if(kind==='swipe')return [900];
 return [100];
}
export function puzzleDuration(kind:Puzzle){return kind==='upload'?6500:kind==='fuel'?4500:1800;}
export function puzzleCorrect(kind:Puzzle,solution:number[],answer:number[]){
 if(!Array.isArray(answer)||answer.length>12||answer.some(n=>!Number.isFinite(n)))return false;
 if(kind.startsWith('science_'))return JSON.stringify(answer)===JSON.stringify(scienceProblem(kind as ScienceKind,solution[0]).answer);
 if(kind==='calibrate')return answer.length===3&&answer.every(n=>n>=43&&n<=57);
 if(kind==='swipe')return answer.length===1&&answer[0]>=450&&answer[0]<=1500;
 if(kind==='align')return answer.length===3&&answer.every((v,i)=>Math.abs(v-solution[i])<=3);
 return JSON.stringify(answer)===JSON.stringify(solution);
}
