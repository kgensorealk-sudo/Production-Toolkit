import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('./test-manifest.json',import.meta.url)));
const actual = fs.readdirSync(new URL('.',import.meta.url)).filter(f=>f.endsWith('.mjs')).sort();
const expected = [...manifest.entries.map(e=>e.file.slice(6)),...manifest.helpers].sort();
if (JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error('Unclassified or missing test file: update test-manifest.json explicitly.');
if (Number(process.versions.node.split('.')[0])!==24) throw new Error('This suite currently requires Node 24. Other runtimes are unverified.');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'toolkit-regression-'));
function fingerprints(dir=root) {
  const hashes={};
  for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    if(['node_modules','.git','.vercel','dist','output'].includes(item.name))continue;
    const target=path.join(dir,item.name);
    if(item.isSymbolicLink())continue;
    if(item.isDirectory())Object.assign(hashes,fingerprints(target));
    else hashes[path.relative(root,target)]=createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  }
  return hashes;
}
const before=fingerprints();
const entries=manifest.entries.filter(e=>!process.argv.includes('--keeper')||path.basename(e.file).startsWith('keeper-'));
const results=[];
for(const entry of entries) {
  const start=Date.now();
  const result=await new Promise(resolve=>{
    let log='',timedOut=false;
    const env={...process.env,TOOLKIT_TEST_OUTPUT:output};
    for(const key of ['GEMINI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','KEEPER_STAGE1_SOURCE','TOOLKIT_ARTICLE_BASELINE','GIT_DIR','GIT_WORK_TREE','NODE_OPTIONS','TOOLKIT_EXTERNAL_RESULT','TOOLKIT_EXTERNAL_NONCE'])delete env[key];
    const child=spawn(process.execPath,['--import','tsx',entry.file],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
    const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
    child.on('error',error=>{clearTimeout(timer);resolve({status:'FAIL',error:String(error),log});});
    child.on('close',(code,signal)=>{clearTimeout(timer);resolve({status:code===0&&!timedOut?'PASS':'FAIL',code,signal,timedOut,log});});
  });
  results.push({file:entry.file,kinds:entry.kinds,...result,ms:Date.now()-start,externalChecks:entry.externalChecks.map(id=>({id,status:'UNAVAILABLE',reason:'External source intentionally not supplied to the portable run.'}))});
  console.log(`${result.status} ${entry.file}`);
  if(result.status==='FAIL')console.error(result.log);
}
const after=fingerprints();
const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(f=>before[f]!==after[f]);
const summary={node:process.version,platform:process.platform,results,maintainedFilesChanged:changed,externalStatus:'NOT RUN; use npm run test:external. Conditional external checks are not counted as portable coverage.'};
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(summary,null,2));
console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} entry points passed. Maintained files changed: ${changed.length}. Report: ${path.join(output,'results.json')}`);
if(results.some(r=>r.status!=='PASS')||changed.length)process.exitCode=1;
