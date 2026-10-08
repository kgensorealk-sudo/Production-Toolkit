import assert from 'node:assert/strict';
import {engine,a,corrected,ref,book,sourceText} from './reference-updater-harness.mjs';
const wrap=(body,refs)=>`<article><body>${body}</body><ce:bibliography><ce:section-title>References</ce:section-title><ce:bibliography-sec>${refs}</ce:bibliography-sec></ce:bibliography></article>`;
const incoming=ref('bb900','New item',book('rf950','Adams','2019','Novel','10.1234/novel')+sourceText('se950','Novel'));
async function merge(original,updated,setup=()=>{},options={}){const state={scanResults:[]};engine(original,updated,state,options).runAnalysis();setup(state);await engine(original,updated,state,options).initiateUpdate();return state;}
let count=0;
for(const link of ['<ce:cross-ref refid="bb3000">[99]</ce:cross-ref>','<ce:inter-ref xlink:href="#bb3000">[99]</ce:inter-ref>','<ce:inter-ref xlink:href="#bb%33%30%30%30">[99]</ce:inter-ref>']){
 const original=wrap('<ce:para>'+link+'</ce:para>',a),state=await merge(original,incoming);
 assert.ok(state.output.includes(link));assert.ok(!state.output.includes(' id="bb3000"'));assert.ok(state.output.includes(' id="bb3005"'));count++;
}
const incomingWithTarget=incoming+'<ce:para><ce:cross-ref refid="bb3000">Unresolved incoming example</ce:cross-ref></ce:para>';
let state=await merge(wrap('',a),incomingWithTarget);
assert.ok(state.output.includes(' id="bb3005"'));assert.ok(!state.output.includes('Unresolved incoming example'));count++;
state=await merge(wrap('<ce:para><ce:cross-ref refid="rf0955">Unresolved</ce:cross-ref></ce:para>',a),incoming);
assert.ok(!state.output.includes(' id="rf0955"'));assert.ok(state.output.includes(' id="rf0960"'));count++;
for(const target of ['#bb%35','#%62%625','#rf%35']){
 const original=wrap(`<ce:para><ce:inter-ref xlink:href="${target}">details</ce:inter-ref></ce:para>`,a);
 state=await merge(original,corrected,result=>result.scanResults.forEach(row=>row.selected=false));
 assert.equal(state.output,'');assert.ok(state.toasts.some(toast=>toast.type==='error'&&toast.msg.includes('Citation target')));count++;
}
const encodedIncoming=incoming.replace('</sb:reference>','<ce:inter-ref xlink:href="#rf%39%35%30">details</ce:inter-ref></sb:reference>');
state=await merge(a,encodedIncoming);
const target=state.output.match(/xlink:href="#([^\"]+)"/)[1];assert.ok(state.output.includes(`id="${target}"`));count++;
const encodedUnchanged='<ce:inter-ref xlink:href="#rf%35">details</ce:inter-ref>';
state=await merge(wrap('<ce:para>'+encodedUnchanged+'</ce:para>',a),corrected);assert.ok(state.output.includes(encodedUnchanged));count++;
const surroundings='<!-- keep annotation --><?note keep?><ce:para>Keep this original note</ce:para>';
state=await merge(a+surroundings,corrected);assert.ok(state.output.endsWith(surroundings));assert.ok(state.output.includes('Corrected Alpha evidence'));count++;
state=await merge(a+surroundings,corrected,result=>result.scanResults.forEach(row=>row.selected=false));assert.equal(state.output,surroundings);count++;
state=await merge(wrap('<ce:para><ce:cross-ref refid="rf950">Unresolved</ce:cross-ref></ce:para>',a),incoming,()=>{},{renumberInternal:false});assert.equal(state.output,'');assert.ok(state.toasts.some(toast=>toast.msg.includes('attach unresolved citation target rf950')));count++;
console.log(`${count} output safety regressions passed.`);
