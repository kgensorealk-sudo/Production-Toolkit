import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref,book,sourceText} from './reference-updater-harness.mjs';
const original=ref('bb0005','[1]',book('rf0005','Smith','2020','Alpha evidence','10.1000/alpha')+sourceText('se0005','Alpha evidence.'));
const updated=ref('bb0900','[1]',book('rf0900','Smith','2020','Corrected Alpha evidence','10.1000/alpha')+sourceText('se0900','Corrected Alpha evidence.'));
const parse=xml=>engine('','').parseReferences(xml);
const title=value=>updated.replace('Corrected Alpha evidence</sb:maintitle>',value+'</sb:maintitle>');
for(const xml of [title('&undefinedEntity;'),updated.replace('id="bb0900"','id="&undefinedEntity;"')])
    assert.throws(()=>parse(xml),/Undeclared entity/);
let state={scanResults:[],output:'old result'};engine(original,title('&undefinedEntity;'),state).runAnalysis();
assert.equal(state.scanResults.length,0);assert.ok(state.toasts.some(t=>t.msg.includes('Undeclared entity')));
// Named character entities are expanded; matching metadata sees the real characters.
assert.ok(parse(title('Caf&eacute; &alpha; &nbsp;'))[0].fullTag.includes('Café α'));
assert.ok(parse(title('Caf&eacute;'))[0].title.includes('café'));
assert.ok(parse(title('&amp;undefinedEntity;'))[0].fullTag.includes('&amp;undefinedEntity;'));
assert.ok(parse(updated.replace('Alpha evidence.</ce:source-text>','<![CDATA[&undefinedEntity;]]></ce:source-text>'))[0].fullTag.includes('<![CDATA['));
assert.equal(parse('<!-- &undefinedEntity; -->'+original).length,1);
const declared=(declarations,value)=>`<!DOCTYPE article [${declarations}]>${title(value)}`;
assert.ok(parse(declared('<!ENTITY term "Café">','&term;'))[0].fullTag.includes('Café'));
assert.ok(parse(declared('<!ENTITY phrase "&term; evidence"><!ENTITY term "α">','&phrase;'))[0].fullTag.includes('α evidence'));
assert.throws(()=>parse(declared('<!ENTITY term "&term;">','&term;')),/Recursive/);
assert.throws(()=>parse(declared('<!ENTITY term "&missing;">','&term;')),/Undeclared entity/);
assert.throws(()=>parse(declared('<!ENTITY term SYSTEM "file:///private">','&term;')),/External entity/);
assert.throws(()=>parse(declared('<!ENTITY term "<ce:bold>text</ce:bold>">','&term;')),/contains markup/);
assert.throws(()=>parse(declared('<!-- <!ENTITY term "fake"> -->','&term;')),/Undeclared entity/);
assert.ok(parse(declared('<!-- brackets [ ] and a quote \' --> <!ENTITY term "Real">','&term;'))[0].fullTag.includes('Real'));
const nested=Array.from({length:18},(_,i)=>`<!ENTITY e${i} "${i===17?'text':`&e${i+1};`}">`).join('');
assert.throws(()=>parse(declared(nested,'&e0;')),/excessive entity expansion/);
assert.throws(()=>parse(declared('<!ENTITY term "&#0;">','&term;')),/Invalid XML character/);
const namedId=declared('<!ENTITY bib "bb0900">','Good').replace('id="bb0900"','id="&bib;"');
assert.equal(parse(namedId)[0].id,'bb0900');
const escapedAttribute=updated.replace('Alpha evidence.</ce:source-text>','<ce:inter-ref xlink:href="https://example.org/?a=1&amp;b=2">web</ce:inter-ref></ce:source-text>');
assert.ok(parse(escapedAttribute)[0].fullTag.includes('?a=1&amp;b=2'));
const results=[];
for(const [name,incoming] of [['dtd-character-entities',title('Caf&eacute; &alpha; evidence')],['supplied-text-entity',declared('<!ENTITY term "Café α">','&term; evidence')]]) {
    state={scanResults:[]};engine(original,incoming,state).runAnalysis();await engine(original,incoming,state).initiateUpdate();
    assert.ok(state.output.includes('Café α evidence'));assert.ok(!/&(?:eacute|alpha|term);/.test(state.output));
    results.push({name,original,updated:incoming,output:state.output});
}
fs.mkdirSync('artifacts/reference-updater-entity-protection',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-entity-protection/results.json',JSON.stringify(results,null,2));
console.log('22 entity protection scenarios passed.');
