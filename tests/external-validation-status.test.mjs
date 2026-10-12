import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateExternalExecution,resolveExternalSource} from './external-validation-protocol.mjs';

const context={id:'stage1-parity',nonce:'test-nonce',hash:'test-hash'};
const complete={schema:1,id:context.id,nonce:context.nonce,status:'PASS',completed:4,sourceHash:context.hash};
const run={status:0};
const evaluate=(result,execution=run)=>evaluateExternalExecution(execution,typeof result==='string'?result:JSON.stringify(result),context);
assert.equal(evaluate(complete).status,'PASS');
assert.equal(evaluate({...complete,status:'UNAVAILABLE',completed:0,sourceHash:null}).status,'UNAVAILABLE');
for(const raw of [null,'', 'not JSON','null','[]','{}'])assert.equal(evaluate(raw).status,'FAIL');
for(const patch of [{schema:2},{id:'wrong'},{nonce:'wrong'},{completed:0},{completed:3},{completed:5},{completed:'4'},{sourceHash:'wrong'},{status:'FAIL'},{status:'UNAVAILABLE'}])assert.equal(evaluate({...complete,...patch}).status,'FAIL');
for(const execution of [{status:1},{status:null},{status:0,signal:'SIGTERM'},{status:0,error:new Error('timeout')}])assert.equal(evaluate(complete,execution).status,'FAIL');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'toolkit-status-regression-'));
try {
  fs.writeFileSync(path.join(temporary,'stage1-relative.html'),'Deliberately invalid external source: assertions must not be skipped.');
  assert.equal(resolveExternalSource('stage1-relative.html',temporary),path.join(temporary,'stage1-relative.html'));
  assert.equal(resolveExternalSource('missing.html',temporary),null);
  assert.equal(resolveExternalSource('.',temporary),null);
  const env={...process.env,KEEPER_STAGE1_SOURCE:'stage1-relative.html'};
  for(const key of ['TOOLKIT_ARTICLE_BASELINE','VTOOL_JAR','TOOLKIT_VALIDATION_XML','GEMINI_API_KEY','OPENAI_API_KEY','NODE_OPTIONS','TOOLKIT_EXTERNAL_RESULT','TOOLKIT_EXTERNAL_NONCE'])delete env[key];
  const runner=fileURLToPath(new URL('./external-validation.mjs',import.meta.url));
  const invalid=spawnSync(process.execPath,[runner],{cwd:temporary,env,encoding:'utf8',timeout:60000});
  assert.equal(invalid.status,1);
  assert.match(invalid.stdout,/FAIL stage1-parity/);
  assert.doesNotMatch(invalid.stdout,/PASS stage1-parity/);
  env.KEEPER_STAGE1_SOURCE='missing.html';
  const missing=spawnSync(process.execPath,[runner],{cwd:temporary,env,encoding:'utf8',timeout:60000});
  assert.equal(missing.status,0);
  assert.match(missing.stdout,/UNAVAILABLE stage1-parity/);
  assert.doesNotMatch(missing.stdout,/PASS stage1-parity/);
  const strict=spawnSync(process.execPath,[runner,'--require-available'],{cwd:temporary,env,encoding:'utf8',timeout:60000});
  assert.equal(strict.status,1);
  console.log('PASS external-status contract, incomplete/malformed results, child UNAVAILABLE, failed execution, relative-path false-PASS reproduction and strict availability.');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
