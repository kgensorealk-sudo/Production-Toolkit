import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {formulaFences, updateFormulaFence, setFormulaTokenText, updateFormulaSpaceWidth, insertFormulaSymbol, formulaSymbolTag, editFormulaToken, expandFormulaFences, insertFormulaSnippet, insertFormulaTokenAfter, removeFormulaToken, exportFormulaXml, formatFormulaXml, formulaMetadata, formulaTokens, parseFormula, renderFormulaPreview, texToMathML, updateFormulaMetadata} from '../utils/formulaStudio.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['document','DOMParser','XMLSerializer']) globalThis[name] = dom.window[name];
let passed = 0;
const test = (name, action) => { action(); passed++; console.log(`PASS ${name}`); };
const sample = '<ce:display id="display1"><ce:formula id="fo1"><mml:math altimg="a.svg"><mml:mi id="symbol1">x</mml:mi><mml:mi/><mml:mo>+</mml:mo><mml:mfenced><mml:mi>x</mml:mi><mml:mn>2</mml:mn></mml:mfenced></mml:math></ce:formula></ce:display>';
test('metadata and editing do not inject namespace declarations into article fragments', () => {
    const updated = updateFormulaMetadata(sample, 'fo1', 'si99.svg', true);
    assert.ok(updated.includes('altimg="si99.svg"'));
    assert.ok(!updated.includes('xmlns'));
    assert.ok(!formatFormulaXml(updated, true).includes('xmlns'));
    assert.ok(!editFormulaToken(updated, 'x', 'mi', 0, el => { el.textContent = 'y'; }).includes('xmlns'));
    const explicit = '<mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mi>x</mml:mi></mml:math>';
    assert.ok(updateFormulaMetadata(explicit, '', 'si2.svg', false).includes('xmlns:mml='));
});

