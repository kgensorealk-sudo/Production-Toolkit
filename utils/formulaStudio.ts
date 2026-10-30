import dtdProfiles from './formulaDtdProfiles.json';

const MATH_NS = 'http://www.w3.org/1998/Math/MathML';
const CE_NS = 'http://www.elsevier.com/xml/common/dtd';
const tokenNames = new Set(['mi', 'mn', 'mo', 'mtext', 'mspace']);
const namedEntities:Record<string,string> = {...dtdProfiles.profiles['5.6'].entities,...dtdProfiles.profiles['5.7'].entities};
const entityPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|&([A-Za-z_][A-Za-z0-9_.:-]*);/g;
const predefined = new Set(['amp','lt','gt','quot','apos']);

export function formulaEntityReferences(xml:string):string[] {
    return Array.from(xml.matchAll(entityPattern)).flatMap(match=>match[1] && !predefined.has(match[1]) ? [match[1]] : []);
}

export function parseFormula(xml: string): Document {
    const source = xml.trim().replace(/^<\?xml[^?]*\?>\s*/, '').replace(entityPattern,(match,name:string|undefined)=> {
        if(!name || predefined.has(name) || !Object.hasOwn(namedEntities,name))return match;
        // Numeric references cannot introduce markup or recursive entity expansion.
        return Array.from(namedEntities[name]).map(char=>'&#'+char.codePointAt(0)+';').join('');
    });
    const doc = new DOMParser().parseFromString(`<root xmlns:ce="${CE_NS}" xmlns:mml="${MATH_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${source}</root>`, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid formula XML. Correct the syntax before editing.');
    return doc;
}

export function serializeFormula(doc: Document, standalone = false): string {
    const serializer = new XMLSerializer();
    if (standalone) return Array.from(doc.documentElement.childNodes).map(node => serializer.serializeToString(node)).join('');
    // Serialize with the temporary namespace context, then discard only the wrapper.
    const root = doc.documentElement.cloneNode(true) as Element;
    if (!root.hasChildNodes()) return '';
    const declarations: [string, string][] = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
            if (attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/' || attr.name === 'xmlns') continue;
            if (root.lookupNamespaceURI(attr.localName) !== attr.value) continue;
            let marker = 'formula-preserved-namespace-' + declarations.length;
            while (serializer.serializeToString(root).includes(marker)) marker += '-x';
            declarations.push([marker, attr.name]);
            el.removeAttributeNode(attr);
            el.setAttribute(marker, attr.value);
        }
    }
    let wrapped = serializer.serializeToString(root);
    for (const [marker, name] of declarations) wrapped = wrapped.replaceAll(' ' + marker + '=', ' ' + name + '=');
    return wrapped.slice(wrapped.indexOf('>') + 1, wrapped.lastIndexOf('</'));
}

export function insertFormulaSnippet(xml: string, snippet: string): string {
    const doc = parseFormula(xml);
    const math = Array.from(doc.querySelectorAll('*')).find(el => el.localName === 'math' && (!el.namespaceURI || el.namespaceURI === MATH_NS));
    if (!math) throw new Error('Add a MathML <math> element before inserting a symbol.');
    const fragment = parseFormula(snippet);
    for (const child of Array.from(fragment.documentElement.childNodes)) math.appendChild(doc.importNode(child, true));
    return serializeFormula(doc);
}

