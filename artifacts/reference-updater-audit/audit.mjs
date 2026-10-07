import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=fs.readFileSync('pages/ReferenceUpdater.tsx','utf8');
const ast=ts.createSourceFile('ReferenceUpdater.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['formatLabel','getSimilarity','parseReferences','runAnalysis','executeMergeAsync','parsedOriginalRefs','parsedUpdatedRefs','projectedSequence','mergeDuplicate','splitMatch','handleDrop','bulkSelect','initiateUpdate']);
const found={};let review;
function visit(node){
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.has(node.name.text))found[node.name.text]='const '+node.getText(ast)+';';
    if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onClick'&&node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression&&ts.isArrowFunction(node.initializer.expression)){
        const body=node.initializer.expression.body.getText(ast);
        if(body.includes('originalIndex: cand.index')&&body.includes('updatedIndex: cand.index'))review='const chooseReviewCandidate=(cand,reviewingItem)=>'+body+';';
    }
    ts.forEachChild(node,visit);
}visit(ast);
assert.equal(Object.keys(found).length,names.size);assert.ok(review);
const code=ts.transpileModule(Object.values(found).join('\n')+'\n'+review,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function engine(originalXml,updatedXml,state={},options={}){
    const noop=()=>{};
    const params={originalXml,updatedXml,scanResults:state.scanResults||[],preserveIds:true,renumberInternal:true,addOrphans:true,sortAlphabetically:false,convertAndToAmp:false,autoUpdateSmartMatch:false,filterStatus:'all',draggedItemIndex:null,
        useMemo:fn=>fn(),setTimeout:fn=>{fn();return 0;},setOutput:value=>state.output=value,setScanResults:value=>state.scanResults=typeof value==='function'?value(state.scanResults||[]):value,
        setToast:value=>(state.toasts||=[]).push(value),setSuggestions:noop,setIsLoading:noop,setActiveTab:noop,setLastProcessedOriginal:noop,setLastProcessedUpdated:noop,setReviewingItem:noop,setDraggedItemIndex:noop,setSortAlphabetically:noop,generateDiffAsync:async()=>{},React:{createElement:noop},RefreshCw:noop,GitCompare:noop,GitMerge:noop,ArrowRight:noop,Lightbulb:noop,Search:noop,Check:noop,...options};
    return new Function(...Object.keys(params),code+'\nreturn {parseReferences,runAnalysis,executeMergeAsync,projectedSequence,mergeDuplicate,splitMatch,handleDrop,bulkSelect,initiateUpdate,chooseReviewCandidate};')(...Object.values(params));
}
const ref=(id,label,inner)=>`<ce:bib-reference id="${id}"><ce:label>${label}</ce:label>${inner}</ce:bib-reference>`;
const book=(id,author,year,title,doi='')=>`<sb:reference id="${id}"><sb:contribution><sb:authors><sb:author><ce:surname>${author}</ce:surname></sb:author></sb:authors><sb:title><sb:maintitle>${title}</sb:maintitle></sb:title></sb:contribution><sb:host><sb:book><sb:title><sb:maintitle>Book</sb:maintitle></sb:title><sb:date>${year}</sb:date></sb:book>${doi?`<ce:doi>${doi}</ce:doi>`:''}</sb:host></sb:reference>`;
const sourceText=(id,text)=>`<ce:source-text id="${id}">${text}</ce:source-text>`;
const a=ref('bb5','[1]',book('rf5','Smith','2020','Alpha evidence','10.1234/alpha')+sourceText('se5','Alpha evidence.'));
const corrected=ref('bb900','[1]',book('rf900','Smith','2020','Corrected Alpha evidence','10.1234/alpha')+sourceText('se900','Corrected Alpha evidence.'));
const b=ref('bb10','[2]',book('rf10','Jones','2021','Unrelated Beta study','10.1234/beta')+sourceText('se10','Unrelated Beta study.'));
const results=[];
async function exercise(name,original,updated,{mutate,mergeOriginal=original,mergeUpdated=updated,options={}}={}){
    const state={scanResults:[]};const first=engine(original,updated,state,options);first.runAnalysis();
    const analysis=structuredClone(state.scanResults);
    if(mutate)await mutate(state,original,updated,options);
    const merged=engine(mergeOriginal,mergeUpdated,state,options);await merged.initiateUpdate();
    const result={name,original,updated,mergeOriginal,mergeUpdated,analysis,finalAnalysis:state.scanResults,output:state.output??null,toasts:state.toasts};results.push(result);return result;
}
let r=await exercise('numeric-label-wrong-paper',a,ref('bb900','[1]',book('rf900','Jones','2022','Completely different paper','10.9999/different')+sourceText('se900','Different paper.')));
assert.equal(r.analysis[0].matchType,'Label');assert.equal(r.analysis[0].status,'update');assert.ok(r.output.includes('Completely different paper'));assert.ok(r.output.includes('id="bb5"'));
r=await exercise('unicode-content-hash-collision',ref('bb5','[1]',book('rf5','张','2020','甲乙研究')),ref('bb900','[1]',book('rf900','李','2020','丙丁分析')));
assert.equal(r.analysis[0].matchType,'Content');assert.ok(r.output.includes('丙丁分析'));
r=await exercise('conflicting-doi-normalized-as-content',ref('bb5','[1]',book('rf5','Smith','2020','Alpha','10.1234/a-b')),ref('bb900','[1]',book('rf900','Smith','2020','Alpha','10.1234/ab')));
assert.equal(r.analysis[0].matchType,'Content');assert.ok(r.output.includes('10.1234/ab'));
const originalLinks=a.replace('</sb:reference>','<sb:comment><ce:inter-ref id="ir5" xlink:href="https://example.org/a">A</ce:inter-ref> <ce:inter-ref id="ir10" xlink:href="https://example.org/b">B</ce:inter-ref></sb:comment></sb:reference>');
const updatedLinks=corrected.replace('</sb:reference>','<sb:comment><ce:inter-ref id="ir900" xlink:href="https://example.org/a">A</ce:inter-ref> <ce:inter-ref id="ir905" xlink:href="https://example.org/b">B</ce:inter-ref></sb:comment></sb:reference>');
r=await exercise('internal-ids-collapse-to-last-prefix',originalLinks,updatedLinks);
assert.equal((r.output.match(/id="ir10"/g)||[]).length,2);
const oldOther=ref('bb5','Other reference',`<ce:other-ref id="or5"><ce:textref id="tr5">Old text.</ce:textref></ce:other-ref>`);
const newOther=ref('bb900','Other reference',`<ce:other-ref id="or900"><ce:textref id="tr900">Corrected text <ce:cross-ref id="cf900" refid="tr900">details</ce:cross-ref>.</ce:textref></ce:other-ref>`);
r=await exercise('internal-links-not-remapped',oldOther,newOther);
assert.ok(r.output.includes('id="tr5"'));assert.ok(r.output.includes('refid="tr900"'));assert.ok(!/\sid="tr900"/.test(r.output));
r=await exercise('valid-single-quoted-ids-replaced',a.replace(/id="([^"]+)"/g,"id='$1'"),corrected);
assert.ok(!r.output.includes('id="bb5"')&&!r.output.includes("id='bb5'"));assert.ok(r.output.includes('id="bb3000"'));
r=await exercise('preserve-off-control',a,corrected+ref('bb5','New item',book('rf950','Adams','2019','Novel distinct study','10.1234/novel')),{options:{preserveIds:false}});
// A stronger case: preserve an unchanged original with bb5, then append an unrelated bb5 correction.
r=await exercise('preserve-off-orphan-collision',a,ref('bb5','New item',book('rf950','Adams','2019','Novel distinct study','10.1234/novel')),{options:{preserveIds:false}});
assert.equal((r.output.match(/id="bb5"/g)||[]).length,2);
r=await exercise('stale-original-input-swapped',a+b,corrected,{mergeOriginal:b+a});
assert.ok(/<ce:bib-reference id="bb10"\s*>[\s\S]*?Corrected Alpha evidence/.test(r.output));assert.ok(!r.output.includes('Unrelated Beta study'));
r=await exercise('changed-numeric-label-kept-from-external-set',a,corrected.replace('<ce:label>[1]</ce:label>','<ce:label>[99]</ce:label>'));
assert.equal(r.analysis[0].label,'[1]');assert.ok(r.output.includes('<ce:label>[99]</ce:label>'));
r=await exercise('malformed-updated-xml-emitted',a,corrected.replace('</sb:maintitle>',''));
assert.ok(r.output.includes('Corrected Alpha evidence'));assert.ok(r.toasts.some(t=>t.msg==='Merge Protocol Executed. Unchanged references preserved.'));
const pa=ref('bb5','Smith, 2020',book('rf5','Smith','2020','Alpha'));
const pb=ref('bb10','Jones, 2021',book('rf10','Jones','2021','Gamma'));
const unrelated=ref('bb850','Mary, 2018',book('rf850','Mary','2018','Delta'));
const potential=ref('bb900','Smith et al., 2020',book('rf900','Smith','2020','Bzzzz'));
r=await exercise('review-candidate-index-wrong-list',pa+pb,unrelated+potential,{mutate:async(state,o,u,opt)=>{
    const item=state.scanResults.find(r=>r.status==='potential_duplicate'&&r.updatedIndex===1&&r.originalIndex===0);
    assert.ok(item,JSON.stringify(state.scanResults));assert.equal(item.potentialMatches[0].index,1);
    engine(o,u,state,opt).chooseReviewCandidate(item.potentialMatches[0],item);
    const changed=state.scanResults.find(r=>r.uid===item.uid);assert.equal(changed.originalIndex,1);
    engine(o,u,state,opt).mergeDuplicate(changed.uid,changed.originalIndex);
}});
assert.ok(r.output.includes('Gamma'));assert.ok(!r.output.includes('id="bb5"'));assert.equal((r.output.match(/\bid="bb10"/g)||[]).length,2);assert.ok(/<ce:bib-reference id="bb10"\s*>[\s\S]*?Bzzzz/.test(r.output));
const state={scanResults:[]};engine(a+b,corrected,state).runAnalysis();
const dragBefore=engine(a+b,corrected,state).projectedSequence.map(x=>x.id);
engine(a+b,corrected,state,{draggedItemIndex:0}).handleDrop(1);
const dragAfter=engine(a+b,corrected,state).projectedSequence.map(x=>x.id);
assert.deepEqual(dragAfter,dragBefore);results.push({name:'drag-order-reset',before:dragBefore,after:dragAfter});
const selectState={scanResults:[{uid:'p',selected:true,status:'potential_duplicate',reviewed:false,originalIndex:0,updatedIndex:0}]};
engine(a,corrected,selectState,{filterStatus:'duplicate'}).bulkSelect(false);assert.equal(selectState.scanResults[0].selected,true);
results.push({name:'duplicate-filter-bulk-selection-does-nothing',state:selectState.scanResults});
r=await exercise('unchecked-correction-omits-original',a+b,corrected,{mutate:async state=>{state.scanResults[0].selected=false;}});
assert.ok(!r.output.includes('id="bb5"'));assert.ok(r.output.includes('id="bb10"'));
fs.writeFileSync('artifacts/reference-updater-audit/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({name:r.name,status:r.analysis?.map(a=>({status:a.status,match:a.matchType,original:a.originalIndex,updated:a.updatedIndex})),hasOutput:r.output!==null})),null,2));
