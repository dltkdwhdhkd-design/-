export type LiveStatus={connected:boolean;rtt:number;checkpointAge:number;instance?:string;reconnects?:number};
type ActWaiter={resolve:(v:Record<string,unknown>)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
export class LiveActionError extends Error{rejected=true;}
type Options={url:string;code:string;token:string;input:()=>Record<string,unknown>|null;frame:(data:any)=>void;status:(s:LiveStatus)=>void;
 ready?:(m:{ack:number;warp:number;seq:number;instance?:string})=>void;resend?:(m:{after:number;warp:number;seq:number})=>void;rebase?:(m:{own:any})=>void};
// Independent send/receive: a slow acknowledgement never prevents newer input being sent.
// Field actions travel on the same socket (request/response by id) so they are applied by
// the same server isolate, in order, right after the inputs that preceded them.
export class LiveClient{
 socket:WebSocket|null=null;lastFrame=0;ready=false;rtt=0;checkpointAge=0;resync=false;closed=false;instance='';reconnects=0;
 retry=0;timer?:ReturnType<typeof setTimeout>;attempt=0;nextPing=0;next:WebSocket|null=null;waiters=new Map<string,ActWaiter>();
 private options:Options;
 constructor(options:Options){this.options=options;}
 healthy(){return this.ready&&!this.resync&&performance.now()-this.lastFrame<1000&&this.checkpointAge<1000;}
 start(){this.closed=false;this.connect();const send=()=>{if(this.closed)return;const ws=this.socket,now=performance.now();if(ws?.readyState===WebSocket.OPEN&&this.ready&&ws.bufferedAmount<32000){const input=this.options.input();if(input)ws.send(JSON.stringify({type:'input',...input}));if(now>=this.nextPing){ws.send(JSON.stringify({type:'ping',sent:now}));this.nextPing=now+2000;}}if(this.ready&&now-this.lastFrame>2500)ws?.close();this.timer=setTimeout(send,50);};this.timer=setTimeout(send,50);}
 status(){this.options.status({connected:this.healthy(),rtt:this.rtt,checkpointAge:this.checkpointAge,instance:this.instance,reconnects:this.reconnects});}
 // handover=true opens a replacement socket while the current one keeps working; the
 // swap happens when the new one is authenticated (server-requested recycling).
 connect(handover=false){if(this.closed)return;const ws=new WebSocket(this.options.url);if(handover)this.next=ws;else this.socket=ws;let authed=false;const timeout=setTimeout(()=>{if(!authed)ws.close();},5000);
  ws.onopen=()=>ws.send(JSON.stringify({type:'auth',code:this.options.code,token:this.options.token}));
  ws.onmessage=event=>{try{const data=JSON.parse(event.data);
   if(data.type==='ready'){authed=true;clearTimeout(timeout);
    if(ws===this.next){const old=this.socket;this.socket=ws;this.next=null;this.reconnects++;setTimeout(()=>{try{old?.close();}catch{}},400);}
    else if(ws!==this.socket)return;
    // The stall watchdog (no frame for 2.5 s) starts counting from authentication, not page load.
    this.ready=true;this.attempt=0;this.lastFrame=performance.now();this.instance=String(data.instance||'');this.options.ready?.(data);}
   else if(data.type==='frame'){this.lastFrame=performance.now();this.checkpointAge=Number(data.checkpointAge)||0;this.resync=data.resync===true;this.options.frame(data);this.status();}
   else if(data.type==='actResult'){const w=this.waiters.get(String(data.id));if(w){this.waiters.delete(String(data.id));clearTimeout(w.timer);if(data.ok)w.resolve(data);else w.reject(new LiveActionError(String(data.error||'요청을 처리하지 못했습니다.')));}}
   else if(data.type==='resend')this.options.resend?.(data);
   else if(data.type==='rebase')this.options.rebase?.(data);
   else if(data.type==='recycle'){if(ws===this.socket&&!this.next)this.connect(true);}
   else if(data.type==='pong'&&typeof data.sent==='number'){this.rtt=Math.max(0,Math.round(performance.now()-data.sent));this.status();}
   else if(data.type==='error')ws.close();}catch{ws.close();}};
  ws.onerror=()=>{};ws.onclose=event=>{clearTimeout(timeout);if(ws===this.next){this.next=null;return;}if(this.socket!==ws)return;this.ready=false;this.failWaiters();this.status();if(this.closed)return;
   // A recycle that could not hand over reconnects at once; real failures back off.
   const delay=(event as CloseEvent)?.code===4000?0:Math.min(8000,400*2**this.attempt++);this.reconnects++;this.retry=window.setTimeout(()=>this.connect(),delay);};
 }
 // Resolves with the server reply; rejects with LiveActionError when the server refused the
 // action, or a plain Error when the transport failed (caller may retry over HTTP: the
 // server de-duplicates by requestId).
 act(body:Record<string,unknown>,timeoutMs=3500):Promise<Record<string,unknown>>{
  const ws=this.socket;if(!ws||ws.readyState!==WebSocket.OPEN||!this.ready)return Promise.reject(new Error('live socket not ready'));
  const id=Math.random().toString(36).slice(2)+Date.now().toString(36);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiters.delete(id);reject(new Error('live action timeout'));},timeoutMs);this.waiters.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({type:'act',id,body}));}catch(e){clearTimeout(timer);this.waiters.delete(id);reject(e instanceof Error?e:new Error('send failed'));}});
 }
 failWaiters(){for(const [id,w] of this.waiters){clearTimeout(w.timer);w.reject(new Error('live socket closed'));this.waiters.delete(id);}}
 stop(){this.closed=true;this.ready=false;clearTimeout(this.timer);clearTimeout(this.retry);this.failWaiters();this.socket?.close();this.next?.close();this.socket=null;this.next=null;}
}