// These elements assign meaning by child position. Keep every existing operand in its slot.
const operandContainers = new Set(['mfrac', 'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'semantics']);
const isOperand = (el: Element) => !!el.parentElement && operandContainers.has(el.parentElement.localName) && (!el.parentElement.namespaceURI || el.parentElement.namespaceURI === MATH_NS);

export function removeFormulaToken(el: Element): void {
    if (isOperand(el)) throw new Error(`This symbol occupies a required position in <${el.parentElement!.localName}>. Edit or clear its value instead of deleting it.`);
    el.remove();
}

function insertAfterOperand(el: Element, next: Element, doc: Document): void {
    if (isOperand(el)) {
        const group = doc.createElementNS(MATH_NS, 'mml:mrow');
        el.replaceWith(group);
        group.append(el, next);
    } else el.after(next);
}

export function insertFormulaTokenAfter(el: Element, doc: Document): void {
    const next = doc.createElementNS(MATH_NS, 'mml:mi');
    next.textContent = 'x';
    insertAfterOperand(el, next, doc);
}

export function formulaSymbolTag(symbol: string): 'mi' | 'mo' {
    return /^\p{L}+$/u.test(symbol) ? 'mi' : 'mo';
}

export function insertFormulaSymbol(xml: string, symbol: string, selection?: {text: string; tagName: string; nodeIndex?: number}): string {
    const tag = formulaSymbolTag(symbol);
    if (!selection) {
        const escaped = symbol.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return insertFormulaSnippet(xml, `<mml:${tag}>${escaped}</mml:${tag}>`);
    }
    return editFormulaToken(xml, selection.text, selection.tagName, selection.nodeIndex, (el, doc) => {
        const next = doc.createElementNS(MATH_NS, `mml:${tag}`);
        next.textContent = symbol;
        if (el.localName !== 'mspace' && !el.textContent?.trim()) {
            for (const attr of Array.from(el.attributes)) next.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
            el.replaceWith(next);
        } else insertAfterOperand(el, next, doc);
    });
}

export function expandFormulaFences(xml: string): string {
    const doc = parseFormula(xml);
    const fences = Array.from(doc.querySelectorAll('*')).filter(el => el.localName === 'mfenced' && (!el.namespaceURI || el.namespaceURI === MATH_NS));
    if (!fences.length) return xml;
    for (const fence of fences.reverse()) {
        const name = (local: string) => fence.prefix ? `${fence.prefix}:${local}` : local;
        const row = doc.createElementNS(fence.namespaceURI, name('mrow'));
        for (const attr of Array.from(fence.attributes)) {
            if (!['open', 'close', 'separators'].includes(attr.name)) row.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
        }
        const addOperator = (value: string, attribute: string) => {
            if (!value) return;
            const operator = doc.createElementNS(fence.namespaceURI, name('mo'));
            operator.textContent = value;
            operator.setAttribute(attribute, 'true');
            row.appendChild(operator);
        };
        addOperator(fence.getAttribute('open') ?? '(', 'fence');
        const separators = Array.from((fence.getAttribute('separators') ?? ',').replace(/\s/g, ''));
        let index = 0;
        for (const child of Array.from(fence.childNodes)) {
            if (child.nodeType === 1) {
                if (index > 0 && separators.length) addOperator(separators[Math.min(index - 1, separators.length - 1)], 'separator');
                index++;
            }
            row.appendChild(child);
        }
        addOperator(fence.getAttribute('close') ?? ')', 'fence');
        fence.replaceWith(row);
    }
    return serializeFormula(doc);
}

function formulaPresentationElements(container: Document | Element): Element[] {
    const source = container.nodeType === 1 && (container as Element).localName === 'math'
        ? container as Element
        : Array.from(container.querySelectorAll('*')).find(el => el.localName === 'math');
    const elements: Element[] = [];
    const visit = (el: Element) => {
        if (!presentationTags.has(el.localName) || (el.namespaceURI && el.namespaceURI !== MATH_NS)) return;
        elements.push(el);
        for (const child of Array.from(el.children)) visit(child);
    };
    if (source) visit(source);
    return elements;
}

export function formulaTokens(container: Document | Element): Element[] {
    return formulaPresentationElements(container).filter(el => tokenNames.has(el.localName));
}

export function formulaFences(container: Document | Element): Element[] {
    return formulaPresentationElements(container).filter(el => el.localName === 'mfenced');
}

export function updateFormulaFence(xml: string, index: number, attributes: Record<string, string>): string {
    const doc = parseFormula(xml);
    const fence = formulaFences(doc)[index];
    if (!fence) throw new Error('Select the fence again before editing its attributes.');
    for (const attr of Array.from(fence.attributes)) {
        if (attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/') fence.removeAttributeNode(attr);
    }
    for (const [name, value] of Object.entries(attributes)) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) throw new Error('Namespace declarations are managed automatically.');
        const parts = name.split(':');
        if (parts.length > 2 || parts.some(part => !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(part))) throw new Error(`Invalid attribute name: ${name}`);
        if (parts.length === 2) {
            const namespace = parts[0] === 'xml' ? 'http://www.w3.org/XML/1998/namespace' : fence.lookupNamespaceURI(parts[0]);
            if (!namespace) throw new Error(`The attribute prefix ${parts[0]} has no namespace declaration.`);
            fence.setAttributeNS(namespace, name, value);
        } else fence.setAttribute(name, value);
    }
    return serializeFormula(doc);
}

export function formulaMetadata(xml: string): {id: string; altimg: string; display: boolean} {
    const doc = parseFormula(xml);
    const elements = Array.from(doc.querySelectorAll('*'));
    const math = elements.find(el => el.localName === 'math');
    const formula = elements.find(el => el.localName === 'formula' && math && el.contains(math));
    return {
        id: formula?.getAttribute('id') || '',
        altimg: math?.getAttribute('altimg') || '',
        display: !!math && (math.getAttribute('display') === 'block' || elements.some(el => el.localName === 'display' && el.contains(math)))
    };
}

// Download a standalone XML document, including namespaces inherited from our parser wrapper.
export function exportFormulaXml(xml: string): string {
    const doc = parseFormula(xml);
    if (doc.documentElement.children.length !== 1 || Array.from(doc.documentElement.childNodes).some(node => node.nodeType === 3 && !!node.textContent?.trim())) {
        throw new Error('Download requires one formula root element.');
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeFormula(doc, true).trim();
}

export function formatFormulaXml(xml: string, pretty: boolean): string {
    const doc = parseFormula(xml);
    const visit = (el: Element, depth: number) => {
        // Preserve token contents, annotations, mixed content and explicit whitespace rules.
        if (tokenNames.has(el.localName) || el.getAttribute('xml:space') === 'preserve') return;
        if (el !== doc.documentElement && !presentationTags.has(el.localName) && !['display', 'formula'].includes(el.localName)) return;
        if (Array.from(el.childNodes).some(node => (node.nodeType === 3 && !!node.textContent?.trim()) || node.nodeType === 4)) return;
        for (const child of Array.from(el.children)) visit(child, depth + 1);
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3 && !child.textContent?.trim()) child.remove();
        }
        if (pretty && el.childNodes.length) {
            for (const child of Array.from(el.childNodes)) el.insertBefore(doc.createTextNode('\n' + '  '.repeat(Math.max(0, depth))), child);
            el.appendChild(doc.createTextNode('\n' + '  '.repeat(Math.max(0, depth - 1))));
        }
    };
    visit(doc.documentElement, 0);
    return serializeFormula(doc).trim();
}

