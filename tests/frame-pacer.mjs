import assert from 'node:assert/strict';
import {framePacer,qualityGovernor} from '../lib/frame-pacer.ts';
// Simulated displays: rAF fires every refresh (with a little timestamp jitter). Every drawn
// frame must be the same length (a whole number of refreshes), at the highest rate <= ~target.
const run=(hz,target,seconds=3,jitter=.3)=>{const pacer=framePacer(target),period=1000/hz,drawn=[];let seed=7;const rand=()=>((seed=seed*16807%2147483647)/2147483647-.5)*2*jitter;
 for(let i=1;i<=hz*seconds;i++){const t=i*period+rand();if(pacer.due(t))drawn.push(t);}
 const gaps=drawn.slice(30).map((t,i,a)=>i?t-a[i-1]:null).filter(Boolean),fps=gaps.length/((drawn.at(-1)-drawn[30])/1000);
 return{fps:Math.round(fps),even:Math.max(...gaps)-Math.min(...gaps)<period*.5};};
// The v22 test (draw when at least 1000/60-1 ms passed) for comparison.
const old=(hz)=>{const period=1000/hz;let last=0,n=0,first=0,end=0;for(let i=1;i<=hz*3;i++){const t=i*period;if(t-last>=1000/60-1){last=t;if(!first)first=t;end=t;n++;}}return Math.floor((n-1)/((end-first)/1000)+.01);};
const expect={60:60,75:75,90:90,120:60,144:72,165:55,240:60};
for(const [hz,fps] of Object.entries(expect)){const r=run(+hz,60);assert.ok(r.even,`${hz} Hz frames must be even`);assert.ok(Math.abs(r.fps-fps)<=1,`${hz} Hz: ${r.fps} fps, expected ${fps}`);}
for(const hz of [60,90,120,144]){const r=run(hz,30);assert.ok(r.even);assert.ok(Math.abs(r.fps-(hz===144?29:30))<=1,`${hz} Hz at 30: ${r.fps}`);}
assert.equal(old(75),37);assert.equal(old(90),45);assert.equal(old(144),48);
// A device slower than the screen draws on every callback (never skips a ready frame).
{const pacer=framePacer(60);let drawn=0;for(let i=1;i<=120;i++)if(pacer.due(i*33.4))drawn++;assert.ok(drawn>=118);}
// ... also when its frame times vary (mostly 67-83 ms, sometimes one or two refreshes): no
// callback is skipped (a quantile-based refresh estimate skipped the quick ones).
{const pacer=framePacer(60),gaps=[66.7,83.3,66.7,33.3,83.3,66.7,16.7,83.3];let t=0,skipped=0;for(let i=0;i<400;i++){t+=gaps[i%gaps.length];if(!pacer.due(t)&&i>8)skipped++;}assert.equal(skipped,0,'slow, uneven device skipped frames');}
// Governor: a GPU that needs 26 ms per frame at full resolution (cost ~ pixels = scale^2) on a
// 60 Hz screen. It must settle at a resolution that fits the 16.7 ms slot.
const slots=(g,ms)=>Math.max(g.target===30?2:1,Math.ceil(ms*g.scale*g.scale/16.67-1e-9));
{const g=qualityGovernor(1);let t=0,changes=0;for(let i=0;i<1500;i++){t+=slots(g,26)*16.67;if(g.frame(t,g.target===30?33.33:16.67))changes++;}
 assert.equal(g.target,60);assert.ok(26*g.scale*g.scale<=16.7,`settled scale ${g.scale.toFixed(2)}`);assert.ok(changes<=6,`few changes (${changes})`);}
// A GPU that cannot make 60 fps even at the lowest resolution holds a steady 30 instead.
{const g=qualityGovernor(1);let t=0,changes=0;for(let i=0;i<1500;i++){t+=slots(g,60)*16.67;if(g.frame(t,g.target===30?33.33:16.67)&&t<20000)changes++;}
 assert.equal(g.target,30);assert.ok(g.scale<=.61);assert.ok(changes<=2,`far over budget: straight to the smallest size, then 30 fps (${changes} changes)`);}
// A fast GPU never loses resolution.
{const g=qualityGovernor(1);let t=0;for(let i=0;i<1500;i++){t+=16.67;g.frame(t,16.67);}assert.equal(g.scale,1);assert.equal(g.target,60);}
console.log(`PASS: even frame pacing at 60/75/90/120/144/165/240 Hz (v22 cap: 75 Hz -> ${old(75)} fps, 90 Hz -> ${old(90)} fps, 144 Hz -> ${old(144)} fps), 30 fps lock pacing, slow devices never skip, quality governor settles / locks 30 / keeps full resolution.`);
