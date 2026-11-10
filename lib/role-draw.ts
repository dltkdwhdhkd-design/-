// Randomize both participants and role slots, then maximize assignments that
// differ from the previous round. Counts are preserved, including repeated roles.
function shuffle<T>(items:T[]):T[]{
 for(let i=items.length-1;i>0;i--){const limit=2**32-2**32%(i+1);let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%(i+1);[items[i],items[j]]=[items[j],items[i]];}
 return items;
}
export function drawRoles<T extends string>(deck:T[],previous:(T|null|undefined)[]):T[]{
 if(deck.length!==previous.length)throw Error('Role count must match players');
 const slots=shuffle([...deck]),order=shuffle(previous.map((_,i)=>i));
 const owner=slots.map(()=>-1),assigned=previous.map(()=>-1);
 const edges=previous.map(last=>shuffle(slots.map((_,i)=>i).filter(i=>slots[i]!==last)));
 function match(player:number,seen:Set<number>):boolean{
  for(const slot of edges[player]){if(seen.has(slot))continue;seen.add(slot);if(owner[slot]===-1||match(owner[slot],seen)){owner[slot]=player;assigned[player]=slot;return true;}}
  return false;
 }
 for(const player of order)match(player,new Set());
 const spare=shuffle(owner.map((p,i)=>p===-1?i:-1).filter(i=>i>=0));
 for(const player of order)if(assigned[player]===-1)assigned[player]=spare.pop()!;
 return assigned.map(i=>slots[i]);
}
