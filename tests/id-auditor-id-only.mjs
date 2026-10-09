import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const xmlExports={};
new Function('exports','require',ts.transpileModule(fs.readFileSync('utils/referenceUpdaterXml.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(xmlExports,()=>({default:JSON.parse(fs.readFileSync('utils/referenceUpdaterEntities.json','utf8'))}));
const idExports={};
new Function('exports','require',ts.transpileModule(fs.readFileSync('utils/idAuditorEngine.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(idExports,name=>name.endsWith('.json')?{default:JSON.parse(fs.readFileSync('utils/idAuditorRules.json','utf8'))}:xmlExports);
const source=fs.readFileSync('pages/IdAuditor.tsx','utf8');
const ast=ts.createSourceFile('IdAuditor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['ID_CONFIG','invalidateGeneratedResult','runAudit','executeFix']);const declarations={};
function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.has(node.name.text))declarations[node.name.text]='const '+node.getText(ast)+';';ts.forEachChild(node,visit);}visit(ast);
assert.equal(Object.keys(declarations).length,names.size);
const compiled=ts.transpileModule(Object.values(declarations).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function engine(input,state={},options={}){
    const noop=()=>{};
    const args={...idExports, prefixOverrides:{},auditResults:state.results||[],inputKeyRef:state.inputKeyRef??={current:input},operationRef:state.operationRef??={current:0},input,setTimeout:fn=>fn(),setToast:t=>(state.toasts??=[]).push(t),setIsLoading:value=>state.loading=value,setSuggestions:s=>state.suggestions=typeof s==='function'?s(state.suggestions||[]):s,setAuditResults:r=>state.results=r,setQaReport:r=>state.qaReport=r,setDiffElements:value=>state.diffElements=value,setStep:noop,setActiveTab:noop,setOutput:o=>state.output=o,generateDiff:(a,b)=>state.diff=[a,b],React:{createElement:()=>({})},Hash:noop,LinkIcon:noop,Trash2:noop,Eraser:noop,RefreshCw:noop,Box:noop,...options};
    return new Function(...Object.keys(args),compiled+'\nreturn {invalidateGeneratedResult,runAudit,executeFix};')(...Object.values(args));
}
const valid='<ce:bib-reference id="bb0005"><ce:other-ref id="or0005"><ce:textref id="tr0005"><ce:given-name>A B</ce:given-name> text</ce:textref></ce:other-ref></ce:bib-reference>';
let state={};let api=engine(valid,state);api.runAudit();assert.ok(state.results.every(r=>r.status==='valid'));
assert.ok(state.results.every(r=>!('hasNameSpacingViolation' in r)&&!('isOtherRef' in r)));
api.executeFix();assert.equal(state.output,valid);
const changed='<ce:author-group><ce:author><ce:given-name>C D</ce:given-name></ce:author></ce:author-group><ce:bib-reference id="bad"><sb:reference id="wrong"><sb:author><ce:given-name>A. B.</ce:given-name></sb:author></sb:reference><ce:source-text id="text">unchanged content</ce:source-text></ce:bib-reference><ce:cross-refs id="link" refid="bad wrong">[1]</ce:cross-refs><ce:inter-ref id="external" xlink:href="#bad">web</ce:inter-ref>';
state={};api=engine(changed,state);api.runAudit();api.executeFix();
const stripIds=xml=>xml.replace(/\s+id="[^"]*"/g,'');
assert.equal(stripIds(state.output),stripIds(changed));assert.ok(state.output.includes('refid="bad wrong"'));assert.ok(state.output.includes('xlink:href="#bad"'));
assert.ok(state.output.includes('id="bb3000"'));assert.deepEqual(state.diff,[changed,state.output]);
state={};api=engine('<ce:para>Plain text</ce:para>',state);api.runAudit();api.executeFix();assert.equal(state.output,'<ce:para id="p3000">Plain text</ce:para>');
state={};api=engine('<ce:para id="p0005">First</ce:para><ce:para id="p0005">Second</ce:para>',state);api.runAudit();assert.ok(state.results.every(r=>r.isDuplicate));api.executeFix();assert.equal(new Set([...state.output.matchAll(/id="([^"]+)"/g)].map(m=>m[1])).size,2);
state={};api=engine('<ce:bib-reference id="bb0005"><ce:label>[1]</ce:label><ce:other-ref id="or0005">text</ce:other-ref><ce:source-text id="se0005">text</ce:source-text></ce:bib-reference><ce:label>[3]</ce:label><opt_DEL>old</opt_DEL><ce:cross-ref>[1]</ce:cross-ref><ce:table/><ce:para>text</ce:para>',state);api.runAudit();
assert.deepEqual(state.suggestions.map(s=>s.id),['xml-renumber','other-ref','tag-cleaner','citation-linker','view-sync','structural-architect']);
console.log('5 ID-only auditor scenarios passed.');

for(const rule of idExports.ID_RULES){
 const prefix=rule.prefix||'custom'; const overrides={[rule.tag]:prefix};
 const absent=`<${rule.tag}>Text</${rule.tag}>`;
 const repaired=idExports.repairElementIds(absent,overrides);
 assert.equal(repaired.changed,1,rule.tag);
 const valid=`<${rule.tag} id='${prefix}0005'>Text</${rule.tag}>`;
 assert.equal(idExports.repairElementIds(valid,overrides).output,valid);
 const invalid=`<${rule.tag} id = 'wrong'>Text</${rule.tag}>`;
 assert.equal(idExports.repairElementIds(invalid,overrides).output,invalid.replace("'wrong'",`'${prefix}3000'`));
}
assert.equal(idExports.auditElementIds('<ce:para id="p0000"/>')[0].status,'invalid');
assert.equal(idExports.auditElementIds('<ce:para id="p0006"/>')[0].status,'invalid');
assert.equal(idExports.repairElementIds('<ce:para id="p9995"/><ce:para id="bad"/>').output,'<ce:para id="p9995"/><ce:para id="p3000"/>');
assert.equal(idExports.repairElementIds('<ce:para id="p0005"/><ce:figure id="p0005"/>').changed,1);
assert.equal(idExports.repairElementIds('<custom id="x0005"/>').output,'<custom id="x0005"/>');
const mixedUnknown='<ce:dochead id="dh0005">Heading</ce:dochead><ce:index-flag/><ce:para id="bad">Body</ce:para>';
const skippedPrefixResult=idExports.repairElementIds(mixedUnknown);
assert.equal(skippedPrefixResult.changed,1);
assert.equal(skippedPrefixResult.output,'<ce:dochead id="dh0005">Heading</ce:dochead><ce:index-flag/><ce:para id="p3000">Body</ce:para>');
assert.equal(idExports.repairElementIds(mixedUnknown,{'ce:index-flag':'ix'}).changed,2);
const unconfiguredDuplicate='<custom id="x0005"/><custom id="x0005"/><ce:para id="bad"/>';
assert.equal(idExports.repairElementIds(unconfiguredDuplicate).output,unconfiguredDuplicate.replace('<ce:para id="bad"/>','<ce:para id="p3000"/>'));
assert.throws(()=>idExports.repairElementIds(unconfiguredDuplicate+'<ce:cross-ref refid="x0005">1</ce:cross-ref>'),/Linked duplicate/);
assert.equal(idExports.repairElementIds('<custom id="x0005"/>',{custom:'x'}).changed,0);
assert.equal(idExports.repairElementIds('<!-- <ce:para id="bad"/> --><ce:para><![CDATA[<ce:para id="bad"/>]]></ce:para>').changed,1);
assert.throws(()=>idExports.repairElementIds('<ce:para>'),/XML|close|Unclosed/i);
assert.throws(()=>idExports.repairElementIds(Array.from({length:1999},(_,i)=>`<ce:para id="p${String((i+1)*5).padStart(4,'0')}"/>`).join('')+'<ce:para id="bad"/>'),/No available/);
console.log(`${idExports.ID_RULES.length} registered rule cases and generation safeguards passed.`);

// Compare all installed production rules, with the explicit alt-text workflow exception.
const editorRules=JSON.parse(fs.readFileSync('tests/fixtures/id-auditor-editor-prefixes.json','utf8')).rules;
for(const rule of editorRules){
 const prefix=rule.tag==='ce:alt-text'?'al':rule.prefix;
 const attrs=rule.isCoded==='true'?' type="code"':rule.isCoded==='false'?' type="simple"':'';
 const xml=`<${rule.tag}${attrs} id="${prefix}0005">Keep</${rule.tag}>`;
 const rows=idExports.auditElementIds(xml);
 assert.equal(rows[0].expectedPrefix,prefix,JSON.stringify(rule));
 assert.equal(rows[0].status,'valid',JSON.stringify(rule));
 assert.equal(idExports.repairElementIds(xml).output,xml);
 const damaged=xml.replace(`id="${prefix}0005"`,'id="wrong"');
 assert.equal(idExports.repairElementIds(damaged).output,damaged.replace('id="wrong"',`id="${prefix}3000"`));
}
const mixed='<ce:inter-ref type="code" id="ir0005" xlink:href="https://example.test/code">A</ce:inter-ref><ce:inter-refs id="qr0005">B</ce:inter-refs><ce:inter-ref type="code" id="qr3000">C</ce:inter-ref><ce:cross-ref id="cf0005" refid="ir0005 qr0005">D</ce:cross-ref>';
const mixedFixed=idExports.repairElementIds(mixed).output;
assert.equal(mixedFixed,mixed.replace('id="ir0005"','id="qr3005"').replace('id="qr0005"','id="ir3000"'));
assert.equal(idExports.repairElementIds(mixedFixed).changed,0);
assert.equal(idExports.auditElementIds('<ce:inter-ref type="&#99;ode" id="qr0005"/>')[0].status,'valid');
assert.equal(idExports.auditElementIds('<ce:inter-ref type="Code" id="ir0005"/>')[0].status,'valid');
assert.equal(idExports.repairElementIds('<ce:inter-ref type="code"/>').changed,1);
assert.equal(idExports.repairElementIds('<ce:alt-text id="al0005">Alt</ce:alt-text>').changed,0);
assert.equal(idExports.auditElementIds('<ce:alt-text id="at0005"/>')[0].expectedPrefix,'al');
assert.equal(idExports.auditElementIds('<ce:title id="ti0005"/>')[0].prefixSource,'observed');
assert.equal(idExports.auditElementIds('<ce:footnote id="fn0005"/>')[0].prefixSource,'editor');
assert.equal(idExports.auditElementIds('<ce:index-flag id="ix0005"/>')[0].needsPrefix,true);
console.log(`${editorRules.length} installed editor rule cases and conditional-prefix safeguards passed.`);

// Reproduced critical cases: never capture an unresolved target or choose a linked duplicate owner.
const capture='<ce:bib-reference id="wrong"><ce:label>[2]</ce:label><ce:source-text id="se0005">Other work</ce:source-text></ce:bib-reference><ce:cross-ref id="cf0005" refid="bb3000">[1]</ce:cross-ref>';
assert.ok(idExports.repairElementIds(capture).output.includes('id="bb3005"'));
assert.ok(idExports.repairElementIds(capture).output.includes('refid="bb3000"'));
const captureGroup='<ce:bib-reference id="wrong"/><ce:cross-refs id="cf0005" refid="bb3000  bb3005\tbb3010"/>';
assert.ok(idExports.repairElementIds(captureGroup).output.includes('id="bb3015"'));
assert.ok(idExports.repairElementIds('<ce:figure id="wrong"/><ce:inter-ref id="ir0005" xlink:href="#f3000"/>').output.includes('id="f3005"'));
assert.ok(idExports.repairElementIds('<ce:figure id="wrong"/><ce:inter-ref id="ir0005" xlink:href="#f%33%30%30%30"/>').output.includes('id="f3005"'));
assert.ok(idExports.repairElementIds('<ce:figure id="wrong"/><ce:cross-ref id="cf0005" refid="f&#51;000"/>').output.includes('id="f3005"'));
assert.ok(idExports.repairElementIds('<ce:figure id="wrong"/><ce:inter-ref id="ir0005" xlink:href="https://example.test/#f3000"/>').output.includes('id="f3000"'));
for(const link of ['<ce:cross-ref id="cf0005" refid="bb0005">[2]</ce:cross-ref>', '<ce:cross-refs id="cf0005" refid="bb0005 bb0010"/>','<ce:inter-ref id="ir0005" xlink:href="#bb0005"/>','<ce:inter-ref id="ir0005" xlink:href="#bb%30%30%30%35"/>']){
 const dup='<ce:bib-reference id="bb0005"/><ce:bib-reference id="bb0005"/>'+link;
 assert.ok(idExports.auditElementIds(dup).filter(r=>r.isDuplicate).every(r=>r.needsReview));
 assert.throws(()=>idExports.repairElementIds(dup),/Linked duplicate ID bb0005/);
 state={};api=engine(dup,state);api.runAudit();api.executeFix();assert.equal(state.output,'');assert.ok(state.toasts.some(t=>t.type==='error'));
}
assert.equal(idExports.repairElementIds('<ce:para id="p0005"/><ce:para id="p0005"/>').changed,1);
assert.equal(idExports.repairElementIds('<!-- <ce:cross-ref refid="p0005"/> --><ce:para id="p0005"/><ce:para id="p0005"/>').changed,1);
const grouped='<ce:bib-reference id="bb0005"/><ce:bib-reference id="bb0010"/><ce:cross-refs id="cf0005" refid="bb0005  bb0010"/>';
assert.equal(idExports.analyzeIdLinks(grouped).uncitedCount,0);
state={};api=engine(grouped,state);api.runAudit();api.executeFix();assert.ok(!state.suggestions.some(s=>s.id==='uncited-cleaner'));
const brokenAfter='<ce:bib-reference id="bad"/><ce:cross-ref id="cf0005" refid="bad"/> ';
state={};api=engine(brokenAfter,state);api.runAudit();assert.ok(!state.suggestions.some(s=>s.id==='citation-linker'));api.executeFix();
assert.ok(state.suggestions.some(s=>s.id==='citation-linker'));assert.ok(!state.suggestions.some(s=>s.id==='uncited-cleaner'));assert.equal(state.toasts.at(-1).type,'warn');
assert.equal(idExports.analyzeIdLinks(state.output).brokenTargets,1);
state={};api=engine('<ce:bib-reference id="bb0005"/><ce:bib-reference id="bb0010"/><ce:cross-ref id="cf0005" refid="bb0005"/>',state);api.runAudit();assert.ok(state.suggestions.find(s=>s.id==='uncited-cleaner').description.includes('1 reference(s)'));
assert.equal(idExports.analyzeIdLinks('<ce:bib-reference id="bb0005"/><ce:cross-ref id="cf0005" refid="bb&#48;005"/>').uncitedCount,0);
assert.equal(idExports.analyzeIdLinks('<!-- <ce:cross-ref refid="bb0005"/> --><ce:bib-reference id="bb0005"/>').uncitedCount,1);
assert.equal(idExports.analyzeIdLinks('<ce:para><![CDATA[<ce:cross-ref refid="bb0005"/>]]></ce:para><ce:bib-reference id="bb0005"/>').uncitedCount,1);
assert.equal(idExports.analyzeIdLinks('<ce:cross-refs id="cf0005" refid="bb3000 bb3005"/>').unlinkedCitations,1);
console.log('Critical target protection and output recommendation regressions passed.');

const qaCapture=idExports.createIdQaReport(capture,idExports.repairElementIds(capture).output);
assert.ok(qaCapture.issues[0].reason.includes('already absent'));
assert.ok(qaCapture.issues[0].reason.includes('reserved'));
assert.equal(qaCapture.changes[0].after,'bb3005');
const qaChanged=idExports.createIdQaReport(brokenAfter,idExports.repairElementIds(brokenAfter).output);
assert.ok(qaChanged.issues[0].reason.includes('bad to bb3000'));
assert.ok(qaChanged.issues[0].owners[0].includes('id="bad"'));
const qaDup=idExports.createIdQaReport('<ce:bib-reference id="bb0005">First work</ce:bib-reference><ce:bib-reference id="bb0005">Second work</ce:bib-reference><ce:cross-ref id="cf0005" refid="bb0005">[2]</ce:cross-ref>');
assert.equal(qaDup.issues[0].kind,'ambiguous-target');assert.equal(qaDup.issues[0].owners.length,2);assert.equal(qaDup.issues[0].text,'[2]');
assert.equal(idExports.createIdQaReport(grouped).issues.length,0);
assert.equal(idExports.createIdQaReport('<ce:cross-ref id="cf0005">Smith, 2020</ce:cross-ref>').issues[0].kind,'missing-refid');
console.log('QA report before/after evidence and recommendation cases passed.');

assert.ok(idExports.createIdQaReport('<ce:para id="p0005"/><ce:cross-ref id="cf0005" xlink:href="#p0005"/>').issues.some(issue=>issue.kind==='missing-refid'));
state={};api=engine(brokenAfter,state);api.runAudit();assert.equal(state.qaReport.issues.length,0);api.executeFix();assert.equal(state.qaReport.issues[0].target,'bad');assert.equal(state.qaReport.changes[0].after,'bb3000');
assert.ok(source.includes("if (sug.id === 'citation-linker')"));

const timers=[];state={};api=engine(changed,state,{setTimeout:fn=>timers.push(fn)});
api.runAudit();api.invalidateGeneratedResult();state.inputKeyRef.current='other XML';state.inputKeyRef.current=changed;api.runAudit();
assert.equal(state.loading,true);timers.shift()();assert.equal(state.results,undefined);assert.equal(state.loading,true);timers.shift()();assert.ok(state.results.length>0);assert.equal(state.loading,false);
api.executeFix();api.invalidateGeneratedResult();api.runAudit();timers.shift()();assert.equal(state.output,'');assert.equal(state.qaReport,null);assert.equal(state.loading,true);timers.shift()();assert.equal(state.qaReport.stage,'audit');assert.equal(state.qaReport.changes.length,0);
state.output='old output';state.qaReport={issues:['old']};state.suggestions=[{id:'old'}];api.invalidateGeneratedResult();assert.equal(state.output,'');assert.equal(state.qaReport,null);assert.deepEqual(state.suggestions,[]);
console.log('Repeated input, superseded work, cancellation, and stale-result checks passed.');

// Configured optional IDs are generated without changing content or citation targets.
const captionInput='<ce:caption><ce:simple-para>Caption text</ce:simple-para></ce:caption><ce:dochead>Heading</ce:dochead><ce:cross-ref id="cf0005" refid="ca3000">Caption</ce:cross-ref>';
const captionOutput=idExports.repairElementIds(captionInput).output;
assert.ok(captionOutput.includes('<ce:caption id="ca3005">'));
assert.ok(captionOutput.includes('<ce:dochead>Heading</ce:dochead>'));
assert.ok(captionOutput.includes('refid="ca3000"'));
assert.ok(idExports.auditElementIds(captionInput).some(row=>row.tagName==='ce:dochead'&&row.needsPrefix));
assert.ok(idExports.createIdQaReport(captionInput,captionOutput).changes.some(change=>change.tag==='ce:caption'&&change.reason==='Generated a missing ID for a configured prefix.'));
assert.equal(idExports.repairElementIds(captionOutput).changed,0);
console.log('Configured missing caption IDs and unconfigured QA cases passed.');

// Schemes are represented by ce:figure; they use sch rather than f.
const schemeXml='<ce:figure id="sch0005"><ce:label>Scheme 1</ce:label></ce:figure><ce:cross-ref id="cf0005" refid="sch0005">Scheme 1</ce:cross-ref>';
assert.equal(idExports.auditElementIds(schemeXml)[0].expectedPrefix,'sch');
assert.equal(idExports.auditElementIds(schemeXml)[0].status,'valid');
assert.equal(idExports.repairElementIds(schemeXml).output,schemeXml);
assert.equal(idExports.repairElementIds('<ce:figure id="sch0005"/>').changed,0);
for(const label of ['Scheme 1','SCHEME 2','<ce:italic>Scheme</ce:italic> 3','&#83;cheme 4']){
 const input=`<ce:figure><ce:label>${label}</ce:label></ce:figure>`;
 assert.equal(idExports.repairElementIds(input).output,input.replace('<ce:figure>','<ce:figure id="sch3000">'));
}
assert.equal(idExports.repairElementIds('<ce:figure id="bad"><ce:label>Scheme 1</ce:label></ce:figure><ce:figure id="sch3000"/>').output,'<ce:figure id="sch3005"><ce:label>Scheme 1</ce:label></ce:figure><ce:figure id="sch3000"/>');
const ordinary='<ce:figure id="f0005"><ce:label>Fig. 1</ce:label><ce:caption id="ca0005">Scheme 1 is mentioned here</ce:caption></ce:figure>';
assert.equal(idExports.repairElementIds(ordinary).output,ordinary);
assert.equal(idExports.auditElementIds('<ce:figure><ce:label>Scheme 1</ce:label></ce:figure>',{'ce:figure':'custom'})[0].expectedPrefix,'custom');
assert.throws(()=>idExports.repairElementIds(schemeXml+'<ce:figure id="sch0005"/>'),/Linked duplicate/);
console.log('PASS Scheme preservation, linked target preservation, missing/malformed Scheme IDs, formatted labels, collisions, ordinary figures and explicit overrides');