export function editFormulaToken(xml: string, text: string, tag: string, index: number | undefined, edit: (el: Element, doc: Document) => void): string {
    const doc = parseFormula(xml);
    const tokens = formulaTokens(doc);
    const expectedText = text.trim();
    const target = index === undefined
        ? tokens.find(el => el.localName === tag && el.textContent?.trim() === expectedText)
        : tokens[index];
    if (!target || target.localName !== tag || target.textContent?.trim() !== expectedText) throw new Error('The selected symbol has changed. Select it again.');
    edit(target, doc);
    return serializeFormula(doc);
}

export function setFormulaTokenText(el: Element, value: string): void {
    if (el.localName === 'mspace') throw new Error('Use the Space width control to edit spacing.');
    el.textContent = value;
}

export function updateFormulaSpaceWidth(xml: string, index: number, width: string): string {
    const value = width.trim();
    const length = /^(?:0|-?(?:\d+(?:\.\d*)?|\.\d+)(?:em|ex|rem|ch|px|pt|pc|in|cm|mm|%))$/;
    const named = /^(?:negative)?(?:veryverythin|verythin|thin|medium|thick|verythick|veryverythick)mathspace$/;
    if (value && !length.test(value) && !named.test(value)) throw new Error('Enter a width such as 0.5em, 8px, or 0. Leave it blank to use the default.');
    const doc = parseFormula(xml);
    const el = formulaTokens(doc)[index];
    if (!el || el.localName !== 'mspace') throw new Error('Select the spacing element again.');
    if (value) el.setAttribute('width', value); else el.removeAttribute('width');
    // mspace is an empty element, even when repairing an imported invalid value.
    el.textContent = '';
    return serializeFormula(doc);
}

export function updateFormulaMetadata(xml: string, id: string, altimg: string, display: boolean): string {
    const doc = parseFormula(xml);
    const elements = Array.from(doc.querySelectorAll('*'));
    const math = elements.find(el => el.localName === 'math');
    if (!math) throw new Error('No MathML formula found.');
    let formula = elements.find(el => el.localName === 'formula' && el.contains(math));
    if (!formula && id) {
        formula = doc.createElementNS(CE_NS, 'ce:formula');
        math.replaceWith(formula);
        formula.appendChild(math);
    }
    if (formula) {
        if (id) formula.setAttribute('id', id); else formula.removeAttribute('id');
    }
    if (altimg) math.setAttribute('altimg', altimg); else math.removeAttribute('altimg');
    if (!display && math.getAttribute('display') === 'block') math.setAttribute('display', 'inline');
    const wrapper = elements.find(el => el.localName === 'display' && el.contains(math));
    if (!display && wrapper) wrapper.replaceWith(...Array.from(wrapper.childNodes));
    if (display && !wrapper) {
        const target = formula || math;
        const newWrapper = doc.createElementNS(CE_NS, 'ce:display');
        target.replaceWith(newWrapper);
        newWrapper.appendChild(target);
    }
    return serializeFormula(doc);
}

