import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import Workspace from '../components/KeeperArticleWorkspace.tsx';
import {processAuthorGroupRequest} from '../utils/keeperAuthorGroupEvaluation.worker.ts';
import {keeperWorkspaceAuthors,keeperWorkspaceFindings} from '../utils/keeperWorkspaceFindings.ts';
import {evaluateAuthorGroup} from '../utils/keeperAuthorGroupEvaluation.ts';

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://workspace.test'});
const saved=new Map();
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
 saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
}
const workers=[];
class Worker {onmessage=null;onerror=null;terminated=false;request=null;constructor(){workers.push(this);}postMessage(request){this.request=request;}terminate(){this.terminated=true;}}
saved.set('Worker',Object.getOwnPropertyDescriptor(globalThis,'Worker'));globalThis.Worker=Worker;
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalClick=dom.window.HTMLAnchorElement.prototype.click;
let exported,downloads=0,asks=0,cancels=0;
URL.createObjectURL=blob=>{exported=blob;return 'blob:synthetic-report';};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=()=>downloads++;
const xml={id:'article-a',kind:'xml',name:'article.xml',content:'<article><head><ce:author-group><ce:author id="au1"><ce:given-name>Jane</ce:given-name></ce:author></ce:author-group></head></article>'};
const evidence={files:[{id:xml.id,name:xml.name,kind:'xml',sha256:'a'.repeat(64),inspectionStatus:'ready',diagnostics:[],articleDoi:null}],records:[
 {id:'q1',artifactId:xml.id,kind:'query',source:'<query id="Q1">Confirm affiliation</query>',text:'Confirm affiliation',queryId:'Q1',line:5,diagnostics:[],binding:{state:'unresolved',reason:'No matched author response.'}},
 {id:'q2',artifactId:xml.id,kind:'query',source:'<query id="Q2">Confirm title</query>',text:'Confirm title',queryId:'Q2',line:7,diagnostics:[],binding:{state:'established',reason:'Source and wording matched.',response:'Title confirmed.'}},
 {id:'opt1',artifactId:xml.id,kind:'opt_ins',source:'<opt_INS><img onerror="alert(1)" /></opt_INS>',text:'Synthetic diagnostic',line:9,diagnostics:[{severity:'warning',message:'Review synthetic markup.'}]},
]};
let props={artifacts:[xml],instructions:'',activeTask:'scratch',saveStatus:'Saved on this device',inspectionStatus:'ready',evidence,busy:false,canAsk:true,ask:()=>asks++,cancel:()=>cancels++,importFile:()=>{},removeFile:()=>{},onStandalone:()=>{},sidebar:React.createElement('p',null,'Saved article tasks'),settings:React.createElement('p',null,'Workspace settings'),notices:null,sourceInput:null,prompt:React.createElement('p',null,'Prompt editor'),answer:React.createElement('p',null,'Real answer slot'),answerEvidence:null,activity:React.createElement('p',null,'Activity slot'),queries:null,technical:React.createElement('p',null,'Source inventory'),selectedAiEvidence:false,clearAiEvidence:()=>{}};
const root=createRoot(document.getElementById('root'));
const render=()=>act(async()=>root.render(React.createElement(Workspace,props)));
const buttons=()=>[...document.querySelectorAll('button')];
const button=name=>buttons().find(element=>element.textContent.trim()===name);
const click=element=>act(async()=>{assert.ok(element,'Missing expected control');element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
const tab=name=>document.querySelector(`[role=tab][id="kw-${name}-tab"]`);
const panel=name=>document.getElementById(`kw-${name}-panel`);
let checks=0;async function test(name,run){await run();console.log('PASS',name);checks++;}
try{
 await render();
 await test('proposal structure renders real source cards, task sidebar, tabs and adjacent evidence',()=>{
  assert.ok(document.querySelector('[aria-label="Article tasks"]').textContent.includes('Saved article tasks'));
  assert.equal(document.querySelectorAll('.kw-file').length,2);
  assert.deepEqual([...document.querySelectorAll('[role=tab]')].map(el=>el.textContent),['Summary','Findings · 2','Queries · 2','Activity']);
  assert.equal(panel('findings').hidden,false);assert.equal(panel('summary').hidden,true);
  assert.ok(document.querySelector('[aria-label="Finding evidence"]').textContent.includes('No matched author response.'));
  assert.equal(workers.length,0,'No automatic author check or AI request on mount');
 });
 await test('default workspace action is contextual, disabled while busy, and switches on click',async()=>{
  assert.equal(button('Open default workspace'),undefined);
  const original=props;let opens=0;
  props={...props,activeTask:'saved-zip-task',busy:true,onStandalone:()=>{opens++;props={...props,activeTask:'scratch'};}};
  await render();assert.ok(button('Open default workspace').disabled);
  await click(button('Open default workspace'));assert.equal(opens,0);
  props={...props,busy:false};await render();await click(button('Open default workspace'));
  assert.equal(opens,1);await render();assert.equal(button('Open default workspace'),undefined);
  props=original;await render();
 });
 await test('domain filters select actual evidence and escape XML quotes',async()=>{
  await click(button('OPT markup · 1'));assert.equal(document.querySelectorAll('.kw-finding').length,1);
  assert.ok(document.querySelector('.kw-inspector').textContent.includes('<img onerror="alert(1)" />'));assert.equal(document.querySelector('.kw-inspector img'),null);
  await click(button('Author group · 0'));assert.equal(document.querySelectorAll('.kw-finding').length,0);assert.equal(document.querySelector('.kw-quote'),null);
 });
 await test('query selection shows matched response without claiming an applied edit',async()=>{
  await click(tab('queries'));await click(button('Q2'));
  const text=document.querySelector('.kw-inspector').textContent;assert.ok(text.includes('Title confirmed.'));assert.ok(text.includes('Source and wording matched.'));
  assert.ok(panel('queries').textContent.includes('Edit not verified'));
 });
 await test('actual worker protocol fills author findings and source excerpt',async()=>{
  await click(button('Run local checks'));assert.equal(panel('findings').hidden,false);
  const w=workers.at(-1);assert.equal(w.request.name,xml.name);
  await act(async()=>w.onmessage({data:await processAuthorGroupRequest(w.request)}));
  await click(buttons().find(el=>/^Author group · [1-9]/.test(el.textContent)));
  assert.ok([...document.querySelectorAll('.kw-finding')].some(element=>element.textContent.includes('surname')));
  assert.ok(document.querySelector('.kw-quote').textContent.includes('<ce:author'));
 });
 await test('report download includes observed findings and source identity',async()=>{
  await click(button('Export report'));assert.equal(downloads,1);
  const report=JSON.parse(await exported.text());assert.equal(report.sources[0].sha256,'a'.repeat(64));assert.ok(report.authorGroup.findings.length>0);assert.ok(report.limitations.includes('No XML changes applied.'));
 });
 await test('keyboard tab navigation activates views and moves focus',async()=>{
  tab('findings').focus();await act(async()=>tab('findings').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  assert.equal(document.activeElement,tab('queries'));assert.equal(tab('queries').getAttribute('aria-selected'),'true');
 });
 await test('ask and cancel use actual callbacks while retaining the same workspace',async()=>{
  await click(button('Ask Keeper'));assert.equal(asks,1);assert.equal(panel('summary').hidden,false);assert.ok(panel('summary').textContent.includes('Real answer slot'));
  props={...props,busy:true};await render();await click(button('Cancel AI request'));assert.equal(cancels,1);
  props={...props,busy:false};await render();
 });
 await test('source/instruction edits cancel local work and invalidate author findings',async()=>{
  await click(button('Run local checks'));const old=workers.at(-1);
  props={...props,artifacts:[{...xml,id:'article-b',name:'other.xml',content:'<article/>'}],instructions:'Changed',evidence:null,inspectionStatus:'running'};await render();
  assert.ok(old.terminated);assert.equal(button('Author group · 0').textContent,'Author group · 0');
  await act(async()=>old.onmessage({data:await processAuthorGroupRequest(old.request)}));
  assert.equal(button('Author group · 0').textContent,'Author group · 0');assert.equal(document.querySelector('.kw-quote'),null);
 });
 await test('cancel suppresses a late local worker response',async()=>{
  await click(button('Run local checks'));const w=workers.at(-1);await click(button('Cancel local checks'));assert.ok(w.terminated);
  await act(async()=>w.onmessage({data:await processAuthorGroupRequest(w.request)}));assert.equal(document.querySelectorAll('.kw-finding').length,0);
 });
 await test('large findings lists paginate without dropping evidence or report counts',async()=>{
  const records=Array.from({length:45},(_,index)=>({...evidence.records[0],id:`query-${index}`,queryId:`Q${index+1}`,text:`Question ${index+1}`,source:`<query>Question ${index+1}</query>`}));
  props={...props,artifacts:[xml],instructions:'',evidence:{...evidence,records},inspectionStatus:'ready'};await render();await click(button('All · 45'));
  assert.equal(document.querySelectorAll('.kw-finding').length,20);
  await click(button('Next findings'));assert.equal(document.querySelectorAll('.kw-finding').length,20);assert.ok(document.querySelector('.kw-quote').textContent.includes('Question 21'));
  await click(button('Next findings'));assert.equal(document.querySelectorAll('.kw-finding').length,5);assert.ok(button('Next findings').disabled);
  await click(button('Export report'));assert.equal(JSON.parse(await exported.text()).findings.length,45);
 });
 await test('passing authors remain visible with green no-action status, selectable evidence, and zero issues',async()=>{
  const content='<article><head><ce:author-group><ce:author id="a1" author-id="p1"><ce:given-name>Jane</ce:given-name><ce:surname>Smith</ce:surname><ce:cross-ref refid="af1"/></ce:author><ce:author id="a2" author-id="p2"><ce:given-name>Alex</ce:given-name><ce:surname>Jones</ce:surname><ce:cross-ref refid="af1"/></ce:author><ce:affiliation id="af1"><ce:textfn>Institute</ce:textfn></ce:affiliation></ce:author-group></head></article>';
  props={...props,artifacts:[{...xml,id:'clean-authors',content}],instructions:'',evidence:null,inspectionStatus:'ready'};
  await render();await click(button('Run local checks'));const w=workers.at(-1);
  await act(async()=>w.onmessage({data:await processAuthorGroupRequest(w.request)}));
  assert.ok(button('All · 0'));await click(button('Author group · 2 authors'));
  const rows=[...document.querySelectorAll('.kw-author-row')];assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row.querySelector('strong').textContent),['Jane Smith','Alex Jones']);
  assert.equal(document.querySelectorAll('.kw-author-row .kw-author-clear').length,2);
  assert.ok(rows.every(row=>row.textContent.includes('Author action: None.')));
  await click(rows[1]);assert.ok(document.querySelector('.kw-quote').textContent.includes('Alex'));
  await click(button('Export report'));const report=JSON.parse(await exported.text());
  assert.equal(report.findings.length,0);assert.equal(report.authorGroup.authors.length,2);
  props={...props,instructions:'Changed instructions'};await render();assert.equal(document.querySelectorAll('.kw-author-row').length,0);
 });
 await test('author status marks affected identities, unresolved group issues and incomplete checks for attention',async()=>{
  const content='<article><head><ce:author-group><ce:author id="a1" author-id="p1"><ce:given-name>Jane</ce:given-name><ce:surname>Smith</ce:surname><ce:cross-ref refid="af1"/></ce:author><ce:author id="a2" author-id="p2"><ce:given-name>Alex</ce:given-name><ce:surname>Jones</ce:surname><ce:cross-ref refid="af1"/></ce:author><ce:affiliation id="af1"><ce:textfn>Institute</ce:textfn></ce:affiliation></ce:author-group></head></article>';
  const result=evaluateAuthorGroup(content.replace('<ce:surname>Jones</ce:surname>',''));
  assert.deepEqual(keeperWorkspaceAuthors(result).map(row=>row.needsAttention),[false,true]);
  const incomplete={...result,countsComplete:false};assert.ok(keeperWorkspaceAuthors(incomplete).every(row=>row.needsAttention));
  const group={...result,findings:[{code:'HISTORY',severity:'HOLD',message:'Unresolved author correction.',authorId:null,evidence:[]}]};
  assert.ok(keeperWorkspaceAuthors(group).every(row=>row.needsAttention));
  const duplicate=evaluateAuthorGroup(content.replace('id="a2"','id="a1"'));
  assert.ok(keeperWorkspaceAuthors(duplicate).every(row=>row.needsAttention));
  const duplicatePerson=evaluateAuthorGroup(content.replace('author-id="p2"','author-id="p1"'));
  assert.ok(keeperWorkspaceAuthors(duplicatePerson).every(row=>row.needsAttention));
  const duplicateName=evaluateAuthorGroup(content.replace('>Alex<','>Jane<').replace('>Jones<','>Smith<'));
  assert.ok(keeperWorkspaceAuthors(duplicateName).every(row=>row.needsAttention));
  props={...props,artifacts:[{...xml,id:'author-attention',content:content.replace('<ce:surname>Jones</ce:surname>','')}],instructions:'',evidence:null};
  await render();await click(button('Run local checks'));const w=workers.at(-1);
  await act(async()=>w.onmessage({data:await processAuthorGroupRequest(w.request)}));
  assert.equal(document.querySelectorAll('.kw-author-row .kw-author-attention').length,1);
  assert.equal(document.querySelectorAll('.kw-author-row .kw-author-clear').length,1);
  assert.ok(document.querySelector('.kw-author-row .kw-author-attention').closest('button').textContent.includes('Author action: Review required.'));
 });
 await test('projection contains only diagnosed records or unmatched queries and flags source limitations',()=>{
  assert.equal(keeperWorkspaceFindings(null,evidence).length,2);
  const failed={...evidence,files:[{...evidence.files[0],diagnostics:['Source incomplete.'],inspectionStatus:'failed'}]};
  assert.equal(keeperWorkspaceFindings(null,failed).find(f=>f.domain==='source').detail,'Source incomplete.');
 });
}finally{
 await act(async()=>root.unmount());URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.HTMLAnchorElement.prototype.click=originalClick;
 for(const [key,value] of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}dom.window.close();
}
console.log(`${checks} workspace behavior checks passed`);
