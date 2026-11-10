import type {MapContext} from './map.ts';
import {distance,sight,type Point} from './map.ts';
export type VisiblePeer=Point&{id:string;alive:boolean;vented?:boolean;invisible?:boolean};
export type Presence<T extends VisiblePeer>={person:T;seen:number;missingAt?:number};
// Only hold an already observed pose briefly. Never make stale actors valid attack targets.
export function updatePresence<T extends VisiblePeer>(cache:Record<string,Presence<T>>,people:T[],now:number,hidden:Iterable<string>=[]){
 const ids=new Set(people.map(p=>p.id)),hide=new Set(hidden);
 for(const [id,entry] of Object.entries(cache)){
  if(hide.has(id)){delete cache[id];continue;}
  if(!ids.has(id)){entry.missingAt??=now;if(now-entry.missingAt>1200)delete cache[id];}
 }
 for(const person of people)cache[person.id]={person,seen:now};
}
export function retainedPeers<T extends VisiblePeer>(cache:Record<string,Presence<T>>,now:number,own:Point,radius:number,count:MapContext):T[]{
 return Object.values(cache).filter(e=>e.missingAt!==undefined&&now-e.missingAt<220&&e.person.alive&&!e.person.invisible&&!e.person.vented&&distance(own,e.person)<=radius&&sight(own,e.person,count)).map(e=>e.person);
}
export function presenceOpacity<T extends VisiblePeer>(entry:Presence<T>|undefined,now:number){return entry?.missingAt===undefined?1:Math.max(0,Math.min(1,(220-(now-entry.missingAt))/100));}