// Build a fresh MathML tree rather than feeding XML through the HTML parser.
// Only presentation elements/attributes cross into the live preview.
const presentationTags = new Set('math mi mn mo mtext mspace mrow mfrac msqrt mroot msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mlabeledtr mtd menclose mphantom mpadded mstyle mfenced semantics'.split(' '));
const presentationAttrs = new Set('mathvariant mathsize mathcolor mathbackground displaystyle scriptlevel accent accentunder align columnalign rowalign columnspacing rowspacing columnlines rowlines frame framespacing equalrows equalcolumns width height depth lspace rspace stretchy symmetric maxsize minsize largeop movablelimits fence separator form notation linethickness bevelled numalign denomalign subscriptshift superscriptshift open close separators'.split(' '));

export function renderFormulaPreview(xml: string, selectedIndex?: number): string | null {
    try {
        const doc = parseFormula(xml);
        const source = Array.from(doc.querySelectorAll('*')).find(el => el.localName === 'math');
        if (!source) return null;
        const output = document.implementation.createDocument(MATH_NS, 'math', null);
        const root = output.documentElement;
        const display = Array.from(doc.querySelectorAll('*')).some(el => el.localName === 'display' && el.contains(source));
        root.setAttribute('display', display || source.getAttribute('display') === 'block' ? 'block' : 'inline');
        const tokenIndexes = new Map(formulaTokens(doc).map((el, index) => [el, index]));
        const fenceIndexes = new Map(formulaFences(doc).map((el, index) => [el, index]));
        const copy = (el: Element): Element | null => {
            if (!presentationTags.has(el.localName) || (el.namespaceURI && el.namespaceURI !== MATH_NS)) return null;
            const result = output.createElementNS(MATH_NS, el.localName === 'mfenced' ? 'mrow' : el.localName);
            const fenceIndex = fenceIndexes.get(el);
            if (fenceIndex !== undefined) result.setAttribute('data-fence-index', String(fenceIndex));
            for (const attr of Array.from(el.attributes)) {
                if (presentationAttrs.has(attr.name)) result.setAttribute(attr.name, attr.value);
            }
            const index = tokenIndexes.get(el);
            if (index !== undefined) {
                result.setAttribute('data-token-index', String(index));
                if (index === selectedIndex) result.setAttribute('style', 'background-color: #fef08a; outline: 2px solid #eab308;');
            }
            const fence = (value: string) => {
                if (!value) return;
                const mo = output.createElementNS(MATH_NS, 'mo');
                mo.setAttribute('fence', 'true');
                if (fenceIndex !== undefined) mo.setAttribute('data-fence-index', String(fenceIndex));
                mo.textContent = value;
                result.appendChild(mo);
            };
            if (el.localName === 'mfenced') fence(el.getAttribute('open') ?? '(');
            const children = Array.from(el.childNodes);
            const separators = Array.from((el.getAttribute('separators') ?? ',').replace(/\s/g, ''));
            let childIndex = 0;
            for (const child of children) {
                if (child.nodeType === 1) {
                    if (el.localName === 'mfenced' && childIndex++ > 0 && separators.length) {
                        const separator = output.createElementNS(MATH_NS, 'mo');
                        separator.setAttribute('separator', 'true');
                        if (fenceIndex !== undefined) separator.setAttribute('data-fence-index', String(fenceIndex));
                        separator.textContent = separators[Math.min(childIndex - 2, separators.length - 1)];
                        result.appendChild(separator);
                    }
                    const copied = copy(child as Element);
                    if (copied) result.appendChild(copied);
                } else if (child.nodeType === 3 || child.nodeType === 4) {
                    result.appendChild(output.createTextNode(child.textContent || ''));
                }
            }
            if (el.localName === 'mfenced') fence(el.getAttribute('close') ?? ')');
            return result;
        };
        const copied = copy(source);
        if (!copied) return null;
        for (const attr of Array.from(copied.attributes)) root.setAttribute(attr.name, attr.value);
        while (copied.firstChild) root.appendChild(copied.firstChild);
        return new XMLSerializer().serializeToString(root);
    } catch { return null; }
}

