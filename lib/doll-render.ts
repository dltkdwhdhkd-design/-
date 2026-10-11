import * as T from 'three';
// One transient WebGL renderer for every offscreen doll render (selection portraits and the
// top-view sprite sheets), never one context per card. Jobs run one at a time; the context
// is released shortly after the last job.
let renderer:T.WebGLRenderer|undefined,idle:ReturnType<typeof setTimeout>|undefined,queue:Promise<unknown>=Promise.resolve();
export function withDollRenderer<R>(job:(r:T.WebGLRenderer)=>R|Promise<R>):Promise<R>{
 const run=queue.then(async()=>{
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));clearTimeout(idle);
  renderer||=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  try{return await job(renderer);}finally{idle=setTimeout(()=>{renderer?.dispose();renderer?.forceContextLoss();renderer=undefined;},1200);}
 });
 queue=run.then(()=>{},()=>{});return run;
}
