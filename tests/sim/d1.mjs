// A D1-compatible facade over node:sqlite. Every call pays a configurable network
// round trip and executes serially, like the single primary that D1 routes
// `withSession('first-primary')` traffic to. Counters feed the DB-load report.
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
const sleep=ms=>ms>0?new Promise(r=>setTimeout(r,ms)):Promise.resolve();
const plain=row=>row?Object.assign({},row):null;
const writes=/^\s*(insert|update|delete|create|drop|alter|replace)/i;
export class SimD1{
 constructor({rtt=()=>0,commitMs=0}={}){this.sql=new DatabaseSync(':memory:');this.rtt=rtt;this.commitMs=commitMs;this.queue=Promise.resolve();this.reset();}
 reset(){this.stats={roundTrips:0,statements:0,writeStatements:0,rowsRead:0,bytesRead:0,busyMs:0,waitMs:0,errors:0,byTag:{}};}
 migrate(dir){for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())this.sql.exec(readFileSync(dir+'/'+f,'utf8').replaceAll('--> statement-breakpoint',''));return this;}
 withSession(){return this;}
 prepare(sql){return new Statement(this,sql,[]);}
 exec(sql){this.sql.exec(sql);}
 execute(stmt){
  const s=this.sql.prepare(stmt.sql);this.stats.statements++;
  if(writes.test(stmt.sql)){this.stats.writeStatements++;const r=s.run(...stmt.params);return{results:[],success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  const rows=s.all(...stmt.params).map(plain);this.stats.rowsRead+=rows.length;for(const r of rows)for(const v of Object.values(r))if(typeof v==='string')this.stats.bytesRead+=v.length;
  return{results:rows,success:true,meta:{changes:0}};
 }
 async call(fn,tag){
  this.stats.roundTrips++;this.stats.byTag[tag]=(this.stats.byTag[tag]||0)+1;
  await sleep(this.rtt()/2);
  const queued=performance.now();
  const run=this.queue.then(async()=>{this.stats.waitMs+=performance.now()-queued;const t=performance.now();try{return fn();}finally{const spent=performance.now()-t;this.stats.busyMs+=spent;}});
  this.queue=run.then(r=>r&&r.wrote&&this.commitMs?sleep(this.commitMs):undefined,()=>{});
  try{const r=await run;await sleep(this.rtt()/2);return r.value;}catch(e){this.stats.errors++;await sleep(this.rtt()/2);throw e;}
 }
 // SIM_CAP_ERROR_AT=n: the n-th batch fails like the host's per-connection query cap (exercises cap learning).
 batch(stmts){this.batches=(this.batches||0)+1;if(this.batches===Number(process.env.SIM_CAP_ERROR_AT))return Promise.reject(new Error('D1_ERROR: Too many API requests by single worker invocation.'));return this.call(()=>{this.sql.exec('BEGIN');try{const out=stmts.map(s=>this.execute(s));this.sql.exec('COMMIT');return{value:out,wrote:stmts.some(s=>writes.test(s.sql))};}catch(e){this.sql.exec('ROLLBACK');throw e;}},'batch');}
}
class Statement{
 constructor(db,sql,params){this.db=db;this.sql=sql;this.params=params;}
 bind(...p){return new Statement(this.db,this.sql,p.map(v=>typeof v==='boolean'?Number(v):v));}
 first(col){return this.db.call(()=>{const r=this.db.execute(this).results[0]||null;return{value:col&&r?r[col]:r,wrote:false};},'first');}
 all(){return this.db.call(()=>({value:this.db.execute(this),wrote:false}),'all');}
 run(){return this.db.call(()=>({value:this.db.execute(this),wrote:writes.test(this.sql)}),'run');}
}
