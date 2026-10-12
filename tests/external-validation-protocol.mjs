import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const externalCases = {'stage1-parity':4,'original-article-baseline':1};
export function resolveExternalSource(value, base) {
  if (!value) return null;
  const source=path.resolve(base,value);
  try { return fs.statSync(source).isFile()?source:null; } catch { return null; }
}
export function sourceHash(source) {
  return createHash('sha256').update(fs.readFileSync(source)).digest('hex');
}
// Called only after the named external assertion block, never by synthetic cases.
export function reportExternalExecution(id,status,completed,source) {
  if (!process.env.TOOLKIT_EXTERNAL_RESULT) return;
  fs.writeFileSync(process.env.TOOLKIT_EXTERNAL_RESULT,JSON.stringify({
    schema:1,id,nonce:process.env.TOOLKIT_EXTERNAL_NONCE,status,completed,
    sourceHash:status==='PASS'?sourceHash(source):null,
  }));
}
export function evaluateExternalExecution(run,raw,{id,nonce,hash}) {
  if (run.error || run.signal || run.status!==0) return {status:'FAIL',detail:'Child execution failed, timed out, or exited incompletely.'};
  let result;
  try { result=JSON.parse(raw); } catch { return {status:'FAIL',detail:'Missing or malformed child completion result.'}; }
  if (!result || result.schema!==1 || result.id!==id || result.nonce!==nonce || !Number.isInteger(result.completed)) {
    return {status:'FAIL',detail:'Invalid child completion contract.'};
  }
  if (result.status==='UNAVAILABLE' && result.completed===0 && result.sourceHash===null) {
    return {status:'UNAVAILABLE',detail:'Child reported that the required external source was unavailable.'};
  }
  if (result.status!=='PASS' || result.completed!==externalCases[id] || result.sourceHash!==hash) {
    return {status:'FAIL',detail:'Required external assertion completion or source identity was not established.'};
  }
  return {status:'PASS',detail:`${result.completed} required external cases completed successfully.`};
}
