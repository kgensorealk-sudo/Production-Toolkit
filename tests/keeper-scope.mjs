import assert from 'node:assert/strict';
import {dispatchKeeperTool} from '../utils/keeperEvidence.ts';
import {runKeeperToolLoop} from '../utils/keeperToolRunner.ts';
const evidence={files:[],records:[{id:'q1',artifactId:'xml',kind:'query',text:'Confirm?',source:'',diagnostics:[]}]};
for(const status of ['out_of_scope','insufficient_evidence']){
 let rounds=0;
 const client={models:{generateContent:async()=>{rounds++;return {functionCalls:[{id:'scope',name:'report_scope_limit',args:{status,reason:status==='out_of_scope'?'I cannot run VTool or modify files with these read-only tools.':'The extracted records do not establish rendered indentation.',suggestedAction:'Review the available query responses instead.'}}],candidates:[{content:{role:'model',parts:[{functionCall:{name:'report_scope_limit',args:{}}}]}}]};}}};
 const result=await runKeeperToolLoop({provider:'gemini',client,model:'synthetic',messages:[{role:'user',parts:[{text:'Run VTool and validate this article.'}]}],systemInstruction:'Keeper',evidence,deadline:Date.now()+1000});
 assert.equal(rounds,1,'scope response must not trigger model retries or evidence reads');
 assert.equal(result.trace[0].name,'report_scope_limit');
 assert.equal(result.coverage.recordsRetrieved,0);
 assert.match(result.text,/requested action has not been completed/);
 assert.match(result.text,status==='out_of_scope'?/outside my available sandbox tools/:/cannot establish/);
}
assert.ok(dispatchKeeperTool(evidence,'report_scope_limit',{status:'done',reason:'Checked'}).error);
assert.ok(dispatchKeeperTool(evidence,'report_scope_limit',{status:'out_of_scope',reason:'',path:'private'}).error);
assert.ok(dispatchKeeperTool(evidence,'report_scope_limit',{status:'out_of_scope',reason:'x'.repeat(1001)}).error);
console.log('PASS explicit out-of-scope and insufficient-evidence replies terminate in one model round without false reads, completion claims, or unvalidated arguments');
