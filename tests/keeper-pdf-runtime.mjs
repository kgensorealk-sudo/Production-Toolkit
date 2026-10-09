import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {buildKeeperEvidence} from '../utils/keeperEvidence.ts';
import {getKeeperEvidence} from '../utils/keeperEvidenceCache.ts';
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
for(const route of ['api/ai/chat.ts','api/chat.ts']) {
  assert.equal(typeof config.functions[route].includeFiles,'string');
  assert.match(config.functions[route].includeFiles,/@napi-rs\/canvas/);
  assert.match(config.functions[route].includeFiles,/pdfjs-dist/);
}

const xml={id:'xml',name:'article.xml',kind:'xml',content:'<article><item-info><ce:doi>10.1234/keeper-test</ce:doi></item-info><query id="q1">Should this be italic?</query></article>'};
const lines=['Supplementary data to this article can be found online at','https://doi.org/10.1234/keeper-test','Q1','Query: Should this be italic?','Answer: Please use italics for Sample.'];
const stream='BT /F1 12 Tf 50 750 Td '+lines.map((line,i)=>(i?'0 -20 Td ':'')+`(${line}) Tj`).join('\n')+' ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
let source='%PDF-1.4\n';const offsets=[0];
for (let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(source));source+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
const xref=Buffer.byteLength(source);source+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const pdf={id:'pdf',name:'edit-report.pdf',kind:'pdf',content:Buffer.from(source).toString('base64')};

// Native Node runtime, with no tsx or bundler masking dependency initialization.
const native=spawnSync(process.execPath,['--input-type=module','-e',"import {loadKeeperPdfRuntime} from './utils/keeperPdfRuntime.ts'; const {getDocument}=await loadKeeperPdfRuntime(); const chunks=[]; for await(const c of process.stdin) chunks.push(c);const doc=await getDocument({data:new Uint8Array(Buffer.concat(chunks)),isEvalSupported:false}).promise;const page=await doc.getPage(1);const text=await page.getTextContent();if(!text.items.some(i=>i.str.includes('Please use italics')))process.exit(2);await doc.destroy();"],{cwd:new URL('..',import.meta.url),input:Buffer.from(source),encoding:'utf8'});
assert.equal(native.status,0,native.stderr);
console.log('PASS native Node 24 initializes canvas geometry and extracts PDF text');
const evidence=await buildKeeperEvidence([xml,pdf]);
assert.equal(evidence.files[1].inspectionStatus,'ready');
assert.equal(evidence.records.find(r=>r.kind==='query').binding.state,'established');
assert.match(evidence.records.find(r=>r.kind==='query').binding.response,/Please use italics/);
console.log('PASS real PDF parsing and strict XML/PDF query-response binding');
const broken={...pdf,content:Buffer.from('not a PDF').toString('base64')};
const failed=await getKeeperEvidence('runtime-test',[xml,broken],Date.now()+25000);
assert.equal(failed.files[1].inspectionStatus,'failed');
assert.match(failed.records[0].binding.reason,/PDF was uploaded, but extraction failed/);
assert.notStrictEqual(await getKeeperEvidence('runtime-test',[xml,broken],Date.now()+25000),failed,'failed inspection must not poison cache');
const missing=await buildKeeperEvidence([xml]);
assert.match(missing.records[0].binding.reason,/Supply exactly one XML/);
console.log('PASS uploaded-but-failed PDF differs from missing PDF and failed inspection is not cached');
