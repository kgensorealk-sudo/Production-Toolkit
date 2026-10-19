import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync('pages/WordToXml.tsx','utf8');
const ast=ts.createSourceFile('WordToXml.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations={};let defaultsExpression;
function visit(node){
 if(ts.isVariableDeclaration(node)){
  if(['convertHtmlToXml','captureSelectionAs','handleCopy'].includes(node.name.getText(ast)))declarations[node.name.getText(ast)]='const '+node.getText(ast)+';';
  if(node.name.getText(ast)==='[options, setOptions]')defaultsExpression=node.initializer.arguments[0].getText(ast);
 }
 ts.forEachChild(node,visit);
}visit(ast);
assert.ok(defaultsExpression);assert.equal(Object.keys(declarations).length,3);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText;
const dom=new JSDOM('<!doctype html><body></body>');
const {window}=dom;
const defaults=new Function(compile('return ('+defaultsExpression+');'))();
const dtdExports={};
new Function('exports','require','DOMParser',compile(fs.readFileSync('utils/wordScannerDtd.ts','utf8')))(dtdExports,name=>({default:JSON.parse(fs.readFileSync('utils/'+name.replace('./',''),'utf8'))}),window.DOMParser);
const {validateWordScannerCeFragment}=dtdExports;
const htmlExports={};new Function('exports','DOMParser',compile(fs.readFileSync('utils/wordScannerHtml.ts','utf8')))(htmlExports,window.DOMParser);
const convert=new Function('DOMParser','Node','useCallback','validateWordScannerCeFragment',compile(declarations.convertHtmlToXml)+';return convertHtmlToXml;')(window.DOMParser,window.Node,fn=>fn,validateWordScannerCeFragment);
const generatedCases=[];
const run=(html,opts={})=>{const output=convert(html,{...defaults,...opts});generatedCases.push({html,options:{...defaults,...opts},output});return output;};
const xml=output=>{
 const doc=new window.DOMParser().parseFromString('<root xmlns:ce="http://www.elsevier.com/xml/common/dtd">'+output+'</root>','application/xml');
 assert.equal(doc.querySelector('parsererror'),null,'Generated XML must parse');return doc;
};
function capture(html,startSelector,startOffset,endSelector,endOffset,{lostSelection=false,collapsed=false}={}){
 window.document.body.innerHTML='<div id="editor" contenteditable="true">'+html+'</div>';
 const editor=window.document.getElementById('editor'),range=window.document.createRange();
 range.setStart(editor.querySelector(startSelector).firstChild,startOffset);
 range.setEnd(editor.querySelector(endSelector).firstChild,endOffset);
 if(collapsed)range.collapse(true);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 const savedCaptureRangeRef={current:range.cloneRange()},state={};
 if(lostSelection){selection.removeAllRanges();const outside=window.document.createRange();outside.selectNodeContents(window.document.body);outside.collapse(true);selection.addRange(outside);}
 const fn=new Function('window','document','Node','editorRef','isHtmlMode','handleEditorInput','setToast','savedCaptureRangeRef',compile(declarations.captureSelectionAs)+';return captureSelectionAs;')(
  window,window.document,window.Node,{current:editor},false,()=>{state.updated=true;},t=>state.toast=t,savedCaptureRangeRef);
 fn('highlights');
 return {editor,state};
}
const failures=[];let count=0;
function test(name,fn){try{fn();count++;}catch(error){failures.push({name,error:error.message});}}
const highlight=body=>`<div data-ce-type="highlights" data-ce-title="Highlights">${body}</div>`;
test('partial selection captures only selected text',()=>{
 const {editor}=capture('<p>Before Selected After</p>','p',7,'p',15);
 const box=editor.querySelector('[data-ce-type="highlights"]');box.querySelector('.ce-capture-badge').remove();
 assert.equal(box.textContent,'Selected');assert.equal(editor.textContent,'Before Selected After');assert.equal(editor.querySelector('p p'),null);
});
test('multiple selected paragraphs have valid sibling structure',()=>{
 const {editor}=capture('<p>Before First</p><p>Second After</p>','p:first-child',7,'p:last-child',6);
 const box=editor.querySelector('[data-ce-type="highlights"]');box.querySelector('.ce-capture-badge').remove();
 assert.equal(box.textContent,'FirstSecond');assert.equal(box.querySelectorAll(':scope > p').length,2);assert.equal(editor.querySelector('p p'),null);
});
test('capture restores editor selection after toolbar focus',()=>{
 const {editor}=capture('<p>First highlight</p>','p',0,'p',15,{lostSelection:true});assert.ok(editor.querySelector('[data-ce-type="highlights"]'));
});
test('collapsed Highlights selection does not capture a paragraph',()=>{
 const {editor,state}=capture('<p>Do not capture without selecting</p>','p',3,'p',3,{collapsed:true});assert.equal(editor.querySelector('[data-ce-type]'),null);assert.equal(state.toast.type,'warn');
});
test('mixed paragraphs and lists retain all highlights in order',()=>{
 const doc=xml(run(highlight('<p>First paragraph</p><ul><li>Second item</li></ul><p>Third paragraph</p>')));
 assert.deepEqual([...doc.getElementsByTagName('ce:list-item')].map(n=>n.getElementsByTagName('ce:para')[0].textContent),['First paragraph','Second item','Third paragraph']);
});
test('line breaks create separate balanced formatted highlights',()=>{
 const doc=xml(run(highlight('<p><b>First<br>Second</b></p>')));
 const items=[...doc.getElementsByTagName('ce:list-item')];assert.equal(items.length,2);assert.deepEqual(items.map(n=>n.getElementsByTagName('ce:para')[0].textContent),['First','Second']);assert.ok(items.every(n=>n.getElementsByTagName('ce:bold').length===1));
});
test('direct text surrounding blocks is retained',()=>{
 const doc=xml(run(highlight('First<p>Second</p>Third')));
 assert.deepEqual([...doc.getElementsByTagName('ce:para')].map(n=>n.textContent),['First','Second','Third']);
});
test('literal entity-looking text remains literal after conversion',()=>{
 const doc=xml(run('<p>&amp;lt; &amp;amp; &lt; &amp; &#945;</p>',{wrapInParagraphs:true}));
 assert.equal(doc.documentElement.textContent,'&lt; &amp; < & α');
});
test('XML text remains valid when entity option is off',()=>{
 assert.equal(xml(run('<p>1 &lt; 2 &amp; 3</p>',{encodeEntities:false,wrapInParagraphs:true})).documentElement.textContent,'1 < 2 & 3');
});
test('uppercase list starts and explicit values are retained',()=>{
 const doc=xml(run('<ol type="A" start="3"><li>Third</li><li value="5">Fifth</li></ol>'));
 assert.deepEqual([...doc.getElementsByTagName('ce:label')].map(n=>n.textContent),['C','E']);
});
test('paragraph and list prefixes cannot generate duplicate IDs',()=>{
 const output=run('<p>Text</p><ul><li>Item</li></ul>',{wrapInParagraphs:true,listIdPrefix:'p',listItemIdPrefix:'p'});
 const ids=[...xml(output).querySelectorAll('[id]')].map(n=>n.getAttribute('id'));assert.equal(new Set(ids).size,ids.length);
});
test('capture title is escaped as XML text',()=>{
 const doc=xml(run('<div data-ce-type="highlights" data-ce-title="R&amp;D &lt;tests&gt;"><p>Item</p></div>'));
 assert.equal(doc.getElementsByTagName('ce:section-title')[0].textContent,'R&D <tests>');
});
test('nested tables are rejected rather than silently flattened',()=>assert.throws(()=>run('<table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td></tr></table>'),/Nested tables/));
test('bad prefixes fail without emitting broken XML',()=>assert.throws(()=>run('<p>Text</p>',{wrapInParagraphs:true,paraIdPrefix:'p" bad="'}),/prefix/i));
test('raw text line breaks retain paragraph boundaries',()=>{
 assert.deepEqual([...xml(run('First\nSecond',{wrapInParagraphs:true})).getElementsByTagName('ce:para')].map(n=>n.textContent),['First','Second']);
});
test('headers and footers retain text',()=>{
 const output=xml(run('<header>Header</header><p>Body</p><footer>Footer</footer>',{wrapInParagraphs:true}));
 assert.deepEqual([...output.getElementsByTagName('ce:para')].map(n=>n.textContent),['Header','Body','Footer']);
});
test('nested inline selection retains formatting and surrounding text',()=>{
 const {editor}=capture('<p>Before <b>Selected</b> After</p>','b',0,'b',8);
 const box=editor.querySelector('[data-ce-type="highlights"]');box.querySelector('.ce-capture-badge').remove();
 assert.equal(box.textContent,'Selected');assert.equal(box.querySelector('b').textContent,'Selected');assert.equal(editor.textContent,'Before Selected After');
});
test('recapturing an existing highlight is rejected',()=>{
 const {editor,state}=capture(highlight('<p>Existing</p>'),'p',0,'p',8);
 assert.equal(editor.querySelectorAll('[data-ce-type="highlights"]').length,1);assert.equal(state.toast.type,'warn');
});
test('nested lists retain each highlight once',()=>{
 const output=xml(run(highlight('<ul><li>First<ul><li>Nested</li></ul>After nested</li><li>Last</li></ul>')));
 assert.deepEqual([...output.getElementsByTagName('ce:para')].map(n=>n.textContent),['First','Nested','After nested','Last']);
 const ids=[...output.querySelectorAll('[id]')].map(n=>n.getAttribute('id'));assert.equal(ids.length,new Set(ids).size);
});
test('invalid root names and ID ranges fail explicitly',()=>{
 assert.throws(()=>run('<p>Text</p>',{wrapInRoot:true,rootTag:'ce:sections bad="yes"'}),/Root tag/);
 assert.throws(()=>run('<p>Text</p>',{paraIdStart:NaN}),/ID start/);
 assert.throws(()=>run('<p>Text</p>',{paraIdStep:0}),/ID step/);
 assert.throws(()=>run('<p>A</p><p>B</p>',{wrapInParagraphs:true,paraIdStart:9999}),/four-digit IDs/);
});
const captureTypes=['highlights','acknowledgment','abstract','section','appendix','conflict-of-interest','data-availability','jel'];
for(const dtdVersion of ['5.7','5.6'])for(const type of captureTypes)for(const addParagraphIds of [true,false])for(const wrapInParagraphs of [true,false])
test(`DTD capture ${dtdVersion} ${type} IDs ${addParagraphIds} paragraphs ${wrapInParagraphs}`,()=>{
 const output=run(`<div data-ce-type="${type}"><h2>First heading</h2><p>A <b>bold</b> paragraph &amp; text.</p><p>Second paragraph.</p></div>`,{dtdVersion,addParagraphIds,wrapInParagraphs});
 validateWordScannerCeFragment(output,dtdVersion);
 const doc=xml(output);assert.ok(doc.documentElement.textContent.includes('Second paragraph.'));
 if(type==='acknowledgment')assert.ok(doc.getElementsByTagName('ce:acknowledgment')[0].getElementsByTagName('ce:para').length>=2);
 if(type==='abstract')assert.ok(doc.getElementsByTagName('ce:abstract-sec')[0].getElementsByTagName('ce:simple-para').length>=2);
 if(type==='appendix'){assert.equal(doc.getElementsByTagName('ce:appendix').length,0);assert.equal(doc.getElementsByTagName('ce:appendices').length,1);}
 if(['conflict-of-interest','data-availability'].includes(type))assert.ok(doc.getElementsByTagName('ce:'+type)[0].hasAttribute('id'));
});
for(const embedListInPara of [true,false])test('nested list DTD structure with paragraph option off '+embedListInPara,()=>{
 const output=run('<ul><li>Parent<ul><li>Child</li></ul></li></ul>',{wrapInParagraphs:false,embedListInPara});
 const doc=xml(output);assert.ok([...doc.getElementsByTagName('ce:list-item')].every(item=>item.children.length && item.getElementsByTagName('ce:para').length));
 validateWordScannerCeFragment(output);
});
test('captured sections only excludes unselected prose and objects',()=>{
 const output=run('<p>Before</p><img src="ignored.png">'+highlight('<p>Only this</p>')+'<p>After</p>',{outputScope:'captures'});
 assert.ok(output.includes('Only this'));assert.ok(!output.includes('Before'));assert.ok(!output.includes('After'));
});
test('unsupported objects block output instead of losing content',()=>assert.throws(()=>run('<p>Text<img src="figure.png" alt="Diagram"></p>'),/cannot preserve/));
test('incomplete and overlapping captures are rejected',()=>{
 assert.throws(()=>run('<div data-ce-type="acknowledgment"></div>'),/no text/);
 assert.throws(()=>run('<div data-ce-type="acknowledgment">'+highlight('<p>Nested</p>')+'</div>'),/overlap/);
 assert.throws(()=>run('<div data-ce-type="unknown"><p>Text</p></div>'),/not supported/);
});
test('Word wrappers retain text without inventing superscripts',()=>{
 const output=run('<p>Alpha<o:p>Beta</o:p>Gamma<span style="position:relative;top:3px">Delta</span></p>',{wrapInParagraphs:true});
 assert.equal(xml(output).documentElement.textContent,'AlphaBetaGammaDelta');assert.ok(!output.includes('ce:sup'));
});
test('table CALS structure preserves merged cells and cell paragraphs',()=>{
 const output=run('<table><tr><td colspan="2" rowspan="2"><p>First</p><p>Second</p></td><td>A</td></tr><tr><td>B</td></tr></table>');
 const doc=xml(output),entry=doc.getElementsByTagName('entry')[0];assert.equal(doc.getElementsByTagName('tgroup')[0].getAttribute('cols'),'3');
 assert.equal(entry.getAttribute('namest'),'c1');assert.equal(entry.getAttribute('nameend'),'c2');assert.equal(entry.getAttribute('morerows'),'1');assert.ok(entry.getElementsByTagName('ce:br').length);
});
for(const version of ['5.7','5.6'])test('DTD checker rejects invalid structures and attributes '+version,()=>{
 for(const invalid of ['<ce:acknowledgment>bare text</ce:acknowledgment>','<ce:abstract><ce:para>Wrong wrapper</ce:para></ce:abstract>',
  '<ce:list><ce:list-item>bare text</ce:list-item></ce:list>','<ce:appendix/>','<ce:conflict-of-interest><ce:para>A</ce:para></ce:conflict-of-interest>',
  '<ce:bold><ce:para>A</ce:para></ce:bold>','<ce:para foo="bar">A</ce:para>','<ce:para id="p0005"/><ce:para id="p0005"/>'])assert.throws(()=>validateWordScannerCeFragment(invalid,version));
});
test('Word list levels become nested lists',()=>{
 const doc=xml(run('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1. Parent</p><p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">a. Child</p><p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">2. Next</p>'));
 const lists=doc.getElementsByTagName('ce:list');assert.equal(lists.length,2);assert.equal(lists[0].getElementsByTagName('ce:list')[0],lists[1]);
 assert.ok(lists[0].textContent.indexOf('Parent')<lists[0].textContent.indexOf('Child'));assert.ok(lists[0].textContent.indexOf('Child')<lists[0].textContent.indexOf('Next'));
});
test('separate Word list identities do not merge',()=>{
 const doc=xml(run('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1. First</p><p class="MsoListParagraph" style="mso-list:l1 level1 lfo2">1. Second</p>'));
 assert.equal([...doc.documentElement.children].filter(node=>node.tagName==='ce:list').length,2);
});
for(const embedListInPara of [true,false])test('native nested list preserves content order '+embedListInPara,()=>{
 const doc=xml(run('<ul><li><p>Before</p><ul><li>Child</li></ul><p>After</p></li></ul>',{embedListInPara,wrapInParagraphs:false}));
 const text=doc.documentElement.textContent;assert.ok(text.indexOf('Before')<text.indexOf('Child'));assert.ok(text.indexOf('Child')<text.indexOf('After'));
});
test('empty list items retain a required paragraph when IDs are off',()=>{
 const doc=xml(run('<ul><li></li><li>Second</li></ul>',{addParagraphIds:false,cleanEmptyTags:true}));assert.equal(doc.getElementsByTagName('ce:list-item')[0].getElementsByTagName('ce:para').length,1);
});
test('JEL paragraphs remain separate keyword values',()=>{
 const doc=xml(run('<div data-ce-type="jel"><p>D20</p><p>G31</p></div>'));
 assert.deepEqual([...doc.getElementsByTagName('ce:text')].map(node=>node.textContent),['D20','G31']);
});
test('inline root wrapper does not insert whitespace into text',()=>{
 const doc=xml(run('A<b>B</b>C',{wrapInRoot:true,rootTag:'ce:para',wrapInParagraphs:false}));assert.equal(doc.getElementsByTagName('ce:para')[0].textContent,'ABC');
});
test('mandatory section IDs still reject invalid allocation settings',()=>assert.throws(()=>run('<div data-ce-type="conflict-of-interest"><p>A</p></div>',{addParagraphIds:false,paraIdStep:0}),/ID start/));
test('literal entity-looking nonbreaking space remains literal',()=>assert.equal(xml(run('<p>&amp;nbsp;</p>',{wrapInParagraphs:true})).documentElement.textContent,'&nbsp;'));
test('HTML source cleanup removes active attributes and preserves Word formatting',()=>{
 const cleaned=htmlExports.sanitizeWordScannerHtml('<style>body{display:none}</style><script>bad()</script><p onclick="bad()" class="MsoListParagraph" style="mso-list:l0 level2 lfo1;font-weight:bold">Text <b>bold</b><img src="data:," onerror="bad()" alt="Diagram"><a href="java&#x73;cript:bad()">Link</a></p>');
 const doc=new window.DOMParser().parseFromString(cleaned,'text/html');assert.equal(doc.querySelector('script,style,[onclick],[onerror],[src]'),null);
 assert.equal(doc.querySelector('a').getAttribute('href'),null);assert.ok(doc.querySelector('p').getAttribute('style').includes('level2'));assert.equal(doc.querySelector('b').textContent,'bold');assert.equal(doc.querySelector('img').getAttribute('alt'),'Diagram');
});
test('abstract conversion does not consume IDs for discarded intermediate paragraphs',()=>{
 const output=run('<div data-ce-type="abstract"><p>Abstract text.</p></div><p>Body text.</p>',{wrapInParagraphs:true,paraIdStart:9999});
 const doc=xml(output);assert.equal(doc.getElementsByTagName('ce:simple-para')[0].getAttribute('id'),'sp9999');assert.equal(doc.getElementsByTagName('ce:para')[0].getAttribute('id'),'p9999');
});
for(const dtdVersion of ['5.7','5.6'])test('table caption and row group order are preserved '+dtdVersion,()=>{
 const doc=xml(run('<table><caption>A <b>caption</b></caption><tfoot><tr><td>Foot</td></tr></tfoot><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Body</td></tr></tbody></table>',{dtdVersion}));
 assert.equal(doc.getElementsByTagName('ce:caption')[0].textContent,'A caption');
 assert.deepEqual([...doc.getElementsByTagName('row')].map(row=>row.textContent),['Head','Body','Foot']);
});
test('merged cells cannot spill into a different row group',()=>assert.throws(()=>run('<table><thead><tr><th rowspan="2">Head</th></tr></thead><tbody><tr><td>Body</td></tr></tbody></table>'),/cannot cross/));
test('malformed outer HTML does not discard trailing editorial text',()=>{
 const doc=xml(run('</div><p>First</p><p>Second</p>',{wrapInParagraphs:true}));assert.deepEqual([...doc.getElementsByTagName('ce:para')].map(node=>node.textContent),['First','Second']);
});
test('full Word HTML reads all body content',()=>{
 const doc=xml(run('<html><head><title>Metadata only</title></head><body><p>First</p><p>Second</p></body></html>',{wrapInParagraphs:true}));assert.deepEqual([...doc.getElementsByTagName('ce:para')].map(node=>node.textContent),['First','Second']);
});
for(const denied of [true,false]){
 try{
  const state={};
  const fn=new Function('navigator','xmlOutput','setIsCopied','setToast','setTimeout',compile(declarations.handleCopy)+';return handleCopy;')(
   {clipboard:{writeText:()=>denied?Promise.reject(new Error('denied')):Promise.resolve()}},'<ce:para>Text</ce:para>',value=>state.copied=value,value=>state.toast=value,()=>{});
  await fn();assert.equal(state.copied,!denied);assert.equal(state.toast.type,denied?'error':'success');count++;
 }catch(error){failures.push({name:'Clipboard '+(denied?'denied':'allowed'),error:error.message});}
}
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
console.log(`${count} Word rich-text scanner cases passed; ${failures.length} failed.`);
export {run,defaults,xml,generatedCases,validateWordScannerCeFragment};
