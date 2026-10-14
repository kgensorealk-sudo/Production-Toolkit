import assert from 'node:assert/strict';
import fs from 'node:fs';
import {keeperProviderDiagnosticEvents,keeperFailurePhase} from '../utils/keeperProviderDiagnostics.ts';
import {runKeeperToolLoop} from '../utils/keeperToolRunner.ts';
import {buildKeeperEvidence} from '../utils/keeperEvidence.ts';
import handler from '../utils/chatHandler.ts';

const id='12345678-1234-1234-1234-123456789abc';
const attempt=(error,phase='provider_request',extra={})=>({provider:'gemini',model:'gemini-3.8-flash',phase,outcome:'failed',elapsedMs:12.9,error,...extra});
const event=(error,phase)=>keeperProviderDiagnosticEvents(id,[attempt(error,phase)])[0];
assert.equal(event(new Error('Keeper model request timed out.')).category,'timeout');
assert.equal(event(new Error('Keeper request time budget exhausted.')).category,'timeout');
for(const status of [99,600,'404']){
 const diagnostic=event({status,code:'RESOURCE_EXHAUSTED'});
 assert.equal(Object.hasOwn(diagnostic,'httpStatus'),false);
 assert.equal(diagnostic.providerCode,'RESOURCE_EXHAUSTED');
 assert.equal(diagnostic.category,'rate_limit_or_quota');
}
for(let status=100;status<=599;status++)assert.equal(event({status}).httpStatus,status);
assert.equal(event({status:429}).category,'rate_limit_or_quota');
assert.equal(event({status:429,error:{status:'RESOURCE_EXHAUSTED'}}).category,'rate_limit_or_quota');
assert.equal(event({status:429,code:'insufficient_quota'}).category,'quota_exceeded');
assert.equal(event({status:503,error:{status:'UNAVAILABLE'}}).category,'provider_unavailable');
assert.equal(event({statusCode:403}).category,'authentication_or_access');
assert.equal(event({status:404}).category,'model_unavailable');
assert.equal(event(new Error('Synthetic unspecified failure.')).category,'provider_error');
assert.equal(event(new SyntaxError('secret raw JSON')).phase,'response_parsing');
assert.equal(event(new SyntaxError('secret raw JSON')).category,'parsing_failure');
assert.equal(event(new Error('Invalid Keeper final proposal fields.'),'proposal_finalization').category,'schema_rejection');
assert.equal(event(new Error('Keeper final answer must be a validated proposal, not free text.'),'proposal_finalization').phase,'response_parsing');
assert.equal(event(new Error('Stale or cross-request Keeper final proposal.'),'proposal_finalization').category,'proposal_rejected');
assert.equal(event(new Error('Synthetic'),'evidence_validation').category,'evidence_rejected');

const secret='SYNTHETIC_PRIVATE_SENTINEL';
const hostile={message:secret,code:secret,status:429,headers:{authorization:secret},request:{prompt:secret},response:{data:secret},error:{code:secret}};
const sanitized=event(hostile);assert.equal(sanitized.httpStatus,429);assert.equal(sanitized.providerCode,undefined);assert.ok(!JSON.stringify(sanitized).includes(secret));
assert.deepEqual(Object.keys(sanitized).sort(),['event','version','requestId','provider','model','phase','outcome','category','httpStatus','elapsedMs','fallbackAttempted','fallbackOutcome'].sort());
const injected=keeperProviderDiagnosticEvents(secret,[attempt(hostile,'proposal_finalization',{provider:secret,model:secret,elapsedMs:Infinity,headers:secret})])[0];
assert.ok(!JSON.stringify(injected).includes(secret));assert.equal(injected.httpStatus,undefined);assert.equal(injected.elapsedMs,0);
const getter={get status(){throw Error(secret);},get message(){throw Error(secret);}};assert.doesNotThrow(()=>event(getter));
for(const succeeding of [true,false]){
 const events=keeperProviderDiagnosticEvents(id,[attempt({status:429}),attempt(undefined,'proposal_finalization',{outcome:succeeding?'success':'failed'})]);
 assert.equal(events[0].fallbackAttempted,true);assert.equal(events[0].fallbackOutcome,succeeding?'succeeded':'failed');assert.equal(events[1].fallbackAttempted,false);assert.equal(events[1].fallbackOutcome,'not_attempted');
}

