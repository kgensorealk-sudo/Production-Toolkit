import assert from 'node:assert/strict';
import {engine,a,b,corrected,ref} from './reference-updater-harness.mjs';
const wrap=(body,refs)=>`<article><body>${body}</body><ce:bibliography><ce:section-title>References</ce:section-title><ce:bibliography-sec>${refs}</ce:bibliography-sec></ce:bibliography></article>`;
async function merge(original,updated,options={},review=false){const state={scanResults:[]};engine(original,updated,state,options).runAnalysis();if(review)for(const row of state.scanResults.filter(row=>row.status==='potential_duplicate'))engine(original,updated,state,options).mergeDuplicate(row.uid,row.originalIndex);await engine(original,updated,state,options).initiateUpdate();return state;}
let count=0;
const ownershipOriginal=wrap('<ce:para><ce:cross-ref refid="rf5">Reference A</ce:cross-ref></ce:para>',a+b);
const swapped=corrected.replace('id="rf900"','id="rf10"')+b.replace('id="bb10"','id="bb905"').replace('id="rf10"','id="rf5"');
let state=await merge(ownershipOriginal,swapped,{renumberInternal:false});assert.equal(state.output,'');assert.ok(state.toasts.some(toast=>toast.msg.includes('belongs to another original reference')));count++;
state=await merge(ownershipOriginal,swapped);assert.ok(state.output.includes('refid="rf5"'));assert.ok(engine('','').parseReferences(state.output).find(reference=>reference.fullTag.includes('id="rf5"')).label==='[1]');count++;
const other=(id,text)=>ref('bb0005','[1]',`<ce:other-ref id="or0005"><ce:textref id="tr0005">${text}</ce:textref></ce:other-ref>`);
const originalOther=other('','Original reference.');
for(const link of ['<ce:cross-ref refid="missing">details</ce:cross-ref>','<ce:inter-ref xlink:href="#mis%73ing">details</ce:inter-ref>']){
 state=await merge(wrap('',originalOther),other('','Updated reference '+link),{},true);assert.equal(state.output,'');assert.ok(state.toasts.some(toast=>toast.msg.includes('New unresolved link target missing')));count++;
}
const oldBroken=other('','Original <ce:cross-ref refid="missing">details</ce:cross-ref>.');
state=await merge(wrap('',oldBroken),oldBroken);assert.ok(state.output.includes('refid="missing"'));count++;
state=await merge(wrap('',oldBroken),oldBroken.replace('Original','Corrected'),{},true);assert.ok(state.output.includes('refid="missing"'));count++;
const repeated=oldBroken.replace('</ce:textref>','<ce:cross-ref refid="missing">new link</ce:cross-ref></ce:textref>');
state=await merge(wrap('',oldBroken),repeated,{},true);assert.equal(state.output,'');count++;
const existingBody='<ce:para><ce:cross-ref refid="unresolved">Existing unresolved citation</ce:cross-ref></ce:para>';
state=await merge(wrap(existingBody,a),wrap('<ce:para id="unresolved">Unrelated incoming body element</ce:para>',corrected));assert.ok(state.output.includes(existingBody));assert.ok(!state.output.includes('Unrelated incoming body element'));count++;
const oldInBody=wrap('<ce:para><ce:cross-ref refid="missing">Old body error</ce:cross-ref></ce:para>',originalOther);
state=await merge(oldInBody,other('','Updated <ce:cross-ref refid="missing">new reference error</ce:cross-ref>'),{},true);assert.equal(state.output,'');count++;
console.log(`${count} reference ID ownership and link provenance checks passed.`);
