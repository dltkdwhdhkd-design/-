import type {MapContext} from './map.ts';
import {distance,moveTo,WORLD,type Point} from './map.ts';
export type RemoteSample=Point&{at:number;warp:number;alive:boolean};
// samples: server-stamped positions (at = server/motion time).
// lags: recent (local receive time - sample.at). The receive clock and the server clock
// differ by an unknown constant; it cancels out because the render time is derived from
// the same differences, so no clock synchronisation is needed.
export type RemoteTrack={samples:RemoteSample[];lags:number[];gaps:number[];delay:number;target:number;received:number;rendered?:Point&{at:number};painted?:number;cursor?:number;starved?:number;
 /** @deprecated kept for older callers/tests */ interval:number;offset:number;jitter:number};
const KEEP_MS=3000,LAG_WINDOW=48,MIN_MARGIN=24,MAX_DELAY=900;
function quantile(values:number[],q:number){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(q*s.length))];}
function fresh(s:RemoteSample,received:number):RemoteTrack{return{samples:[s],lags:[received-s.at],gaps:[],delay:0,target:0,received,interval:100,offset:s.at-received,jitter:0};}
// Packet arrivals never directly change the displayed position or reset its clock.
export function pushRemote(old:RemoteTrack|undefined,s:RemoteSample,received=s.at):RemoteTrack{
 const last=old?.samples.at(-1);
 if(!old||!last||last.warp!==s.warp||last.alive!==s.alive)return fresh(s,received);
 if(s.at<=last.at)return old;
 const gap=s.at-last.at,travel=distance(last,s)/WORLD.speed*1000;
 // A sample after a pause must not smear the new movement across the whole pause.
 // Only when the actor was known to be at rest (identical last positions, or a single
 // sample); sparse samples of a moving actor (slow stick, wall sliding) are left alone.
 const prev=old.samples.at(-2),resting=!prev||distance(prev,last)<.5;
 const paused=resting&&gap>travel+160;
 if(paused){const start=s.at-Math.max(40,Math.min(gap,travel*1.05));if(start>last.at)old.samples.push({...last,at:start});}
 old.samples.push(s);
 const keepFrom=s.at-KEEP_MS;while(old.samples.length>3&&old.samples[1].at<keepFrom)old.samples.shift();
 old.lags.push(received-s.at);if(old.lags.length>LAG_WINDOW)old.lags.shift();
 // Sample spacing while moving decides how far ahead of the newest sample we must wait.
 // received - previous sample time = how stale our newest data was just before this
 // arrival; its tail is exactly how far behind the newest sample rendering must stay.
 if(!paused){old.gaps.push(Math.min(received-last.at,old.lags[old.lags.length-1]+1000));if(old.gaps.length>LAG_WINDOW)old.gaps.shift();}
 old.received=received;old.interval=Math.max(0,gap);old.offset=Math.max(old.offset,s.at-received);
 return old;
}
function pointAt(track:RemoteTrack,t:number,count:MapContext):Point&{starved:number}{
 const a=track.samples;if(t<=a[0].at)return{...a[0],starved:0};
 for(let i=1;i<a.length;i++)if(t<=a[i].at){const p=a[i-1],q=a[i],u=(t-p.at)/(q.at-p.at);return{...moveTo(p,{x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u},distance(p,q)*u,count),starved:0};}
 const last=a.at(-1)!,over=t-last.at;if(a.length<2||!last.alive)return{...last,starved:over};
 // Short, bounded extrapolation (150 ms) while the next sample is late; then hold.
 const prev=a.at(-2)!,ms=last.at-prev.at,extra=Math.min(150,over);
 if(ms<=0||distance(prev,last)<.01)return{...last,starved:over};
 const v=Math.min(WORLD.speed,distance(prev,last)/(ms/1000));
 return{...moveTo(last,{x:last.x+(last.x-prev.x)/distance(prev,last)*v*extra/1000,y:last.y+(last.y-prev.y)/distance(prev,last)*v*extra/1000},v*extra/1000,count),starved:over};
}
// Jitter buffer: render at (now - delay) where delay covers the late tail of recent
// arrivals plus one sample interval. Delay changes are rate-limited (playback 0.85x-1.25x)
// so jitter never makes an actor jump, freeze or run backwards.
export function sampleRemote(track:RemoteTrack,now:number,count:MapContext):Point&{at:number}{
 // lags include an unknown clock constant; only their spread above the fastest path matters.
 const base=Math.min(...track.lags),need=track.gaps.length>=3?quantile(track.gaps,.85)-base+12:quantile(track.lags,.95)-base+112;
 track.target=base+Math.max(MIN_MARGIN,Math.min(MAX_DELAY,need));
 if(track.painted===undefined){track.delay=track.target;track.painted=now;const t=Math.max(track.samples[0].at,now-track.delay);track.cursor=t;const p=pointAt(track,t,count);track.rendered={x:p.x,y:p.y,at:t};return track.rendered;}
 // Real elapsed time (bounded): at 7-15 fps a 50 ms cap made remote actors walk at half speed
 // and fall further and further behind (measured in headless Chromium at 7.5 fps).
 const dt=Math.max(0,Math.min(250,now-track.painted));track.painted=now;
 // Rendering further behind than needed across a stretch where the actor stood still (an
 // idle actor's first sample carries its old motion time, which inflates the delay until it
 // moves): skip that stretch at once. Nothing moves in it, so nothing visibly jumps; without
 // this the excess drained at 0.15x and observers saw the actor 1-2 s late after it started.
 if(track.delay>track.target){
  const cur=Math.max(track.cursor??-Infinity,now-track.delay),want=now-track.target,here=pointAt(track,cur,count),a=track.samples;
  let still=Infinity;for(let i=0;i<a.length;i++){if(a[i].at<=cur)continue;if(distance(a[i],here)>.5){still=i>0?Math.max(cur,a[i-1].at):cur;break;}}
  const to=Math.min(want,still);if(to>cur)track.delay=now-to;
 }
 const diff=track.target-track.delay;track.delay+=diff>0?Math.min(diff,dt*.25):Math.max(diff,-dt*.15);
 // Never move the render clock backwards.
 const t=Math.max(track.cursor??-Infinity,now-track.delay);track.cursor=t;
 const goal=pointAt(track,t,count);track.starved=goal.starved;
 const pos=moveTo(track.rendered!,goal,WORLD.speed*1.3*dt/1000,count);
 track.rendered={...pos,at:t};return track.rendered;
}