test('preview has native MathML namespaces and source indexes, without selectable synthetic fences', () => {
    const preview = new DOMParser().parseFromString(renderFormulaPreview(sample), 'text/xml');
    assert.equal(preview.documentElement.namespaceURI, 'http://www.w3.org/1998/Math/MathML');
    assert.equal(preview.documentElement.getAttribute('display'), 'block');
    assert.deepEqual([...preview.querySelectorAll('[data-token-index]')].map(el => [el.getAttribute('data-token-index'), el.textContent]), [['0','x'],['1',''],['2','+'],['3','x'],['4','2']]);
    assert.equal(preview.querySelectorAll('mfenced').length, 0);
    assert.equal(preview.querySelectorAll('mrow > mo').length, 3);
});
test('nested fractions and scripts preserve structure and font variants', () => {
    const xml = '<math><mfrac><msup><mi mathvariant="bold">x</mi><mn>2</mn></msup><msqrt><mi>ab</mi></msqrt></mfrac></math>';
    const preview = renderFormulaPreview(xml);
    assert.match(preview, /<mfrac><msup>/);
    assert.match(preview, /mathvariant="bold"/);
    assert.ok(!preview.includes('font-style: italic'));
    assert.match(preview, /display="inline"/);
});
test('editing repeated tokens changes only the selected source occurrence', () => {
    const updated = editFormulaToken(sample, 'x', 'mi', 3, el => { el.textContent = 'y & <z>'; });
    const tokens = formulaTokens(parseFormula(updated));
    assert.deepEqual(tokens.map(el=>el.textContent), ['x','','+','y & <z>','2']);
    assert.equal(parseFormula(updated).getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'mfenced').length, 1);
});
test('stale selections and malformed XML cannot trigger broad fallback replacement', () => {
    assert.throws(()=>editFormulaToken(sample,'wrong','mi',2,el=>el.remove()));
    assert.throws(()=>editFormulaToken('<math><mi>x</math>','x','mi',0,el=>el.remove()));
    assert.equal(renderFormulaPreview('<math><mi>x</math>'), null);
});
test('metadata preserves all non-formula IDs and safely escapes attribute values', () => {
    const updated = updateFormulaMetadata(sample, 'fo"2&', 'b"&.svg', false);
    const doc = parseFormula(updated);
    assert.equal((doc.getElementsByTagNameNS('http://www.elsevier.com/xml/common/dtd', 'formula')[0] || null).getAttribute('id'), 'fo"2&');
    assert.equal(doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'mi')[0].getAttribute('id'), 'symbol1');
    assert.equal(doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'math')[0].getAttribute('altimg'), 'b"&.svg');
    assert.equal((doc.getElementsByTagNameNS('http://www.elsevier.com/xml/common/dtd', 'display')[0] || null), null);
    const wrapped = parseFormula(updateFormulaMetadata(updated, 'fo3', '', true));
    assert.equal(wrapped.getElementsByTagNameNS('http://www.elsevier.com/xml/common/dtd', 'display').length, 1);
    assert.equal(wrapped.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'math')[0].hasAttribute('altimg'), false);
});
test('metadata changes preserve attributed display wrappers', () => {
    const doc = parseFormula(updateFormulaMetadata(sample, 'fo2', 'b.svg', true));
    assert.equal(doc.getElementsByTagNameNS('http://www.elsevier.com/xml/common/dtd', 'display').length, 1);
    assert.equal((doc.getElementsByTagNameNS('http://www.elsevier.com/xml/common/dtd', 'display')[0] || null).getAttribute('id'), 'display1');
});
test('preview drops active HTML, event handlers, links and annotation payloads', () => {
    const preview = renderFormulaPreview('<math onclick="alert(1)"><mi href="javascript:alert(1)" onmouseover="alert(1)">x</mi><semantics><mi>y</mi><annotation-xml><img src="x" onerror="alert(1)"/></annotation-xml></semantics></math>');
    assert.ok(preview);
    assert.ok(!/onclick|onmouseover|onerror|href|<img|annotation-xml/.test(preview));
});
test('TeX default kinetics sample builds actual subscript fractions', () => {
    const doc = parseFormula(texToMathML('\\ln \\frac{C_0}{C_t} = K_{app} t'));
    const frac = doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'mfrac')[0];
    assert.equal(frac.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'msub').length, 2);
    assert.equal(frac.textContent, 'C0Ct');
    assert.ok(!doc.documentElement.textContent.includes('_'));
});
test('TeX nested groups, roots, both script orders and operators remain structured', () => {
    for (const expression of ['x_1^2', 'x^2_1']) assert.equal(parseFormula(texToMathML(expression)).getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'msubsup').length, 1);
    const doc = parseFormula(texToMathML('\\frac{1}{\\sqrt{x^2 + \\frac{a}{b}}} \\leq \\infty'));
    assert.equal(doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'mfrac').length, 2);
    assert.equal(doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'msqrt').length, 1);
    assert.ok(doc.documentElement.textContent.includes('≤∞'));
});
test('unsupported or incomplete TeX fails instead of exporting corrupted XML', () => {
    for (const expression of ['\\unknown{x}', '\\frac{x}', 'x^{2', 'x}', 'x_1_2']) assert.throws(()=>texToMathML(expression));
    assert.ok(renderFormulaPreview(texToMathML('x < y & z')));
});
test('annotation payloads cannot shift preview selection or receive edits', () => {
    const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mi>x</mi><annotation-xml encoding="MathML-Presentation"><mi>hidden</mi></annotation-xml></semantics><mi>y</mi></math>';
    assert.deepEqual(formulaTokens(parseFormula(xml)).map(el=>el.textContent), ['x','y']);
    const preview = new DOMParser().parseFromString(renderFormulaPreview(xml), 'text/xml');
    assert.deepEqual([...preview.querySelectorAll('[data-token-index]')].map(el=>[el.textContent,el.getAttribute('data-token-index')]), [['x','0'],['y','1']]);
    const edited = parseFormula(editFormulaToken(xml, 'y', 'mi', 1, el=>{ el.textContent='changed'; }));
    assert.equal(edited.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML','annotation-xml')[0].textContent, 'hidden');
    assert.deepEqual(formulaTokens(edited).map(el=>el.textContent), ['x','changed']);
});
test('editor excludes unsupported subtrees and later formula previews consistently', () => {
    const xml = '<math><mi>x</mi><unsupported><mi>hidden</mi></unsupported><mi>y</mi></math><math><mi>later</mi></math>';
    assert.deepEqual(formulaTokens(parseFormula(xml)).map(el=>el.textContent), ['x','y']);
});
test('format and compact preserve whitespace tokens, multiline text and CDATA', () => {
    const xml = '<math>\n<mrow><mtext> </mtext><mtext>hello\nworld</mtext><mi> a </mi><mtext><![CDATA[a < b\nc]]></mtext></mrow>\n</math>';
    const contents = value => Array.from(parseFormula(value).querySelectorAll('mtext, mi')).map(el=>el.textContent);
    for (const pretty of [true,false]) {
        const formatted = formatFormulaXml(xml, pretty);
        assert.deepEqual(contents(formatted), contents(xml));
        assert.deepEqual(contents(formatFormulaXml(formatted, !pretty)), contents(xml));
    }
});
test('formatting preserves annotations, mixed content, and xml:space subtrees', () => {
    const xml = '<math><mrow xml:space="preserve"> \n<mi>x</mi>\n </mrow><semantics><mi>y</mi><annotation-xml><record> \n<field>a</field> tail </record></annotation-xml></semantics></math>';
    for (const pretty of [true,false]) {
        const before = parseFormula(xml), after = parseFormula(formatFormulaXml(xml, pretty));
        for (const tag of ['mrow','annotation-xml']) assert.equal(after.getElementsByTagName(tag)[0].textContent, before.getElementsByTagName(tag)[0].textContent);
    }
});
test('downloads parse standalone with CE, MathML and xlink namespaces', () => {
    const xml = '<ce:display><ce:formula id="fo1"><mml:math><mml:mi xlink:href="#symbol">x</mml:mi></mml:math></ce:formula></ce:display>';
    const output = exportFormulaXml(xml);
    const doc = new DOMParser().parseFromString(output,'text/xml');
    assert.equal(doc.getElementsByTagName('parsererror').length,0);
    assert.equal(doc.documentElement.namespaceURI,'http://www.elsevier.com/xml/common/dtd');
    assert.equal(doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML','mi')[0].getAttributeNS('http://www.w3.org/1999/xlink','href'),'#symbol');
    assert.ok(output.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.throws(()=>exportFormulaXml('<math/><math/>'));
});
test('bare MathML accepts a formula ID without overwriting its own IDs', () => {
    const xml = '<math id="math1"><mi id="token1">x</mi></math>';
    const updated = updateFormulaMetadata(xml,'new-formula','',false);
    const doc = parseFormula(updated);
    assert.equal(doc.getElementsByTagNameNS('http://www.elsevier.com/xml/common/dtd','formula')[0].getAttribute('id'),'new-formula');
    assert.equal(doc.getElementsByTagName('math')[0].getAttribute('id'),'math1');
    assert.equal(doc.getElementsByTagName('mi')[0].getAttribute('id'),'token1');
    assert.equal(formulaMetadata(updated).id,'new-formula');
    assert.equal(formulaMetadata(xml).id,'');
    assert.equal(formulaMetadata('<math/>').altimg,'');
});
test('metadata detects native block layout and can switch it inline', () => {
    const xml = '<math display="block"><mi>x</mi></math>';
    assert.equal(formulaMetadata(xml).display,true);
    const updated = updateFormulaMetadata(xml,'','',false);
    assert.equal(formulaMetadata(updated).display,false);
    assert.match(renderFormulaPreview(updated), /display="inline"/);
});
test('palette insertion targets MathML with any prefix, default namespace or empty root', () => {
    for (const xml of ['<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>', '<math xmlns="http://www.w3.org/1998/Math/MathML"/>', '<mml:math/>', '<math/>']) {
        const output = insertFormulaSnippet(xml, '<mml:mi>z</mml:mi>');
        const doc = parseFormula(output);
        assert.equal(doc.documentElement.children.length, 1);
        assert.equal(doc.documentElement.firstElementChild.lastElementChild.textContent, 'z');
        assert.equal(doc.documentElement.firstElementChild.lastElementChild.namespaceURI, 'http://www.w3.org/1998/Math/MathML');
        assert.ok(renderFormulaPreview(output).includes('>z</mi>'));
        assert.ok(exportFormulaXml(output));
    }
    assert.throws(()=>insertFormulaSnippet('<ce:formula/>','<mml:mi>x</mml:mi>'), /math/);
});
test('inserting after an operand groups it without changing fraction or script arity', () => {
    for (const [name,arity] of [['mfrac',2],['mroot',2],['msub',2],['msup',2],['munder',2],['mover',2],['msubsup',3],['munderover',3],['mmultiscripts',3]]) {
        for (let index=0;index<arity;index++) {
            const xml = `<math><${name}>${Array.from({length:arity},(_,i)=>`<mi id="operand${i}">${i}</mi>`).join('')}</${name}></math>`;
            const output = editFormulaToken(xml,String(index),'mi',index,insertFormulaTokenAfter);
            const parent = parseFormula(output).getElementsByTagName(name)[0];
            assert.equal(parent.children.length,arity);
            assert.equal(parent.children[index].localName,'mrow');
            assert.equal(parent.children[index].firstElementChild.getAttribute('id'),`operand${index}`);
            assert.equal(parent.children[index].textContent,`${index}x`);
            assert.throws(()=>editFormulaToken(xml,String(index),'mi',index,removeFormulaToken), /required position/);
        }
    }
});
test('ordinary row insertion and deletion remain available', () => {
    const xml='<math><mrow><mi>a</mi><mi>b</mi></mrow></math>';
    const added=editFormulaToken(xml,'a','mi',0,insertFormulaTokenAfter);
    assert.deepEqual(formulaTokens(parseFormula(added)).map(el=>el.textContent),['a','x','b']);
    const deleted=editFormulaToken(added,'a','mi',0,removeFormulaToken);
    assert.deepEqual(formulaTokens(parseFormula(deleted)).map(el=>el.textContent),['x','b']);
});
test('clearing an operand value preserves its structural position', () => {
    const output=editFormulaToken('<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>','a','mi',0,el=>{el.textContent='';});
    const fraction=parseFormula(output).getElementsByTagName('mfrac')[0];
    assert.equal(fraction.children.length,2);
    assert.equal(fraction.children[0].textContent,'');
    assert.equal(fraction.children[1].textContent,'b');
});
test('Unicode mathematical letters survive TeX conversion as complete code points', () => {
    for (const char of ['𝑥','𝛼','𝔸']) {
        const output=texToMathML(`${char}^2 + 1`);
        const doc=parseFormula(output);
        const tokens=formulaTokens(doc);
        assert.equal(tokens[0].textContent,char);
        assert.equal(tokens[0].localName,'mi');
        assert.equal(doc.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML','msup')[0].children.length,2);
        assert.ok(renderFormulaPreview(output));
    }
});
test('fence expansion preserves attributes and namespace for every supported prefix form', () => {
    for (const [prefix,ns] of [['',''],['m:',' xmlns:m="http://www.w3.org/1998/Math/MathML"'],['mml:','']]) {
        const xml=`<${prefix}math${ns}><${prefix}mfenced id="f1" class="custom" mathcolor="red" mathsize="2em" displaystyle="true" xml:lang="en" open="[" close="]"><${prefix}mi>x</${prefix}mi><${prefix}mi>y</${prefix}mi></${prefix}mfenced></${prefix}math>`;
        const doc=parseFormula(expandFormulaFences(xml));
        const row=Array.from(doc.querySelectorAll('*')).find(el=>el.localName==='mrow');
        for (const [key,value] of [['id','f1'],['class','custom'],['mathcolor','red'],['mathsize','2em'],['displaystyle','true'],['xml:lang','en']]) assert.equal(row.getAttribute(key),value);
        assert.equal(row.prefix,prefix ? prefix.slice(0,-1) : null);
        assert.equal(row.textContent,'[x,y]');
        assert.equal(row.hasAttribute('open'),false);
        assert.equal(Array.from(doc.querySelectorAll('*')).some(el=>el.localName==='mfenced'),false);
    }
});
test('nested fences preserve empty delimiters and Unicode separators', () => {
    const xml='<math><mfenced open="" close="" separators="𝄞"><mfenced mathcolor="blue"><mi>a</mi></mfenced><mi>b</mi><mi>c</mi></mfenced></math>';
    const doc=parseFormula(expandFormulaFences(xml));
    assert.equal(doc.documentElement.textContent,'(a)𝄞b𝄞c');
    assert.equal(doc.querySelector('[mathcolor="blue"]').localName,'mrow');
});
test('clearing a token preserves source and preview indexes for later selection', () => {
    const cleared = editFormulaToken('<math><mi>x</mi><mo>+</mo><mi>y</mi></math>','x','mi',0,el=>{el.textContent='';});
    assert.deepEqual(formulaTokens(parseFormula(cleared)).map(el=>el.textContent),['','+','y']);
    const preview = new DOMParser().parseFromString(renderFormulaPreview(cleared),'text/xml');
    assert.equal(preview.querySelector('[data-token-index="2"]').textContent,'y');
    const replaced = insertFormulaSymbol(cleared,'α',{text:'',tagName:'mi',nodeIndex:0});
    assert.deepEqual(formulaTokens(parseFormula(replaced)).map(el=>el.textContent),['α','+','y']);
});
test('quick-symbol insertion creates correctly typed tokens beside numbers and identifiers', () => {
    const output=insertFormulaSymbol('<math><mn>2</mn></math>','α',{text:'2',tagName:'mn',nodeIndex:0});
    assert.deepEqual(formulaTokens(parseFormula(output)).map(el=>[el.localName,el.textContent]),[['mn','2'],['mi','α']]);
    for (const symbol of ['∫','∑','±','≤','∞','→','∂']) {
        assert.equal(formulaSymbolTag(symbol),'mo');
        const doc=parseFormula(insertFormulaSymbol('<math><mi>x</mi></math>',symbol));
        assert.equal(formulaTokens(doc)[1].localName,'mo');
    }
});
test('quick symbols replace empty operands without breaking structure or losing IDs', () => {
    const xml='<math><mfrac><mn id="num"/><mi>b</mi></mfrac></math>';
    const doc=parseFormula(insertFormulaSymbol(xml,'α',{text:'',tagName:'mn',nodeIndex:0}));
    const fraction=doc.getElementsByTagName('mfrac')[0];
    assert.equal(fraction.children.length,2);
    assert.equal(fraction.firstElementChild.localName,'mi');
    assert.equal(fraction.firstElementChild.getAttribute('id'),'num');
    assert.equal(fraction.firstElementChild.textContent,'α');
    const added=parseFormula(insertFormulaSymbol('<math><mfrac><mn>2</mn><mi>b</mi></mfrac></math>','α',{text:'2',tagName:'mn',nodeIndex:0}));
    assert.equal(added.getElementsByTagName('mfrac')[0].children.length,2);
    assert.equal(added.getElementsByTagName('mfrac')[0].firstElementChild.localName,'mrow');
});
test('whitespace edits keep a valid selection without weakening stale-selection checks', () => {
    const xml='<math><mi>x</mi><mo>+</mo><mi> x </mi></math>';
    const updated=editFormulaToken(xml,' x ','mi',2,(el,doc)=>{
        const wrapper=doc.createElementNS('http://www.w3.org/1998/Math/MathML','mml:msup');
        el.replaceWith(wrapper);wrapper.appendChild(el);
        const exponent=doc.createElementNS('http://www.w3.org/1998/Math/MathML','mml:mn');exponent.textContent='2';wrapper.appendChild(exponent);
    });
    assert.equal(parseFormula(updated).getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML','msup')[0].firstElementChild.textContent,' x ');
    assert.throws(()=>editFormulaToken(xml,' y ','mi',2,el=>el.remove()),/selected symbol has changed/);
});
test('text editing preserves exact surrounding spaces and line breaks', () => {
    const xml='<math><mtext> hello\nworld </mtext></math>';
    const token=formulaTokens(parseFormula(xml))[0];
    assert.equal(token.textContent,' hello\nworld ');
    const output=editFormulaToken(xml,token.textContent,'mtext',0,el=>setFormulaTokenText(el,token.textContent+'!'));
    assert.equal(formulaTokens(parseFormula(output))[0].textContent,' hello\nworld !');
});
test('generic text editing cannot add content to a spacing node', () => {
    assert.throws(()=>editFormulaToken('<math><mspace width="1em"/></math>','','mspace',0,el=>setFormulaTokenText(el,'z')),/Space width/);
});
test('space width edits preserve attributes and operand structure', () => {
    const xml='<math><mfrac><mspace id="space1" width="1em" height="1em" depth="0.2em"/><mi>b</mi></mfrac></math>';
    const doc=parseFormula(updateFormulaSpaceWidth(xml,0,' 0.5em '));
    const fraction=doc.getElementsByTagName('mfrac')[0], space=doc.getElementsByTagName('mspace')[0];
    assert.equal(fraction.children.length,2);
    assert.equal(space.getAttribute('id'),'space1');
    assert.equal(space.getAttribute('width'),'0.5em');
    assert.equal(space.getAttribute('height'),'1em');
    assert.equal(space.getAttribute('depth'),'0.2em');
    assert.equal(space.childNodes.length,0);
    assert.equal(parseFormula(updateFormulaSpaceWidth(xml,0,'')).getElementsByTagName('mspace')[0].hasAttribute('width'),false);
});
test('space controls reject invalid values and can repair imported text children', () => {
    const xml='<math><mspace width="1em">bad content</mspace></math>';
    for (const width of ['0','8px','-0.2em','thinmathspace','50%']) {
        const space=parseFormula(updateFormulaSpaceWidth(xml,0,width)).getElementsByTagName('mspace')[0];
        assert.equal(space.childNodes.length,0);
        assert.equal(space.getAttribute('width'),width);
    }
    for (const width of ['hello','1','1em; color:red','NaNpx']) assert.throws(()=>updateFormulaSpaceWidth(xml,0,width),/Enter a width/);
    assert.throws(()=>updateFormulaSpaceWidth('<math><mi>x</mi></math>',0,'1em'),/Select the spacing/);
});
test('rendered nested fences retain source identity without changing symbol indexes', () => {
    const xml='<math><mfenced id="outer"><mi>x</mi><mfenced id="inner"><mi>y</mi><mi>z</mi></mfenced></mfenced></math>';
    const doc=parseFormula(xml);
    assert.deepEqual(formulaFences(doc).map(el=>el.getAttribute('id')),['outer','inner']);
    const preview=new DOMParser().parseFromString(renderFormulaPreview(xml),'text/xml');
    const rows=Array.from(preview.querySelectorAll('mrow[data-fence-index]'));
    assert.deepEqual(rows.map(el=>el.getAttribute('data-fence-index')),['0','1']);
    assert.equal(rows[0].firstElementChild.getAttribute('data-fence-index'),'0');
    assert.equal(rows[1].firstElementChild.getAttribute('data-fence-index'),'1');
    assert.deepEqual(Array.from(preview.querySelectorAll('[data-token-index]')).map(el=>[el.textContent,el.getAttribute('data-token-index')]),[['x','0'],['y','1'],['z','2']]);
});
test('editing a nested fence preserves other fences, source tags and children', () => {
    const xml='<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mfenced id="outer"><m:mi>x</m:mi><m:mfenced id="inner" mathcolor="red"><m:mi>y</m:mi><m:mi>z</m:mi></m:mfenced></m:mfenced></m:math>';
    const updated=updateFormulaFence(xml,1,{id:'inner',open:'[',close:']',separators:';',mathcolor:'blue'});
    const fences=formulaFences(parseFormula(updated));
    assert.equal(fences.length,2);
    assert.equal(fences[0].getAttribute('id'),'outer');
    assert.equal(fences[0].hasAttribute('open'),false);
    assert.equal(fences[1].prefix,'m');
    assert.equal(fences[1].getAttribute('mathcolor'),'blue');
    assert.equal(fences[1].textContent,'yz');
    assert.deepEqual(formulaTokens(parseFormula(updated)).map(el=>el.textContent),['x','y','z']);
    assert.ok(renderFormulaPreview(updated).includes(';'));
});
test('fence attributes support explicit empty delimiters and removing formatting', () => {
    const xml='<math><mfenced id="f" mathsize="2em"><mi>x</mi><mi>y</mi></mfenced></math>';
    const output=updateFormulaFence(xml,0,{id:'f',open:'',close:'',separators:''});
    const fence=formulaFences(parseFormula(output))[0];
    assert.equal(fence.getAttribute('open'),'');
    assert.equal(fence.hasAttribute('mathsize'),false);
    const preview=new DOMParser().parseFromString(renderFormulaPreview(output),'text/xml');
    assert.equal(preview.querySelectorAll('mo').length,0);
    assert.equal(preview.querySelector('mrow').getAttribute('data-fence-index'),'0');
});
test('fence attribute edits safely serialize special characters and namespaced attributes', () => {
    const xml='<mml:math><mml:mfenced xmlns:custom="urn:custom" custom:note="old"><mml:mi>x</mml:mi></mml:mfenced></mml:math>';
    const output=updateFormulaFence(xml,0,{open:'<&"',close:'>',separators:',','xml:lang':'en','custom:note':'a&b'});
    const fence=formulaFences(parseFormula(output))[0];
    assert.equal(fence.getAttribute('open'),'<&"');
    assert.equal(fence.getAttributeNS('urn:custom','note'),'a&b');
    assert.equal(fence.getAttributeNS('http://www.w3.org/XML/1998/namespace','lang'),'en');
    assert.ok(exportFormulaXml(output));
    for (const attributes of [{'bad name':'x'},{'xmlns:test':'urn:bad'},{'missing:name':'x'}]) assert.throws(()=>updateFormulaFence(xml,0,attributes));
    assert.throws(()=>updateFormulaFence(xml,8,{open:'['}),/Select the fence/);
});
test('hidden annotation fences do not shift the rendered fence editor target', () => {
    const xml='<math><semantics><mi>x</mi><annotation-xml><mfenced id="hidden"><mi>h</mi></mfenced></annotation-xml></semantics><mfenced id="visible"><mi>y</mi></mfenced></math>';
    assert.deepEqual(formulaFences(parseFormula(xml)).map(el=>el.getAttribute('id')),['visible']);
    const edited=updateFormulaFence(xml,0,{id:'visible',open:'[',close:']'});
    const all=Array.from(parseFormula(edited).querySelectorAll('*')).filter(el=>el.localName==='mfenced');
    assert.equal(all[0].getAttribute('id'),'hidden');
    assert.equal(all[0].hasAttribute('open'),false);
    assert.equal(all[1].getAttribute('open'),'[');
});
console.log(`${passed} Formula Studio regression checks passed.`);
dom.window.close();
