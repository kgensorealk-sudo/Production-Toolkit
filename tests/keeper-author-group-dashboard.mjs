import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import React,{act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import Dashboard,{KeeperEvaluationResults} from '../components/KeeperEvaluationDashboard.tsx';
import {processAuthorGroupRequest} from '../utils/keeperAuthorGroupEvaluation.worker.ts';
import {evaluateAuthorGroup} from '../utils/keeperAuthorGroupEvaluation.ts';

let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
const xml='<article><head><ce:author-group><ce:author id="au1" author-id="person1"><ce:given-name>Jane</ce:given-name><ce:surname>Smith</ce:surname><ce:cross-ref refid="af1"/></ce:author><ce:affiliation id="af1">Institute</ce:affiliation></ce:author-group></head></article>';
const raw=new TextEncoder().encode('\uFEFF'+xml),hash=v=>createHash('sha256').update(v).digest('hex');
await test('actual worker protocol hashes original BOM bytes and instructions',async()=>{const b=Uint8Array.from(raw);const r=(await processAuthorGroupRequest({requestId:4,bytes:b.buffer,name:'input.xml',instructions:''})).result;assert.equal(r.sourceSha256,hash(raw));assert.notEqual(r.sourceSha256,hash(xml));assert.equal(r.instructionsSha256,hash(''));assert.equal(r.AUTHOR_GROUP_INTEGRITY,'PASS');assert.deepEqual(b,raw);});
await test('actual worker rejects invalid UTF-8 with source identity retained',async()=>{const r=(await processAuthorGroupRequest({requestId:5,bytes:Uint8Array.from([0xff]).buffer,name:'bad.xml',instructions:''})).result;assert.equal(r.AUTHOR_GROUP_INTEGRITY,'INCOMPLETE');assert.equal(r.sourceSha256,hash(Uint8Array.from([0xff])));});
await test('actual worker refuses oversized input before evaluation',async()=>{const r=(await processAuthorGroupRequest({requestId:6,bytes:new ArrayBuffer(4_000_001),name:'large.xml',instructions:''})).result;assert.equal(r.AUTHOR_GROUP_INTEGRITY,'INCOMPLETE');});
await test('rendered result escapes evidence and distinguishes already present from Keeper applied',()=>{const r=evaluateAuthorGroup(xml.replace('Smith','<opt_DEL>Smyth</opt_DEL><opt_INS>Smith</opt_INS>'));r.authors[0].evidence.quote='<img src=x onerror=alert(1)>';const html=renderToStaticMarkup(React.createElement(KeeperEvaluationResults,{result:r,tab:'author-group'}));assert.ok(html.includes('AUTHOR_NAME_CHANGES_ALREADY_PRESENT'));assert.ok(html.includes('AUTHOR_NAME_CHANGES_APPLIED'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('Keeper performed zero changes'));});

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://evaluation.test'});
const saved=new Map();for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
const workers=[];let timeoutAction=null;
class MockWorker {onmessage=null;onerror=null;terminated=false;request=null;constructor(){workers.push(this);}postMessage(value){this.request=value;}terminate(){this.terminated=true;}}
for(const key of ['Worker','fetch','indexedDB'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
globalThis.Worker=MockWorker;globalThis.fetch=()=>{throw Error('Evaluation must not send requests');};globalThis.indexedDB={open(){throw Error('Evaluation must not open IndexedDB');}};
const realTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>ms===20_000?(timeoutAction=fn,0):realTimeout(fn,ms,...args);
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));const text=()=>document.body.textContent;
const click=async(el)=>{assert.ok(el);await act(async()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
const button=(s)=>[...document.querySelectorAll('button')].find(b=>b.textContent===s);
const choose=async(name='input.xml',size=raw.length)=>{const input=document.getElementById('keeper-eval-file');Object.defineProperty(input,'files',{configurable:true,value:[{name,size,arrayBuffer:async()=>Uint8Array.from(raw).buffer}]});await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));};
const reply=async(w,id=w.request.requestId)=>{const response=await processAuthorGroupRequest(w.request);await act(async()=>w.onmessage({data:{...response,requestId:id}}));};
try{
 await act(async()=>root.render(React.createElement(Dashboard,{ownerIdentity:'owner-a'})));
 await test('empty dashboard has only Overview and Author-group inner tabs',()=>{assert.deepEqual([...document.querySelectorAll('[role=tab]')].map(t=>t.textContent),['Overview','Author-group']);assert.ok(button('Evaluate author group').disabled);assert.ok(text().includes('No current evaluation'));});
 await test('upload and actual result presentation without storage or network',async()=>{await choose();await click(button('Evaluate author group'));const w=workers.at(-1);await reply(w);assert.ok(w.terminated);assert.ok(text().includes('Evaluation overview'));assert.ok(text().includes('PASS'));assert.ok(text().includes(hash(raw)));await click(button('Author-group'));assert.ok(text().includes('Jane Smith'));assert.ok(text().includes('NOT_REQUIRED'));});
 await test('instruction edits invalidate result immediately',async()=>{const input=document.getElementById('keeper-eval-instructions');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,'Author au1: replace "Smith" with "Jones"');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.ok(text().includes('No current evaluation'));});
 await test('source switch cancels and rejects stale response',async()=>{await choose('a.xml');await click(button('Evaluate author group'));const old=workers.at(-1);await choose('b.xml');assert.ok(old.terminated);await reply(old);assert.ok(text().includes('No current evaluation'));assert.ok(!text().includes('Jane Smith'));});
 await test('wrong request identity is ignored',async()=>{await click(button('Evaluate author group'));const w=workers.at(-1);await reply(w,w.request.requestId-1);assert.ok(text().includes('in progress'));assert.ok(!w.terminated);await reply(w);assert.ok(w.terminated);});
 await test('clear cancels pending worker and removes source',async()=>{await click(button('Evaluate author group'));const w=workers.at(-1);await click(button('Clear'));await reply(w);assert.ok(w.terminated);assert.ok(button('Evaluate author group').disabled);assert.ok(!text().includes('Jane Smith'));});
 await test('worker crash shows incomplete manual-review message',async()=>{await choose();await click(button('Evaluate author group'));const w=workers.at(-1);await act(async()=>w.onerror({}));assert.ok(text().includes('INCOMPLETE'));assert.ok(text().includes('REQUIRED'));assert.ok(w.terminated);});
 await test('worker timeout stops work and suppresses late results',async()=>{await click(button('Evaluate author group'));const w=workers.at(-1);await act(async()=>timeoutAction());await reply(w);assert.ok(text().includes('timed out'));assert.ok(w.terminated);});
 await test('over-limit upload cannot retain previous result',async()=>{await choose('huge.xml',4_000_001);assert.ok(button('Evaluate author group').disabled);assert.ok(text().includes('INCOMPLETE'));});
 await test('owner change clears transient file and instructions',async()=>{await choose();await act(async()=>root.render(React.createElement(Dashboard,{ownerIdentity:'owner-b'})));assert.ok(button('Evaluate author group').disabled);assert.equal(document.getElementById('keeper-eval-instructions').value,'');});
 await test('keyboard tab selection and focus',async()=>{const tab=button('Overview');await act(async()=>tab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true})));assert.equal(button('Author-group').getAttribute('aria-selected'),'true');assert.equal(document.activeElement,button('Author-group'));});
 await test('unmount terminates pending worker',async()=>{await choose();await click(button('Evaluate author group'));const w=workers.at(-1);await act(async()=>root.unmount());assert.ok(w.terminated);});
 await test('Keeper integrates the dashboard without altering source storage modules',()=>{const source=fs.readFileSync(new URL('../pages/Keeper.tsx',import.meta.url),'utf8');assert.match(source,/keeper-evaluation-panel/);assert.match(source,/<KeeperSandbox \/>/);});
}finally{globalThis.setTimeout=realTimeout;for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}dom.window.close();}
console.log(`${checks}/${checks} dashboard and worker scenarios passed.`);
