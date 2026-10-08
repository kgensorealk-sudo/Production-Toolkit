import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,corrected,ref,book,sourceText} from './reference-updater-harness.mjs';
const rows=[{uid:'d',status:'potential_duplicate',selected:true,reviewed:false},{uid:'c',status:'conflict',incomingDuplicates:[1],selected:true,reviewed:false},{uid:'u',status:'unchanged',selected:true}];
const bulk={scanResults:structuredClone(rows)};
engine(a,corrected,bulk,{filterStatus:'duplicate'}).bulkSelect(false);
assert.deepEqual(bulk.scanResults.map(r=>r.selected),[false,false,true]);
engine(a,corrected,bulk,{filterStatus:'duplicate'}).bulkSelect(true);
assert.ok(bulk.scanResults.every(r=>r.selected));
engine(a,corrected,bulk,{filterStatus:'review'}).bulkSelect(false);
assert.deepEqual(bulk.scanResults.map(r=>r.selected),[false,false,true]);
// One incoming match claimed by two originals: reviewing one must leave the other blocked.
const sharedOriginal=a+a.replace(/bb5/g,'bb10').replace(/rf5/g,'rf10').replace(/se5/g,'se10');
const shared={scanResults:[]};engine(sharedOriginal,corrected,shared).runAnalysis();
assert.ok(shared.scanResults.every(r=>r.status==='conflict'));
shared.scanResults[0]={...shared.scanResults[0],status:'smart_match',reviewed:true};
await engine(sharedOriginal,corrected,shared,{autoUpdateSmartMatch:true}).initiateUpdate();
assert.ok(!shared.output);assert.equal(shared.scanResults[1].reviewed,false);
// Two identical incoming corrections: keep one explicitly, omit the unwanted copy.
const updated=corrected+corrected.replace(/900/g,'905');
const repeated={scanResults:[]};engine(a,updated,repeated).runAnalysis();
assert.ok(repeated.scanResults.every(r=>r.incomingDuplicates?.length));
await engine(a,updated,repeated,{autoUpdateSmartMatch:true}).initiateUpdate();
assert.ok(!repeated.output);
repeated.scanResults=repeated.scanResults.map((r,i)=>i===0?{...r,status:'smart_match',reviewed:true}:{...r,selected:false});
await engine(a,updated,repeated).initiateUpdate();
assert.equal((repeated.output.match(/<ce:bib-reference\b/g)||[]).length,1);
// Repeated additions without any original match are also blocked for review.
const incoming=ref('bb0900','New item',book('rf0900','Adams','2019','Novel work','10.1234/novel')+sourceText('se0900','Novel work.'));
const additions={scanResults:[]};engine(a,incoming+incoming.replace(/0900/g,'0905'),additions).runAnalysis();
assert.equal(additions.scanResults.filter(r=>r.incomingDuplicates?.length).length,2);
await engine(a,incoming+incoming.replace(/0900/g,'0905'),additions,{autoUpdateSmartMatch:true}).initiateUpdate();
assert.ok(!additions.output);
fs.mkdirSync('artifacts/reference-updater-duplicate-safety',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-duplicate-safety/results.json',JSON.stringify([{name:'repeated-correction',original:a,updated,output:repeated.output}],null,2));
console.log('5 duplicate safety scenarios passed.');
