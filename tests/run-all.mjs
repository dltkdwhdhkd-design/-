// Runs every automated test: unit tests directly, HTTP/WebSocket tests through the built
// Worker in Miniflare (needs `pnpm run build` first). Cross-platform: `node tests/run-all.mjs`.
// Not included: tests/sim (simulator, see tests/sim/README.md), tests/browser (needs a running
// server and Playwright) and render-doll*.mjs (old offline model renders).
import {spawnSync} from 'node:child_process';
import {readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const HTTP=['multiplayer.mjs','field-multiplayer.mjs','security-multiplayer.mjs','latency-multiplayer.mjs','roles-multiplayer.mjs','speech-multiplayer.mjs','checkpoint-multiplayer.mjs','first-person-multiplayer.mjs','nereid-multiplayer.mjs','solo-multiplayer.mjs','live-multiplayer.mjs','live-protocol-multiplayer.mjs'];
const unit=readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.mjs')&&!HTTP.includes(f)&&!f.startsWith('render-doll')&&f!=='run-all.mjs').sort();
const results=[];
const run=(label,args,env={})=>{const t=Date.now();const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:600000});const ok=r.status===0;results.push({label,ok,ms:Date.now()-t});console.log(`${ok?'PASS':'FAIL'}  ${label}  (${((Date.now()-t)/1000).toFixed(1)}s)`);if(!ok)console.log((r.stdout+r.stderr).split('\n').filter(l=>!/^\s+at /.test(l)).slice(-12).join('\n'));};
for(const f of unit)run(f,['--no-warnings','--experimental-strip-types',path.join('tests',f)]);
if(!existsSync(path.join(root,'dist/server/index.js')))console.log('SKIP  HTTP tests: run `pnpm run build` first');
else{for(const f of HTTP)run(f+' (Miniflare)',['tests/worker.cjs'],{TEST_FILE:f});run('live-protocol-multiplayer.mjs (Miniflare, LIVE_D1_QUERY_BUDGET=40)',['tests/worker.cjs'],{TEST_FILE:'live-protocol-multiplayer.mjs',LIVE_D1_QUERY_BUDGET:'40'});}
const failed=results.filter(r=>!r.ok);console.log(`\n${results.length-failed.length}/${results.length} passed`);process.exit(failed.length?1:0);
