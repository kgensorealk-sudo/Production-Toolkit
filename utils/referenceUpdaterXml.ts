// Preserve raw markup while checking structure. Named character/text entities
// are normalized separately so emitted bibliography fragments need no declarations.
import articleEntities from './referenceUpdaterEntities.json';
export interface ReferenceXmlNode {
    name: string; start: number; openEnd: number; closeStart: number; end: number; attributes: Record<string, string>;
    attributeRanges: Record<string, {start: number; end: number; valueStart: number; valueEnd: number; quote: string}>;
}
export function scanReferenceXml(xml: string, options: {allowDuplicateIds?: boolean} = {}) {
    const nodes: ReferenceXmlNode[] = [], stack: ReferenceXmlNode[] = [];
    const ids = new Set<string>();
    const ignored: Array<{start: number; end: number; cdata?: boolean}> = [];
    const predefined: Record<string, string> = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    const declarations = new Map<string, string | null>();
    const edits: Array<{start: number; end: number; value: string}> = [];
    let expandedCharacters = 0;
    function fail(message: string, index: number): never { throw new Error(`Invalid XML near character ${index + 1}: ${message}`); }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(xml)) fail('Invalid XML character.', 0);
    const resolveEntity = (name: string, index: number, chain: string[] = []): string => {
        if (Object.hasOwn(predefined, name)) return predefined[name];
        if (chain.includes(name) || chain.length >= 16) fail(`Recursive or excessive entity expansion: ${name}.`, index);
        const raw = declarations.has(name) ? declarations.get(name) : Object.hasOwn(articleEntities, name) ? (articleEntities as Record<string,string>)[name] : undefined;
        if (raw === undefined) fail(`Undeclared entity &${name};. Supply its declaration or replace it with its intended text.`, index);
        if (raw === null) fail(`External entity &${name}; cannot be resolved. Supply its text instead.`, index);
        if (raw.includes('<') || /%[\w.:-]+;/.test(raw)) fail(`Entity &${name}; contains markup or a parameter entity. Supply expanded XML instead.`, index);
        entityText(raw, index, false);
        const expanded = raw.replace(/&(#x[\da-fA-F]+|#\d+|[A-Za-z_:][\w.:-]*);/g, (_all, token: string) =>
            token.startsWith('#') ? String.fromCodePoint(token.startsWith('#x') ? parseInt(token.slice(2),16) : Number(token.slice(1))) : resolveEntity(token,index,[...chain,name]));
        expandedCharacters += expanded.length;
        if (expandedCharacters > 1000000) fail('Excessive entity expansion.', index);
        return expanded;
    };
    const entityText = (value: string, index: number, normalize = true) => {
        if (/&(?!#\d+;|#x[\da-fA-F]+;|[A-Za-z_:][\w.:-]*;)/.test(value)) fail('Unescaped or malformed entity.', index);
        for (const match of value.matchAll(/&#(x[\da-fA-F]+|\d+);/g)) {
            const code = match[1].startsWith('x') ? parseInt(match[1].slice(1), 16) : Number(match[1]);
            if (!(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xD7FF) ||
                (code >= 0xE000 && code <= 0xFFFD) || (code >= 0x10000 && code <= 0x10FFFF))) fail('Invalid XML character reference.', index);
        }
        if (normalize) for (const match of value.matchAll(/&([A-Za-z_:][\w.:-]*);/g)) {
            if (Object.hasOwn(predefined, match[1])) continue;
            const expanded = resolveEntity(match[1], index + match.index!);
            // Keep expanded text safe in both attribute quote styles and element text.
            const safe = expanded.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
            edits.push({start:index + match.index!,end:index + match.index! + match[0].length,value:safe});
        }
    };
    const attributeValue = (value: string) => value.replace(/[\t\r\n]/g, ' ').replace(/&(#x[\da-fA-F]+|#\d+|[A-Za-z_:][\w.:-]*);/g, (_all, entity: string) => {
        return entity.startsWith('#') ? String.fromCodePoint(entity.startsWith('#x') ? parseInt(entity.slice(2),16) : Number(entity.slice(1))) : resolveEntity(entity,0);
    });
    let position = 0, hasDoctype = false;
    while (position < xml.length) {
        const start = xml.indexOf('<', position);
        const textEnd = start < 0 ? xml.length : start;
        if (!stack.length && xml.slice(position, textEnd).trim()) fail('Text outside XML elements.', position);
        entityText(xml.slice(position, textEnd), position);
        if (xml.slice(position, textEnd).includes(']]>')) fail('CDATA terminator outside CDATA.', position);
        if (start < 0) break;
        if (xml.startsWith('<!--', start)) {
            const close = xml.indexOf('-->', start + 4);
            if (close < 0 || xml.slice(start + 4, close).includes('--')) fail('Invalid comment.', start);
            ignored.push({start, end: close + 3}); position = close + 3; continue;
        }
        if (xml.startsWith('<![CDATA[', start)) {
            if (!stack.length) fail('CDATA outside an element.', start);
            const close = xml.indexOf(']]>', start + 9);
            if (close < 0) fail('Unterminated CDATA.', start);
            ignored.push({start, end: close + 3, cdata: true}); position = close + 3; continue;
        }
        if (xml.startsWith('<?', start)) {
            const close = xml.indexOf('?>', start + 2);
            if (close < 0) fail('Unterminated processing instruction.', start);
            ignored.push({start, end: close + 2}); position = close + 2; continue;
        }
        let quote = '', depth = 0, end = start + 1;
        const doctype = xml.startsWith('<!DOCTYPE', start);
        for (; end < xml.length; end++) {
            const char = xml[end];
            if (quote) { if (char === quote) quote = ''; continue; }
            if (doctype && xml.startsWith('<!--', end)) {
                const commentEnd = xml.indexOf('-->', end + 4);
                if (commentEnd < 0) fail('Unterminated DOCTYPE comment.', end);
                end = commentEnd + 2; continue;
            }
            if (char === '"' || char === "'") { quote = char; continue; }
            if (doctype && char === '[') depth++;
            if (doctype && char === ']') depth--;
            if (char === '>' && depth === 0) break;
            if (char === '<' && !doctype) fail('Unexpected opening bracket inside a tag.', end);
        }
        if (end === xml.length) fail('Unterminated tag or declaration.', start);
        position = end + 1;
        if (doctype) {
            if (hasDoctype || stack.length || nodes.length || !/^<!DOCTYPE\s+[A-Za-z_:][\w.:-]*(?:\s|\[|>)/.test(xml.slice(start, position)))
                fail('Misplaced or invalid DOCTYPE.', start);
            const declaration = xml.slice(start,position);
            for (const entry of declaration.matchAll(/<!--[\s\S]*?-->|<!ENTITY\s+([A-Za-z_:][\w.:-]*)\s+(?:(["'])([\s\S]*?)\2\s*|(?:SYSTEM|PUBLIC)\s+(?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
                if (entry[1] && !declarations.has(entry[1])) declarations.set(entry[1],entry[2] ? entry[3] : null);
            }
            hasDoctype = true; ignored.push({start, end: position}); continue;
        }
        const token = xml.slice(start, position);
        const closing = token.match(/^<\/([A-Za-z_:][\w.:-]*)\s*>$/);
        if (closing) {
            const node = stack.pop();
            if (!node || node.name !== closing[1]) fail(`Unexpected closing tag ${closing[1]}.`, start);
            node.closeStart = start; node.end = position; continue;
        }
        const opening = token.match(/^<([A-Za-z_:][\w.:-]*)([\s\S]*?)(\/?)>$/);
        if (!opening) fail('Invalid XML tag.', start);
        let rest = opening[2];
        const attributes: Record<string, string> = Object.create(null);
        const attributeRanges: ReferenceXmlNode['attributeRanges'] = Object.create(null);
        while (rest.trim()) {
            const attr = rest.match(/^\s+([A-Za-z_:][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/);
            if (!attr || attr[3].includes('<')) fail('Invalid attribute.', start);
            if (Object.prototype.hasOwnProperty.call(attributes, attr[1])) fail(`Duplicate attribute ${attr[1]}.`, start);
            const offset = start + 1 + opening[1].length + opening[2].length - rest.length;
            const valueStart = offset + attr[0].indexOf(attr[2]) + 1;
            attributeRanges[attr[1]] = {start: offset + attr[0].match(/^\s*/)![0].length, end: offset + attr[0].length,
                valueStart, valueEnd: valueStart + attr[3].length, quote: attr[2]};
            entityText(attr[3], valueStart); attributes[attr[1]] = attributeValue(attr[3]); rest = rest.slice(attr[0].length);
        }
        const node: ReferenceXmlNode = {name: opening[1], start, openEnd: position, closeStart: position, end: position, attributes, attributeRanges};
        if (attributes.id) { if (ids.has(attributes.id) && !options.allowDuplicateIds) fail(`Duplicate ID ${attributes.id}.`, start); ids.add(attributes.id); }
        nodes.push(node);
        if (!opening[3]) stack.push(node);
    }
    if (stack.length) fail(`Unclosed tag ${stack[stack.length - 1].name}.`, xml.length);
    // Mask non-markup sections while keeping positions stable for raw slicing.
    let metadataXml = xml;
    for (const range of ignored.reverse()) {
        const text = range.cdata ? ' '.repeat(9) + xml.slice(range.start + 9, range.end - 3).replace(/[<>]/g, ' ') + ' '.repeat(3)
            : ' '.repeat(range.end - range.start);
        metadataXml = metadataXml.slice(0, range.start) + text + metadataXml.slice(range.end);
    }
    let normalizedXml = xml;
    for (const edit of edits.sort((a,b)=>b.start-a.start)) normalizedXml = normalizedXml.slice(0,edit.start) + edit.value + normalizedXml.slice(edit.end);
    const bibliographies = nodes.filter(node => node.name === 'ce:bibliography');
    const scopedDocument = bibliographies.length > 0 || nodes.some(node => node.name === 'article');
    const references = nodes.filter(node => node.name === 'ce:bib-reference' && (!scopedDocument ||
        bibliographies.some(bibliography => node.start >= bibliography.openEnd && node.end <= bibliography.closeStart)));
    const textValue=(value:string)=>{const previous=expandedCharacters;expandedCharacters=0;try{return attributeValue(value);}finally{expandedCharacters=previous;}};
    const textContent=(node:ReferenceXmlNode)=>xml.slice(node.openEnd,node.closeStart).replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>|([^<]+)/g,(_all,cdata:string|undefined,plain:string|undefined)=>cdata!==undefined?cdata:plain!==undefined?textValue(plain):'');
    return {nodes, ids, metadataXml, normalizedXml, references, textValue, textContent};
}