const evidence=await buildKeeperEvidence([{id:'synthetic',name:'synthetic.xml',kind:'xml',content:'<article><opt_COMMENT>Synthetic review.</opt_COMMENT></article>'}]);
async function runnerFailure(provider,kind){
 let round=0,phase='unknown';
 const answer=async request=>{
  if(kind==='provider')throw Object.assign(new Error(secret),{status:503,code:'UNAVAILABLE'});
  if(kind==='timeout')return new Promise(()=>{});
  if(kind==='parse')return provider==='gemini'?{get functionCalls(){throw new SyntaxError(secret);}}:{get choices(){throw new SyntaxError(secret);}};
  if(round++===0){const call={name:'inspect_sandbox_evidence',args:{kind:'opt_comment',limit:10},id:'synthetic'};return provider==='gemini'?{functionCalls:[call],candidates:[{content:{role:'model',parts:[{functionCall:call}]}}]}:{choices:[{message:{role:'assistant',tool_calls:[{id:call.id,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}}]};}
  const serialized=JSON.stringify(request),reviewId=serialized.match(/Review request ID: ([a-f0-9-]+)/)?.[1];
  const text=kind==='schema'?'{}':kind==='json'?'not JSON':JSON.stringify({reviewId:'different-request',findings:[],uncertainty:'not_assessed'});
  return provider==='gemini'?{text}:{choices:[{message:{content:text}}]};
 };
 const client=provider==='gemini'?{models:{generateContent:answer}}:{chat:{completions:{create:answer}}};
 let error;try{await runKeeperToolLoop({provider,client,model:'synthetic',messages:provider==='gemini'?[{role:'user',parts:[{text:'Review comment'}]}]:[{role:'user',content:'Review comment'}],systemInstruction:'Synthetic',evidence,deadline:Date.now()+(kind==='timeout'?30:5000),onDiagnosticPhase:value=>{phase=value;}});}catch(caught){error=caught;}
 assert.ok(error);return {error,phase:keeperFailurePhase(phase,error)};
}
for(const provider of ['gemini','openai'])for(const [kind,expected]of [['provider','provider_request'],['timeout','provider_request'],['parse','response_parsing'],['schema','schema_validation'],['json','response_parsing'],['local','proposal_finalization']]){
 const result=await runnerFailure(provider,kind);assert.equal(result.phase,expected,provider+' '+kind);if(kind==='provider')assert.equal(result.error.message,secret);
}

// Actual HTTP handler + provider SDKs; all destinations are synthetic fetch responses.
const oldFetch=globalThis.fetch,oldWarn=console.warn,oldGemini=process.env.GEMINI_API_KEY,oldOpenai=process.env.OPENAI_API_KEY;
const logs=[];let providerCalls=0,scenario='fallback-success';
process.env.GEMINI_API_KEY='synthetic';delete process.env.OPENAI_API_KEY;
console.warn=(...args)=>logs.push(args);
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input.url||String(input);
 if(url.includes('/auth/v1/user'))return Response.json({id:'synthetic',app_metadata:{role:'admin'}});
 if(url.includes('generativelanguage.googleapis.com')){
  providerCalls++;
  if(scenario==='fallback-failed'||providerCalls===1)return Response.json({error:{code:400,status:'INVALID_ARGUMENT',message:secret}},{status:400});
  const body=JSON.parse(init?.body||(input instanceof Request?await input.text():'{}'));
  const reviewId=JSON.stringify(body).match(/Review request ID: ([a-f0-9-]+)/)?.[1];
  return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({reviewId,findings:[],uncertainty:'not_assessed'})}]},finishReason:'STOP'}]});
 }
 throw Error('Unexpected synthetic destination');
};
async function request(){let result;const res={setHeader(){},status(code){this.code=code;return this;},json(data){result={status:this.code||200,data};return this;},end(){}};await handler({method:'POST',headers:{authorization:'Bearer synthetic'},body:{messages:[{role:'user',content:'Hi'}]}},res);return result;}
try{
 assert.equal((await request()).status,200);let events=logs.map(args=>JSON.parse(args[0]));assert.equal(events.length,2);assert.equal(events[0].httpStatus,400);assert.equal(events[0].phase,'provider_request');assert.equal(events[0].fallbackOutcome,'succeeded');assert.equal(events[1].outcome,'success');assert.equal(events[0].requestId,events[1].requestId);assert.equal(providerCalls,2);assert.ok(!JSON.stringify(logs).includes(secret));
 logs.length=0;providerCalls=0;scenario='fallback-failed';assert.equal((await request()).status,503);events=logs.map(args=>JSON.parse(args[0]));assert.equal(events.length,5);assert.equal(events[0].fallbackOutcome,'failed');assert.equal(events.at(-1).fallbackOutcome,'not_attempted');assert.equal(providerCalls,5);assert.ok(!JSON.stringify(logs).includes(secret));
}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;if(oldGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldGemini;if(oldOpenai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldOpenai;}
const handlerSource=fs.readFileSync('utils/chatHandler.ts','utf8');assert.match(handlerSource,/console.warn\(JSON.stringify\(diagnostic\)\)/);assert.doesNotMatch(handlerSource,/encountered error:/);
console.log('PASS sanitized field/code allowlists, ambiguous 429, quota codes, both-provider real runner boundaries, timeout, parsing/schema/proposal failures, and actual handler fallback outcomes without live calls');
