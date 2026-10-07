import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=fs.readFileSync('pages/ReferenceUpdater.tsx','utf8');
const ast=ts.createSourceFile('ReferenceUpdater.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['analysisKey','compareNameDateMetadata','hasDifferentNumericLabels','formatLabel','getSimilarity','parseReferences','runAnalysis','executeMergeAsync','parsedOriginalRefs','parsedUpdatedRefs','projectedSequence','mergeDuplicate','splitMatch','handleDrop','matchesScanFilter','bulkSelect','initiateUpdate']);
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
    const analysisSnapshotRef=state.analysisSnapshotRef??= {current:null};
    const analysisKeyRef=state.analysisKeyRef??= {current:null};
    analysisKeyRef.current=JSON.stringify([originalXml,updatedXml,options.addOrphans??true]);
    const params={originalXml,updatedXml,analysisSnapshotRef,analysisKeyRef,scanResults:state.scanResults||[],preserveIds:true,renumberInternal:true,addOrphans:true,sortAlphabetically:false,convertAndToAmp:false,autoUpdateSmartMatch:false,filterStatus:'all',draggedItemIndex:null,
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

export {engine,ref,book,sourceText,a,corrected,b};
