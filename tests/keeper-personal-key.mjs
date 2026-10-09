import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../utils/chatHandler.ts';
const oldFetch=globalThis.fetch,oldGemini=process.env.GEMINI_API_KEY,oldOpenai=process.env.OPENAI_API_KEY,oldWarn=console.warn;
process.env.GEMINI_API_KEY='server-key';process.env.OPENAI_API_KEY='server-openai';
const used=[],warnings=[];let rejectKey=false;
console.warn=(...args)=>warnings.push(args.join(' '));
globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input.url||String(input);
  if(url.includes('/auth/v1/user'))return Response.json({id:'synthetic',app_metadata:{role:'admin'}});
  if(url.includes('generativelanguage.googleapis.com')){
    const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
    used.push(headers.get('x-goog-api-key'));
    if(rejectKey)return Response.json({error:{code:403,message:'Denied personal-key'}},{status:403});
    return Response.json({candidates:[{content:{role:'model',parts:[{text:'Hello.'}]},finishReason:'STOP'}]});
  }
  throw Error('Unexpected provider; personal key must not fall back to OpenAI');
};
async function request(key,authorized=true){let output;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){output={status:this.statusCode,data};return this;},end(){}};await handler({method:'POST',headers:{...(authorized?{authorization:'Bearer synthetic'}:{}),...(key===undefined?{}:{'x-keeper-gemini-key':key})},body:{messages:[{role:'user',content:'Hello'}]}},res);return output;}
try{
  assert.equal((await request('personal-key')).status,200);assert.equal(used.at(-1),'personal-key');
  assert.equal((await request('second-user-key')).status,200);assert.equal(used.at(-1),'second-user-key');
  assert.equal((await request()).status,200);assert.equal(used.at(-1),'server-key');assert.equal(process.env.GEMINI_API_KEY,'server-key');
  assert.equal((await request('personal-key',false)).status,401);
  for(const bad of [['key'],'', 'bad key','x'.repeat(257)])assert.equal((await request(bad)).status,400);
  rejectKey=true;const failed=await request('personal-key');assert.equal(failed.status,503);assert.match(failed.data.error,/personal API key/);assert.equal(used.length,4);assert.ok(!JSON.stringify(failed).includes('personal-key'));assert.ok(!warnings.join(' ').includes('personal-key'));assert.ok(used.slice(3).every(k=>k==='personal-key'));
  const ui=fs.readFileSync('components/KeeperSandbox.tsx','utf8');assert.match(ui,/type="password" autoComplete="off"/);assert.match(ui,/personalGemini.owner===user\?\.id/);assert.match(ui,/useEffect\(\(\)=>setPersonalGemini\(\{owner:user\?\.id\|\|'',key:''\}\),\[user\?\.id\]\)/);assert.ok(!ui.includes('personalGeminiKey,'));
  console.log('PASS request-local Gemini key selection, account/request isolation, server-key preservation, authentication, invalid keys, Gemini-only fallback, safe failure logging, and memory-only masked UI');
}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;if(oldGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldGemini;if(oldOpenai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldOpenai;}
