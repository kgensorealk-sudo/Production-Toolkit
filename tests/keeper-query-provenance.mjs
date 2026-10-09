import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {inspectKeeperXml,inspectKeeperPdf,bindKeeperQueries} from '../utils/keeperEvidence.ts';
import {keeperQueryProvenance} from '../utils/keeperQueryProvenance.ts';
import Panel from '../components/KeeperQueryProvenance.tsx';
const xml=inspectKeeperXml({id:'xml',name:'synthetic.xml',kind:'xml',content:'<article><item-info><ce:doi>10.1234/test</ce:doi></item-info>\n<query id="q1">Should this be italic?</query><query id="q2">Confirm title?</query></article>'});
const pdf=inspectKeeperPdf('pdf',[{page:3,lines:['Supplementary data to this article can be found online at https://doi.org/10.1234/test','Q1','Query: Should this be italic?','Answer: Please italicize.','Q2','Query: Different question?','Answer: This must not be assigned.']}]);
bindKeeperQueries(xml,pdf);
const evidence={files:[{id:'xml',name:'synthetic.xml',kind:'xml',sha256:'xmlhash',inspectionStatus:'ready',diagnostics:[]},{id:'pdf',name:'synthetic_edit_report.pdf',kind:'pdf',sha256:'pdfhash',inspectionStatus:'ready',diagnostics:[]}],records:[...xml.records,...pdf.records]};
const rows=keeperQueryProvenance(evidence);assert.equal(rows.length,2);assert.equal(rows[0].authorAnswered,true);assert.equal(rows[0].editVerified,false);assert.equal(rows[0].response,'Please italicize.');assert.equal(rows[0].pdfRecord.page,3);assert.equal(rows[1].authorAnswered,false);assert.equal(rows[1].response,undefined);
const markup=renderToStaticMarkup(React.createElement(Panel,{evidence}));assert.match(markup,/synthetic_edit_report.pdf/);assert.match(markup,/page 3/);assert.match(markup,/line 2/);assert.match(markup,/Author answered: Matched response available/);assert.match(markup,/Edit verified: Not verified by this tool/);assert.doesNotMatch(markup,/This must not be assigned/);
for(const state of ['ambiguous','conflicting','unresolved']){const data={...evidence,records:evidence.records.map(r=>r.kind==='query'?{...r,binding:{state,reason:'Not a unique match.',response:'Forbidden response',pdfRecordId:pdf.records[0].id}}:r)};assert.ok(keeperQueryProvenance(data).every(r=>!r.authorAnswered&&!r.response));}
const missing={...evidence,records:xml.records};assert.equal(keeperQueryProvenance(missing)[0].authorAnswered,false);assert.match(keeperQueryProvenance(missing)[0].reason,/lacks consistent/);
const mismatch={...evidence,records:evidence.records.map(r=>r.kind==='pdf_query'?{...r,binding:{...r.binding,response:'Different stored response'}}:r)};assert.equal(keeperQueryProvenance(mismatch)[0].authorAnswered,false);
const many={...evidence,records:Array.from({length:45},(_,i)=>({...rows[0].query,id:`query-${i}`,queryId:`q${i+1}`}))};const paged=renderToStaticMarkup(React.createElement(Panel,{evidence:many}));assert.match(paged,/of 45/);assert.equal((paged.match(/Open full record/g)||[]).length,20);
const unsafe={...evidence,records:[{...rows[0].query,text:'<script>bad()</script>',binding:undefined}]};assert.doesNotMatch(renderToStaticMarkup(React.createElement(Panel,{evidence:unsafe})),/<script>/);
assert.equal(renderToStaticMarkup(React.createElement(Panel,{evidence:{...evidence,records:[]}})),'');
console.log('PASS strict query/PDF provenance, XML line/PDF page, independent answered/edit statuses, ambiguous/conflicting/missing/mismatched suppression, paged inventory and safe rendering');
