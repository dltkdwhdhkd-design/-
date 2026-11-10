// Simulated client <-> edge network. Each direction is a FIFO stream (WebSocket over
// TCP), so a delayed segment (loss + retransmission) also delays everything behind it.
export function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export class Link{
 constructor({base=20,jitter=8,loss=0,rto=[200,500],random=Math.random}={}){Object.assign(this,{base,jitter,loss,rto,random});this.last=0;this.throttle=0;this.pending=[];}
 delay(){const r=this.random;let d=this.base+(r()*2-1)*this.jitter;if(this.loss&&r()<this.loss)d+=this.rto[0]+r()*(this.rto[1]-this.rto[0]);return Math.max(1,d);}
 // Returns when the message reaches the far end. FIFO: never before the previous one.
 schedule(fn){const now=performance.now(),at=Math.max(this.last+.01,now+this.delay());this.last=at;setTimeout(fn,at-now);}
}
// Browser-like client socket bound to one server isolate.
export function socketPair({up,down,acceptOn,onServerCreated}){
 const listeners={message:[],close:[],error:[]};let serverOpen=true,clientOpen=false;
 const client={readyState:0,bufferedAmount:0,onopen:null,onmessage:null,onclose:null,onerror:null,hidden:false,_held:null,_heldTimer:null,
  send(data){if(client.readyState!==1)return;
   // A hidden browser tab runs its timers at most once per second; model by coalescing.
   if(client.hidden){client._held=data;if(!client._heldTimer)client._heldTimer=setTimeout(()=>{client._heldTimer=null;const d=client._held;client._held=null;if(d&&client.readyState===1)up.schedule(()=>serverSide.deliver(d));},1000);return;}
   up.schedule(()=>serverSide.deliver(data));},
  close(){if(client.readyState===3)return;client.readyState=3;up.schedule(()=>serverSide.hangup());down.schedule(()=>client.onclose?.({code:1000}));}};
 const serverSide={readyState:1,
  accept(){},addEventListener(type,fn){listeners[type].push(fn);},
  send(data){if(!serverOpen)return;down.schedule(()=>{if(client.readyState===1)client.onmessage?.({data});});},
  close(){if(!serverOpen)return;serverOpen=false;serverSide.readyState=3;for(const fn of listeners.close)fn({});down.schedule(()=>{if(client.readyState!==3){client.readyState=3;client.onclose?.({code:1008});}});},
  deliver(data){if(!serverOpen)return;for(const fn of listeners.message)fn({data});},
  hangup(){if(!serverOpen)return;serverOpen=false;serverSide.readyState=3;for(const fn of listeners.close)fn({});}};
 onServerCreated?.(serverSide);
 // Opening handshake: one round trip.
 up.schedule(()=>{acceptOn(serverSide);down.schedule(()=>{if(client.readyState===0){client.readyState=1;clientOpen=true;client.onopen?.();}});});
 return client;
}
