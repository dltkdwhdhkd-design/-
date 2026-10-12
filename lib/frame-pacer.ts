// Frame pacing for the game loops (2D field and 3D first person).
//
// Drawing on every display refresh up to the target rate, and on every 2nd/3rd/... refresh
// above it, keeps every frame the same length. The old test "at least 15.7 ms since the last
// frame" alternated 1- and 2-refresh frames on 75/90/144 Hz screens (75 Hz -> 37 fps), which
// reads as judder even when the average rate looks fine.
export type Pacer={due(time:number):boolean;refresh():number;interval():number;target:number};
export function framePacer(target=60):Pacer{
 const deltas:number[]=[];let lastTick=0,lastFrame=0,refresh=1000/60,every=1;
 const pacer:Pacer={target,
  due(time){
   // The refresh interval is the shortest recent rAF delta: slow frames (2+ refreshes) do not
   // move it, so a device slower than its screen draws on every callback and never skips a
   // frame that is ready (a quantile was inflated by slow frames and skipped the fast ones).
   if(lastTick){const d=time-lastTick;if(d>4&&d<100){deltas.push(d);if(deltas.length>30)deltas.shift();if(deltas.length>=4)refresh=Math.min(...deltas);}}
   lastTick=time;every=Math.max(1,Math.floor(1000/pacer.target/refresh+.25));
   if(lastFrame&&time-lastFrame<refresh*(every-.5))return false;
   lastFrame=time;return true;},
  refresh:()=>refresh,interval:()=>refresh*every};
 return pacer;
}

// Keeps the 3D view smooth on slow GPUs: when frames keep missing their slot, render fewer
// pixels (down to 60 %); if that is still not enough, hold a steady 30 fps instead of an
// uneven 40-50. Recovers quality when there is headroom again. Changes are rate-limited so
// the picture never flickers between sizes.
export type Governor={frame(time:number,interval:number):boolean;scale:number;target:number};
export function qualityGovernor(start=1,{min=.6,step=.9,grow=1.05}={}):Governor{
 // ceiling: the last scale that missed frames; growth stays just under it and the ceiling
 // relaxes by 4 % every 30 s. A failed probe returns straight to the last scale that held
 // (good), and retries of 60 fps after a 30 fps lock back off (20 s, 40 s, ... 160 s).
 let window:number[]=[],lastDrawn=0,changedAt=0,lockedAt=0,retry=20000,ceiling=1,ceilingAt=0,streak=0,good=0;
 const g:Governor={scale:start,target:60,
  // Called for every drawn frame with the interval the pacer is aiming for; returns true when
  // scale or target changed (the caller resizes the drawing buffer).
  frame(time,interval){
   if(lastDrawn)window.push((time-lastDrawn)/interval);lastDrawn=time;
   if(window.length<40||time-changedAt<1200)return false;
   const sorted=[...window].sort((a,b)=>a-b),missed=window.filter(r=>r>1.45).length/window.length,median=sorted[sorted.length>>1];window=[];
   if(missed>.2){changedAt=time;streak=0;
    if(g.target===60&&lockedAt){g.target=30;lockedAt=time;retry=Math.min(160000,retry*2);return true;}
    // Far over budget (most frames take 3+ slots): go straight to the smallest size, one resize
    // instead of five (each resize reallocates the drawing buffer).
    if(g.scale>min+.001){ceiling=g.scale;ceilingAt=time;g.scale=median>2.5?min:good&&good<g.scale?good:Math.max(min,g.scale*step);if(good>=ceiling)good=0;return true;}
    if(g.target>30){g.target=30;lockedAt=time;return true;}
    return false;}
   if(missed>=.03){streak=0;return false;}
   if(++streak>=2&&g.target===60)good=g.scale;
   if(ceiling<1&&time-ceilingAt>30000){ceiling=Math.min(1,ceiling*1.04);ceilingAt=time;}
   if(g.target<60&&time-lockedAt>retry){g.target=60;changedAt=time;return true;}
   if(g.target===60&&streak>=2&&g.scale<Math.min(1,ceiling*.97)-.001){g.scale=Math.min(ceiling*.97,g.scale*grow,1);changedAt=time;streak=0;return true;}
   if(g.target===60&&lockedAt&&streak>=2)lockedAt=0;
   return false;}};
 return g;
}
