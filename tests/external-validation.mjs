import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseReport,checkInput} from '../agent/vtool-bridge/bridge.mjs';
import {randomUUID} from 'node:crypto';
import {resolveExternalSource,sourceHash,evaluateExternalExecution} from './external-validation-protocol.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
// Relative overrides are relative to the caller's working directory. Children
// receive absolute paths because they execute from the repository root.
const sourceBase=process.cwd();
const output=fs.mkdtempSync(path.join(os.tmpdir(),'toolkit-external-'));
const results=[];
function record(id,status,detail){results.push({id,status,detail});console.log(`${status} ${id}: ${detail}`);}
for(const [id,key,file] of [
  ['stage1-parity','KEEPER_STAGE1_SOURCE','tests/keeper-evidence.mjs'],
  ['original-article-baseline','TOOLKIT_ARTICLE_BASELINE','tests/reference-updater-citation-protection.mjs'],
]) {
  const source=resolveExternalSource(process.env[key],sourceBase);
  if(!source){record(id,'UNAVAILABLE',`Set ${key} to an existing locally authorized file.`);continue;}
  const completion=path.join(output,id+'.completion.json'),nonce=randomUUID(),hash=sourceHash(source);
  const env={...process.env,TOOLKIT_TEST_OUTPUT:output,[key]:source,TOOLKIT_EXTERNAL_RESULT:completion,TOOLKIT_EXTERNAL_NONCE:nonce};
  delete env.GEMINI_API_KEY;delete env.OPENAI_API_KEY;
  const run=spawnSync(process.execPath,['--import','tsx',file],{cwd:root,env,encoding:'utf8',timeout:180000});
  fs.writeFileSync(path.join(output,id+'.log'),(run.stdout||'')+(run.stderr||''));
  const raw=fs.existsSync(completion)?fs.readFileSync(completion,'utf8'):null;
  const result=evaluateExternalExecution(run,raw,{id,nonce,hash});
  record(id,result.status,result.detail);
}
const jar=resolveExternalSource(process.env.VTOOL_JAR,sourceBase),xml=resolveExternalSource(process.env.TOOLKIT_VALIDATION_XML,sourceBase);
if(!jar||!xml||!fs.existsSync(jar)||!fs.existsSync(xml))record('vtool','UNAVAILABLE','Set VTOOL_JAR and TOOLKIT_VALIDATION_XML. No manuscript or publisher validator is bundled.');
else {
  const java=process.env.JAVA_BIN||'java';
  const version=spawnSync(java,['-jar',path.resolve(jar),'-version'],{encoding:'utf8',timeout:30000});
  if(version.error)record('vtool','UNAVAILABLE',String(version.error));
  else if(version.status!==0)record('vtool','FAIL','Configured validator version check failed.');
  else {
    const input=path.join(output,'input.xml'),log=path.join(output,'vtool-report');
    try {
      checkInput(fs.readFileSync(xml,'utf8'));
      fs.copyFileSync(xml,input);
      const run=spawnSync(java,['-Xmx512m','-Djavax.xml.accessExternalDTD=','-Djavax.xml.accessExternalSchema=','-jar',path.resolve(jar),'-forcecheck','-nofp','-log',log,'-file',input],{cwd:output,encoding:'utf8',timeout:180000,windowsHide:true});
      if(run.error)throw run.error;
      if(run.status!==0)throw new Error(`Validator exit ${run.status}`);
      const report=parseReport(fs.readFileSync(log+'.xml','utf8'));
      record('vtool',report.errors===0&&report.skipped===0?'PASS':'FAIL',JSON.stringify({version:(version.stdout+version.stderr).trim(),...report,limitation:'VTool DTD/production checks only; associated assets are not copied. Skipped checks prevent full PASS.'}));
    }catch(error){record('vtool','FAIL',String(error));}
  }
}
record('independent-dtd','UNAVAILABLE','No independent portable DTD adapter configured. VTool results are not a second independent DTD validation. Historical PowerShell/Python scripts remain separately inventoried.');
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,reportContainsLocalEvidence:true},null,2));
console.log(`Private local report: ${path.join(output,'results.json')}`);
if(results.some(r=>r.status==='FAIL')||(process.argv.includes('--require-available')&&results.some(r=>r.status==='UNAVAILABLE')))process.exitCode=1;
