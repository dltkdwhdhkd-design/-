import * as T from 'three';
// One WebGL renderer for every offscreen doll render (selection portraits and the top-view
// sprite sheets), never one context per card. Jobs run one per frame as early as possible:
// most of them then finish while the lobby or the game is still loading (deferring them to
// idle time moved the same work into the first seconds of play, measured). The canvas
// keeps one size (DOLL_CANVAS; sprite frames use a corner of it): resizing it for every job
// reallocated the drawing buffer each time. Shaders compile without blocking error checks. The context
// is kept while jobs keep coming and released after a long quiet spell or when the page is
// hidden; it is never force-lost (WEBGL_lose_context blocked the main thread for 120-150 ms
// in the middle of play, measured in headless Chromium).
// The canvas is kept, so a renderer made again later reuses the same WebGL context instead of
// piling up contexts that only garbage collection would free.
let renderer:T.WebGLRenderer|undefined,canvas:HTMLCanvasElement|undefined,idle:ReturnType<typeof setTimeout>|undefined,queue:Promise<unknown>=Promise.resolve();
const release=()=>{renderer?.dispose();renderer=undefined;};
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(idle);queue=queue.then(release,release);}});
export const DOLL_CANVAS={width:384,height:448};
export function withDollRenderer<R>(job:(r:T.WebGLRenderer)=>R|Promise<R>):Promise<R>{
 const run=queue.then(async()=>{
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));clearTimeout(idle);
  canvas||=document.createElement('canvas');if(!renderer){renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.debug.checkShaderErrors=false;renderer.setPixelRatio(1);renderer.setSize(DOLL_CANVAS.width,DOLL_CANVAS.height,false);}
  renderer.setViewport(0,0,DOLL_CANVAS.width,DOLL_CANVAS.height);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  try{return await job(renderer);}finally{idle=setTimeout(release,30000);}
 });
 queue=run.then(()=>{},()=>{});return run;
}