export function texToMathML(input: string): string {
    const source = input.trim().replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1');
    let position = 0;
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const node = (tag: string, value: string) => `<mml:${tag}>${value}</mml:${tag}>`;
    const symbols: Record<string, string> = {alpha:'α',beta:'β',gamma:'γ',delta:'δ',theta:'θ',lambda:'λ',mu:'μ',pi:'π',sigma:'σ',omega:'ω',Delta:'Δ',infty:'∞'};
    const operators: Record<string, string> = {pm:'±',mp:'∓',times:'×',cdot:'·',div:'÷',approx:'≈',neq:'≠',le:'≤',leq:'≤',ge:'≥',geq:'≥',int:'∫',sum:'∑',prod:'∏',to:'→'};
    const spaces = () => { while (/\s/.test(source[position] || '') && position < source.length) position++; };
    const group = (): string => {
        spaces();
        if (position >= source.length) throw new Error('Missing TeX argument.');
        if (source[position] === '{') {
            position++;
            const value = sequence(true);
            return node('mrow', value);
        }
        return atom();
    };
    const atom = (): string => {
        spaces();
        const codePoint = source.codePointAt(position);
        const char = codePoint === undefined ? '' : String.fromCodePoint(codePoint);
        position += char.length;
        if (!char || char === '}') throw new Error('Missing TeX argument.');
        if (char === '{') return node('mrow', sequence(true));
        if (char === '\\') {
            const match = source.slice(position).match(/^[a-zA-Z]+/);
            if (!match) {
                const escaped = source[position++];
                if (escaped === ',' || escaped === ';' || escaped === ' ') return '<mml:mspace width="0.2em"/>';
                if (escaped && '{}_%&#$'.includes(escaped)) return node('mo', escape(escaped));
                throw new Error('Unsupported TeX command.');
            }
            const command = match[0]; position += command.length;
            if (command === 'frac') return node('mfrac', group() + group());
            if (command === 'sqrt') {
                spaces();
                if (source[position] === '[') throw new Error('Indexed roots are not supported by quick import.');
                return node('msqrt', group());
            }
            if (command === 'mathit' || command === 'mathrm' || command === 'mathbf') {
                const value = group();
                return `<mml:mstyle mathvariant="${{mathit:'italic',mathrm:'normal',mathbf:'bold'}[command]}">${value}</mml:mstyle>`;
            }
            if (command === 'text') {
                spaces();
                if (source[position++] !== '{') throw new Error('Text requires braces.');
                const end = source.indexOf('}', position);
                if (end < 0 || source.slice(position, end).includes('{')) throw new Error('Invalid text group.');
                const value = source.slice(position, end); position = end + 1;
                return node('mtext', escape(value));
            }
            if (['ln','log','sin','cos','tan','lim','exp'].includes(command)) return `<mml:mi mathvariant="normal">${command}</mml:mi>`;
            if (symbols[command]) return node('mi', symbols[command]);
            if (operators[command]) return node('mo', operators[command]);
            if (command === 'left' || command === 'right') return atom();
            throw new Error(`Unsupported TeX command: \\${command}. The formula was not replaced.`);
        }
        if (char === '^' || char === '_') throw new Error('A script needs a base.');
        return node(/[0-9.]/.test(char) ? 'mn' : /[\p{L}]/u.test(char) ? 'mi' : 'mo', escape(char));
    };
    const sequence = (inGroup = false): string => {
        let result = '';
        while (true) {
            spaces();
            if (position >= source.length) {
                if (inGroup) throw new Error('Unclosed TeX group.');
                break;
            }
            if (source[position] === '}') {
                if (!inGroup) throw new Error('Unexpected closing brace.');
                position++; break;
            }
            let base = atom();
            let sub: string | undefined, sup: string | undefined;
            spaces();
            while (source[position] === '_' || source[position] === '^') {
                const marker = source[position++];
                if ((marker === '_' && sub !== undefined) || (marker === '^' && sup !== undefined)) throw new Error('Duplicate TeX script.');
                const value = group();
                if (marker === '_') sub = value; else sup = value;
                spaces();
            }
            if (sub !== undefined && sup !== undefined) base = node('msubsup', base + sub + sup);
            else if (sub !== undefined) base = node('msub', base + sub);
            else if (sup !== undefined) base = node('msup', base + sup);
            result += base;
        }
        return result;
    };
    if (!source) throw new Error('Enter a TeX expression.');
    return `<ce:display><ce:formula><mml:math>${sequence()}</mml:math></ce:formula></ce:display>`;
}
