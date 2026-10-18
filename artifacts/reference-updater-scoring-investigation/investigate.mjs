import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {engine,ref,book,sourceText} from '../../tests/reference-updater-harness.mjs';

const results=[];
const assertBaseline=process.argv.includes('--assert-baseline');
const wrap=(body,label='Smith, 2020',id='bb0005')=>ref(id,label,body);
const plain=text=>`<ce:other-ref>${text}</ce:other-ref>`;
const metadata=(title,authors=['Smith'],year='2020',doi='')=>`<sb:reference><sb:contribution><sb:authors>${authors.map(name=>`<sb:author><ce:surname>${name}</ce:surname></sb:author>`).join('')}</sb:authors><sb:title><sb:maintitle>${title}</sb:maintitle></sb:title></sb:contribution><sb:host><sb:journal><sb:title><sb:maintitle>Journal of Coastal Studies</sb:maintitle></sb:title><sb:date>${year}</sb:date></sb:journal>${doi?`<ce:doi>${doi}</ce:doi>`:''}</sb:host></sb:reference>`;
const title='Effects of temperature and pressure on the stability of coastal ecosystems';
const shortMetadata=title=>`<sb:reference><sb:contribution><sb:authors><sb:author><ce:surname>Smith</ce:surname></sb:author></sb:authors><sb:date>2020</sb:date><sb:title><sb:maintitle>${title}</sb:maintitle></sb:title></sb:contribution></sb:reference>`;
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));row=next;}return !a.length||!b.length?0:1-row[b.length]/Math.max(a.length,b.length);}
async function check(name,left,right,{label='Smith, 2020',incomingLabel=label,expectScore,expectType}={}){
 const original=wrap(left,label),updated=wrap(right,incomingLabel,'bb0900'),state={scanResults:[]};
 const e=engine(original,updated,state);e.runAnalysis();
 const parsed=[e.parseReferences(original)[0],e.parseReferences(updated)[0]];
 const primary=state.scanResults.find(r=>r.originalIndex===0);
 if(assertBaseline && expectScore!==undefined)assert.equal(primary.matchScore,expectScore,name);
 if(assertBaseline && expectType)assert.equal(primary.matchType,expectType,name);
 const generated={};
 for(const autoUpdateSmartMatch of [false,true]){
  const s={scanResults:[]};engine(original,updated,s,{autoUpdateSmartMatch}).runAnalysis();
  await engine(original,updated,s,{autoUpdateSmartMatch}).initiateUpdate();
  generated[autoUpdateSmartMatch?'autoConfirm':'default']={produced:!!s.output,messages:(s.toasts||[]).map(t=>t.msg)};
 }
 results.push({name,original,updated,score:primary.matchScore??null,type:primary.matchType??null,status:primary.status,
  fullTextSimilarity:Math.round(distance(parsed[0].cleanContent,parsed[1].cleanContent)*10000)/100,
  parsed:parsed.map(p=>({label:p.label,cleanContent:p.cleanContent,title:p.title,author:p.author,authors:p.rawAuthors,authCount:p.authCount,year:p.year,doi:p.doi})),
  candidates:primary.candidates||primary.potentialMatches||[],generated});
}
await check('baseline identical metadata',metadata(title),metadata(title),{expectScore:100,expectType:'Content'});
await check('equivalent ampersand spellings short entry',shortMetadata('A &amp; B'),shortMetadata('A &#38; B'),{expectScore:76,expectType:'Label'});
await check('equivalent ampersand spellings longer entry',metadata('A &amp; B'),metadata('A &#38; B'));
await check('equivalent accent spellings',metadata('Café coastal study'),metadata('Caf&#233; coastal study'));
await check('equivalent literal CDATA ampersand',plain('Smith (2020). A &amp; B.'),plain('Smith (2020). <![CDATA[A & B.]]>'));
await check('inline formatting inside word',plain('Smith (2020). Ecosystems.'),plain('Smith (2020). E<ce:italic>c</ce:italic>o<ce:italic>s</ce:italic>y<ce:italic>s</ce:italic>t<ce:italic>e</ce:italic>m<ce:italic>s</ce:italic>.'),{expectScore:80,expectType:'Label'});
await check('different visible word boundaries collapse',plain('Smith (2020). A<ce:italic>B</ce:italic>C.'),plain('Smith (2020). A B C.'),{expectScore:100,expectType:'Content'});
await check('structured and plain exact flattened text',`<sb:reference><sb:contribution><sb:authors><sb:author><ce:surname>Smith</ce:surname></sb:author></sb:authors><sb:date>2020</sb:date><sb:title><sb:maintitle>${title}</sb:maintitle></sb:title></sb:contribution></sb:reference>`,plain(`Smith 2020 ${title}`),{expectScore:100});
await check('structured with source text versus plain',book('rf0005','Smith','2020','Coastal ecosystems')+sourceText('se0005','Smith (2020). Coastal ecosystems.'),plain('Smith (2020). Coastal ecosystems.'),{expectScore:80});
await check('additional source text metadata unchanged',metadata(title)+sourceText('se0005',`Smith (2020). ${title}.`),metadata(title));
await check('unstructured missing parenthesized year',metadata(title),plain(`Smith 2020 ${title}`));
const contrib='<sb:contribution><sb:title><sb:maintitle>Coastal ecosystems</sb:maintitle></sb:title></sb:contribution>';
const host='<sb:host><sb:journal><sb:title><sb:maintitle>Journal of Biology</sb:maintitle></sb:title></sb:journal></sb:host>';
await check('title selection depends on XML order',`<sb:reference>${host}${contrib}</sb:reference>`,`<sb:reference>${contrib}${host}</sb:reference>`,{expectScore:47});
await check('DOI URL spelling same identifier',metadata(title,['Smith'],'2020','10.1234/abc'),metadata(title,['Smith'],'2020','https://doi.org/10.1234/abc'));
await check('DOI prefix whitespace same identifier',metadata('Short title',['Smith'],'2020','10.1234/abc'),metadata('Short title',['Smith'],'2020','doi: 10.1234/abc'));
await check('full text outranks complete author conflict',metadata(title,['Smith','Jones','Lee']),metadata(title,['Smith','Jones','Brown']));
await check('full text outranks publication year change',metadata(title,['Smith'],'2020'),metadata(title,['Smith'],'2021'));
await check('explicit DOI conflict remains blocked',metadata(title,['Smith'],'2020','10.1234/abc'),metadata(title,['Smith'],'2020','10.1234/xyz'));
await check('different numeric labels remain separate',metadata(title),metadata(title),{label:'[1]',incomingLabel:'[2]'});
await check('missing title and authors label fallback',plain('short old'),plain('short new'),{label:'[1]',expectScore:40,expectType:'Label'});
await check('markup author list unavailable',metadata('A &amp; B'),metadata('A &#38; B').replaceAll('sb:author','ce:author'));
// A descriptive-label candidate suppresses a stronger metadata candidate entirely.
const original=wrap(metadata(title));
const updated=wrap(metadata('Unrelated ocean circulation study'),'Smith, 2020','bb0900')+wrap(metadata(title).replace('<sb:maintitle>Journal of Coastal Studies','<sb:maintitle>Coastal Studies'),'Smith et al., 2020','bb0905');
const state={scanResults:[]};const e=engine(original,updated,state);e.runAnalysis();
results.push({name:'early label stage suppresses stronger metadata candidate',original,updated,rows:state.scanResults.map(({uid,...r})=>r),parsed:e.parseReferences(updated).map(p=>({title:p.title,author:p.author,year:p.year,authors:p.rawAuthors}))});
await check('stronger candidate alone control',metadata(title),metadata(title).replace('<sb:maintitle>Journal of Coastal Studies','<sb:maintitle>Coastal Studies'),{incomingLabel:'Smith et al., 2020',expectScore:100,expectType:'Surname-Year'});
const realPaths=['D:/Freelance Zone/ES/Files/Kevin/10-07-2026/In Progress/YBCMD_103036/YBCMD_103036.xml','C:/Users/Kevin/Downloads/YBCMD_103036.xml'];
let real={available:realPaths.every(p=>fs.existsSync(p))};
if(real.available){
 const [original,updated]=realPaths.map(p=>fs.readFileSync(p,'utf8')),state={scanResults:[]};const e=engine(original,updated,state);e.runAnalysis();
 const left=e.parseReferences(original),right=e.parseReferences(updated);
 real={available:true,originalCount:left.length,updatedCount:right.length,rows:state.scanResults.map(r=>({label:r.label,type:r.matchType,score:r.matchScore,status:r.status,originalIndex:r.originalIndex,updatedIndex:r.updatedIndex,
  metadata:r.originalIndex!==null&&r.updatedIndex!==null?[left[r.originalIndex],right[r.updatedIndex]].map(p=>({title:p.title,authors:p.rawAuthors,year:p.year,doi:p.doi})):undefined}))};
}
const destination=path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(destination,assertBaseline?'results.json':'verification-results.json'),JSON.stringify({cases:results,real},null,2));
console.log(JSON.stringify({cases:results.map(r=>({name:r.name,score:r.score,type:r.type,status:r.status,fullText:r.fullTextSimilarity,autoConfirm:r.generated?.autoConfirm.produced,rows:r.rows?.map(x=>({score:x.matchScore,type:x.matchType,status:x.status,updatedIndex:x.updatedIndex}))})),real},null,2));
