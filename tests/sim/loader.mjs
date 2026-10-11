// Node ESM hooks so server modules written for Workers can run in a plain Node
// simulation: `cloudflare:workers` is stubbed, `@/` maps to the project root and
// extensionless relative imports resolve to .ts/.tsx files.
import {existsSync,statSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const STUB='data:text/javascript,export const env=new Proxy({},{get:(_,k)=>k==="DB"?globalThis.__SIM_DB__:typeof k==="string"?process.env[k]:undefined});';
function candidate(file){for(const ext of ['','.ts','.tsx','/index.ts'])if(existsSync(file+ext)&&statSync(file+ext).isFile())return file+ext;return null;}
export async function resolve(spec,context,next){
 if(spec==='cloudflare:workers')return{url:STUB,shortCircuit:true};
 let file=null;
 if(spec.startsWith('@/'))file=candidate(path.join(root,spec.slice(2)));
 else if((spec.startsWith('./')||spec.startsWith('../'))&&context.parentURL?.startsWith('file:')){const [bare,query]=spec.split('?');const f=candidate(path.resolve(path.dirname(fileURLToPath(context.parentURL)),bare));if(f)return{url:pathToFileURL(f).href+(query?'?'+query:''),shortCircuit:true};}
 if(file)return{url:pathToFileURL(file).href,shortCircuit:true};
 return next(spec,context);
}
