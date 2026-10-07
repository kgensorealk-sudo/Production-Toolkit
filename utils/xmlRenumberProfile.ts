export interface RenumberProfile {
    schemaVersion: 1;
    name: string;
    source: string;
    systemId?: string;
    elements: { reference: string; label: string; singleCitation: string; groupedCitation: string; otherReference?: string };
    attributes: { id: string; targets: string };
    rules: { labelRequired: boolean; labelFirst: boolean };
}

export const ELSEVIER_PROFILE: RenumberProfile = {
    schemaVersion: 1, name: 'Elsevier article 5.7.0',
    source: 'art570.dtd / common170.ent', systemId: 'art570.dtd',
    elements: { reference: 'ce:bib-reference', label: 'ce:label', singleCitation: 'ce:cross-ref', groupedCitation: 'ce:cross-refs', otherReference: 'ce:other-ref' },
    attributes: { id: 'id', targets: 'refid' },
    rules: { labelRequired: true, labelFirst: true }
};

export function parseRenumberProfile(text: string): RenumberProfile {
    const p = JSON.parse(text);
    const name = /^[A-Za-z_][\w.:-]*$/;
    if (!p || p.schemaVersion !== 1 || typeof p.name !== 'string' || !p.name.trim() || typeof p.source !== 'string' ||
        !p.elements || !p.attributes || !p.rules ||
        (p.systemId !== undefined && (typeof p.systemId !== 'string' || !p.systemId.trim()))) throw new Error('Invalid profile metadata. Expected schemaVersion 1, name, source, elements, attributes, and rules.');
    const names = ['reference', 'label', 'singleCitation', 'groupedCitation'].map(k => p.elements[k]);
    if (names.some(v => typeof v !== 'string' || !name.test(v)) || new Set(names).size !== names.length ||
        (p.elements.otherReference !== undefined && (typeof p.elements.otherReference !== 'string' || !name.test(p.elements.otherReference))) ||
        ['id', 'targets'].some(k => typeof p.attributes[k] !== 'string' || !name.test(p.attributes[k])) ||
        typeof p.rules.labelRequired !== 'boolean' || typeof p.rules.labelFirst !== 'boolean') throw new Error('Invalid element mappings or rules. Use XML names and boolean labelRequired/labelFirst rules.');
    return p;
}

export function accountRenumberProfile(isAdmin: boolean, userId: string | undefined, profiles: Record<string, RenumberProfile>): RenumberProfile {
    if (!isAdmin || !userId || !profiles || !Object.hasOwn(profiles, userId)) return ELSEVIER_PROFILE;
    try { return parseRenumberProfile(JSON.stringify(profiles[userId])); }
    catch { return ELSEVIER_PROFILE; }
}

interface XmlNode { name: string; start: number; openEnd: number; closeStart: number; end: number; children: XmlNode[]; attributes: Record<string, string>; parent?: XmlNode; }
function decodeAttribute(s: string) {
    return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, entity => {
        const known: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
        if (known[entity] !== undefined) return known[entity];
        const value = entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
        if (value < 1 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) throw new Error('Invalid character reference in attribute.');
        return String.fromCodePoint(value);
    });
}

// Track element boundaries without serializing the document or resolving external entities.
function scanXml(xml: string): XmlNode[] {
    const all: XmlNode[] = [], stack: XmlNode[] = [];
    let doctype = '';
    let i = 0;
    while ((i = xml.indexOf('<', i)) >= 0) {
        const start = i;
        const terminator = xml.startsWith('<!--', i) ? '-->' : xml.startsWith('<![CDATA[', i) ? ']]>' : xml.startsWith('<?', i) ? '?>' : null;
        if (terminator) {
            const end = xml.indexOf(terminator, i + 2);
            if (end < 0) throw new Error('Unterminated XML comment, CDATA, or instruction.');
            i = end + terminator.length; continue;
        }
        let quote = '', brackets = 0;
        for (i++; i < xml.length; i++) {
            const c = xml[i];
            if (quote) { if (c === quote) quote = ''; continue; }
            if (brackets > 0 && xml.startsWith('<!--', i)) {
                const commentEnd = xml.indexOf('-->', i + 4);
                if (commentEnd < 0) throw new Error('Unterminated comment in DOCTYPE.');
                i = commentEnd + 2; continue;
            }
            if (c === '"' || c === "'") quote = c;
            else if (c === '[') brackets++;
            else if (c === ']') brackets--;
            else if (c === '>' && brackets === 0) break;
        }
        if (i === xml.length) throw new Error('Unterminated XML tag.');
        const tag = xml.slice(start, ++i);
        if (tag.startsWith('<!DOCTYPE')) { doctype = tag; continue; }
        if (tag.startsWith('<!')) throw new Error('Unsupported XML declaration.');
        const match = /^<(\/)?([A-Za-z_][\w.:-]*)(?=[\s/>])/.exec(tag);
        if (!match) throw new Error('Invalid XML tag.');
        if (match[1]) {
            if (!/^<\/[A-Za-z_][\w.:-]*\s*>$/.test(tag)) throw new Error('Invalid closing tag.');
            const node = stack.pop();
            if (!node || node.name !== match[2]) throw new Error('Mismatched XML closing tag.');
            node.closeStart = start; node.end = i; continue;
        }
        const attributes: Record<string, string> = Object.create(null);
        let tail = tag.slice(match[0].length).replace(/\/?\s*>$/, '');
        while (tail.trim()) {
            const a = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/.exec(tail);
            if (!a || a[3].includes('<') || Object.hasOwn(attributes, a[1])) throw new Error('Invalid or duplicate XML attribute.');
            attributes[a[1]] = decodeAttribute(a[3]);
            tail = tail.slice(a[0].length);
        }
        const node: XmlNode = { name: match[2], start, openEnd: i, closeStart: i, end: i, children: [], attributes, parent: stack.at(-1) };
        stack.at(-1)?.children.push(node); all.push(node);
        if (!/\/\s*>$/.test(tag)) stack.push(node);
    }
    if (stack.length) throw new Error('Unclosed XML element.');
    return Object.assign(all, { doctype });
}

export interface RenumberChange { id: string; oldLabel: string; newLabel: string; changed: boolean; isOtherRef: boolean; missingLabel?: boolean; issue?: string; }
export interface RenumberIssue { target: string; message: string; }
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renumberWithProfile(xml: string, profile: RenumberProfile, prefix: string, suffix: string, retainCitationFormatting = true, retainLabelFormatting = true, fixDuplicateCitationIds = false): { output: string; changes: RenumberChange[]; issues: RenumberIssue[]; processed: number; missingLabelCount: number; uncitedIds: string[] } {
    profile = parseRenumberProfile(JSON.stringify(profile));
    const nodes = scanXml(xml);
    const doctype = /<!DOCTYPE\s+[^\s>]+\s+(?:PUBLIC\s+["'][^"']*["']\s+|SYSTEM\s+)["']([^"']+)["']/.exec((nodes as XmlNode[] & { doctype: string }).doctype);
    if (doctype && profile.systemId && doctype[1].split(/[\\/]/).pop() !== profile.systemId) throw new Error(`Document declares ${doctype[1]}; choose a matching profile instead of ${profile.name}.`);
    const refs = nodes.filter(n => n.name === profile.elements.reference);
    const changes: RenumberChange[] = [], issues: RenumberIssue[] = [];
    const edits: { start: number; end: number; text: string }[] = [];
    const numbers = new Map<string, number>(), idCounts = new Map<string, number>();
    for (const node of nodes) {
        const id = node.attributes[profile.attributes.id];
        if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    const allIds = new Set(idCounts.keys());
    const referenceIds = new Set(refs.map(ref => ref.attributes[profile.attributes.id]).filter(Boolean));
    const bibliographyCitations = nodes.filter(node =>
        (node.name === profile.elements.singleCitation || node.name === profile.elements.groupedCitation) &&
        (node.attributes[profile.attributes.targets] || '').trim().split(/\s+/).some(target => referenceIds.has(target)));
    if (fixDuplicateCitationIds) {
        const repairs: { start: number; end: number; text: string }[] = [];
        const repairIssues: RenumberIssue[] = [];
        const handled = new Set<string>();
        for (const citation of bibliographyCitations) {
            const id = citation.attributes[profile.attributes.id];
            if (!id || (idCounts.get(id) || 0) < 2 || handled.has(id)) continue;
            handled.add(id);
            if (nodes.some(node => Object.entries(node.attributes).some(([name, value]) =>
                name !== profile.attributes.id && (value.split(/\s+/).includes(id) || value.endsWith('#' + id))))) {
                throw new Error(`Duplicate citation ID ${id} is referenced by another element; automatic repair cannot determine the intended target. Correct these links manually.`);
            }
            const owners = nodes.filter(node => node.attributes[profile.attributes.id] === id);
            const candidates = owners.filter(node => bibliographyCitations.includes(node));
            const hasOtherOwner = owners.length > candidates.length;
            for (const node of hasOtherOwner ? candidates : candidates.slice(1)) {
                const numericMatch = /^(.*?)(\d+)$/.exec(id);
                const numeric = numericMatch && Number.isSafeInteger(Number(numericMatch[2]) + 1) ? numericMatch : null;
                let index = numeric ? Number(numeric[2]) + 1 : 2;
                let replacement: string;
                do {
                    replacement = numeric && Number.isSafeInteger(index)
                        ? numeric[1] + String(index++).padStart(numeric[2].length, '0')
                        : `${id}_${index++}`;
                } while (allIds.has(replacement));
                allIds.add(replacement);
                const opening = xml.slice(node.start, node.openEnd);
                const attribute = [...opening.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g)]
                    .find(match => match[1] === profile.attributes.id)!;
                const valueStart = node.start + attribute.index! + attribute[0].indexOf(attribute[2]) + 1;
                repairs.push({ start: valueStart, end: valueStart + attribute[3].length, text: replacement });
                repairIssues.push({ target: replacement, message: `Duplicate citation ID repaired: ${id} → ${replacement}.` });
            }
        }
        if (repairs.length) {
            let repairedXml = xml;
            for (const repair of repairs.sort((a, b) => b.start - a.start)) {
                repairedXml = repairedXml.slice(0, repair.start) + repair.text + repairedXml.slice(repair.end);
            }
            const result = renumberWithProfile(repairedXml, profile, prefix, suffix, retainCitationFormatting, retainLabelFormatting);
            result.issues.unshift(...repairIssues);
            return result;
        }
    }
    // Check only bibliography citations, but compare their IDs with every
    // element's ID: a collision with any other element is still ambiguous.
    for (const node of nodes) {
        if (node.name !== profile.elements.singleCitation && node.name !== profile.elements.groupedCitation) continue;
        const targets = (node.attributes[profile.attributes.targets] || '').trim().split(/\s+/);
        if (!targets.some(target => referenceIds.has(target))) continue;
        const id = node.attributes[profile.attributes.id];
        if (id && (idCounts.get(id) || 0) > 1) {
            throw new Error(`Duplicate citation ID ${id}; numbering stopped. Each citation ID must be unique within the document.`);
        }
    }
    const seen = new Set<string>();
    const originalAffixes = new Map<string, [string, string]>();
    let count = 0;
    for (const ref of refs) {
        for (let ancestor = ref.parent; ancestor; ancestor = ancestor.parent) {
            if (ancestor.name === profile.elements.reference) throw new Error('Nested bibliography references are ambiguous; numbering stopped.');
        }
        const id = ref.attributes[profile.attributes.id];
        if (!id) {
            const message = 'Missing reference ID; left unchanged.';
            changes.push({ id: `(missing ID at reference ${changes.length + 1})`, oldLabel: 'Unknown', newLabel: 'Not assigned', changed: false, isOtherRef: false, issue: message });
            issues.push({ target: profile.elements.reference, message }); continue;
        }
        if (seen.has(id) || (idCounts.get(id) || 0) > 1) throw new Error(`Duplicate ID ${id}; numbering stopped to avoid ambiguous links.`);
        seen.add(id);
        const labels = ref.children.filter(n => n.name === profile.elements.label);
        const label = labels[0];
        const issue = !label ? `${profile.rules.labelRequired ? 'Profile violation: required' : 'No'} direct child label; reference skipped.` :
            labels.length > 1 ? 'Multiple direct child labels; reference skipped.' :
            profile.rules.labelFirst && ref.children[0] !== label ? 'Profile violation: label must be the first child; reference skipped.' : undefined;
        const oldLabel = label ? xml.slice(label.openEnd, label.closeStart) : 'Missing';
        const containsOtherRef = (n: XmlNode): boolean => n.children.some(c => c.name === profile.elements.otherReference || containsOtherRef(c));
        const isOtherRef = !!profile.elements.otherReference && containsOtherRef(ref);
        if (issue) {
            changes.push({ id, oldLabel, newLabel: 'Not assigned', changed: false, isOtherRef, missingLabel: !label, issue });
            issues.push({ target: id, message: issue }); continue;
        }
        let labelLeaf = label;
        let safeLabel = true;
        const labelFormatting = new Set(['ce:italic', 'ce:bold', 'ce:sup', 'ce:inf']);
        while (labelLeaf.children.length) {
            const child = labelLeaf.children[0];
            if (labelLeaf.children.length !== 1 || !labelFormatting.has(child.name) ||
                xml.slice(labelLeaf.openEnd, child.start).trim() || xml.slice(child.end, labelLeaf.closeStart).trim() ||
                /\/\s*>$/.test(xml.slice(child.start, child.openEnd))) { safeLabel = false; break; }
            labelLeaf = child;
        }
        if (!safeLabel || xml.slice(labelLeaf.openEnd, labelLeaf.closeStart).includes('<')) {
            const message = 'Complex label markup preserved; reference and its citations skipped.';
            changes.push({ id, oldLabel, newLabel: 'Not assigned', changed: false, isOtherRef, issue: message });
            issues.push({ target: id, message }); continue;
        }
        const newLabel = `${prefix}${++count}${suffix}`;
        const originalNumber = /^(.*?)(\d+)(\D*)$/.exec(decodeAttribute(xml.slice(labelLeaf.openEnd, labelLeaf.closeStart)).trim());
        if (originalNumber) originalAffixes.set(id, [originalNumber[1], originalNumber[3]]);
        numbers.set(id, count);
        const labelOpen = xml.slice(label.start, label.openEnd);
        let labelContent = escapeText(newLabel);
        if (label.children.length) {
            const leafText = xml.slice(labelLeaf.openEnd, labelLeaf.closeStart);
            const preserved = xml.slice(label.openEnd, labelLeaf.openEnd) + /^\s*/.exec(leafText)![0] + escapeText(newLabel) + /\s*$/.exec(leafText)![0] + xml.slice(labelLeaf.closeStart, label.closeStart);
            let linked = false;
            for (let wrapper = label.children[0]; wrapper; wrapper = wrapper.children[0]) {
                const wrapperId = wrapper.attributes[profile.attributes.id];
                if (wrapperId && nodes.some(other => Object.entries(other.attributes).some(([key, value]) => key !== profile.attributes.id && (value.split(/\s+/).includes(wrapperId) || value.endsWith('#' + wrapperId))))) linked = true;
            }
            if (retainLabelFormatting || linked) labelContent = preserved;
            if (!retainLabelFormatting && linked) issues.push({ target: id, message: 'Label formatting contains a linked ID; retained to protect links.' });
        }
        if (/\/\s*>$/.test(labelOpen)) edits.push({ start: label.start, end: label.end, text: labelOpen.replace(/\/\s*>$/, '>') + escapeText(newLabel) + `</${label.name}>` });
        else edits.push({ start: label.openEnd, end: label.closeStart, text: labelContent });
        changes.push({ id, oldLabel: oldLabel.trim(), newLabel, changed: oldLabel !== labelContent, isOtherRef });
    }
    const sharedBrackets = new Set<XmlNode>();
    {
        for (const parent of nodes.filter(node => node.children.some(child => bibliographyCitations.includes(child)))) {
            let masked = '', cursor = parent.openEnd;
            const positions: number[] = [];
            const appendText = (start: number, end: number) => {
                masked += xml.slice(start, end);
                for (let i = start; i < end; i++) positions.push(i);
            };
            const markers = new Map<number, XmlNode>();
            for (const child of parent.children) {
                appendText(cursor, child.start);
                positions.push(child.start);
                if (bibliographyCitations.includes(child)) {
                    markers.set(masked.length, child);
                    masked += '\uFFFC';
                } else masked += '\0';
                cursor = child.end;
            }
            appendText(cursor, parent.closeStart);
            for (const match of masked.matchAll(/([\[({])([^\[\](){}\0]*)([\])}])/g)) {
                if (match[3] !== ({ '[': ']', '(': ')', '{': '}' } as Record<string, string>)[match[1]]) continue;
                const content = match[2];
                if (!/^\s*\uFFFC(?:\s*[,;–—-]\s*\uFFFC)*(?:\s*,\s*pp?\.\s*\d+(?:\s*[–—-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–—-]\s*\d+)?)*)?\s*$/.test(content)) continue;
                const group = [...markers].filter(([position]) => position > match.index! && position < match.index! + match[0].length - 1).map(([, child]) => child);
                // Preserve groups with empty, unresolved, or complex citations for review.
                if (!group.every(child => (child.attributes[profile.attributes.targets] || '').trim().split(/\s+/).every(id => numbers.has(id)) &&
                    /^\s*[\[({]?\d+(?:\s*[,;–—-]\s*\d+)*(?:\s*,\s*pp?\.\s*\d+(?:\s*[–—-]\s*\d+)?)?[\])}]?\s*$/.test(decodeAttribute(xml.slice(child.openEnd, child.closeStart).replace(/<\/?ce:(?:italic|bold|sup|inf)\b[^>]*>/g, ''))))) continue;
                // Keep the established single square-bracket normalization.
                if (match[1] === '[' && prefix === '[' && suffix === ']' && group.length === 1 && !/pp?\./.test(content)) continue;
                const opening = positions[match.index!], closing = positions[match.index! + match[0].length - 1];
                edits.push({ start: opening, end: opening + 1, text: escapeText(prefix) }, { start: closing, end: closing + 1, text: escapeText(suffix) });
                for (const [position, child] of markers) {
                    if (position > match.index! && position < match.index! + match[0].length - 1) sharedBrackets.add(child);
                }
            }
        }
    }
    for (const node of nodes.filter(n => n.name === profile.elements.singleCitation || n.name === profile.elements.groupedCitation)) {
        const citationPrefix = sharedBrackets.has(node) ? '' : prefix;
        const citationSuffix = sharedBrackets.has(node) ? '' : suffix;
        const ids = (node.attributes[profile.attributes.targets] || '').trim().split(/\s+/).filter(Boolean);
        const mapped = ids.map(id => numbers.get(id));
        const isCitation = (n: XmlNode) => n.name === profile.elements.singleCitation || n.name === profile.elements.groupedCitation;
        const hasNestedCitation = (n: XmlNode): boolean => n.children.some(c => isCitation(c) || hasNestedCitation(c));
        let nested = hasNestedCitation(node);
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (isCitation(ancestor)) nested = true;
        if (nested) {
            issues.push({ target: ids.join(' ') || node.name, message: 'Nested citation preserved for review.' }); continue;
        }
        // Non-bibliographic links (figures, affiliations, etc.) remain unchanged.
        if (ids.length && !ids.some(id => seen.has(id)) && ids.every(id => allIds.has(id))) continue;
        const hasNoText = (element: XmlNode): boolean => {
            let cursor = element.openEnd;
            for (const child of element.children) {
                if (decodeAttribute(xml.slice(cursor, child.start)).trim() || !hasNoText(child)) return false;
                cursor = child.end;
            }
            return !decodeAttribute(xml.slice(cursor, element.closeStart)).trim();
        };
        if (ids.some(id => referenceIds.has(id)) && hasNoText(node)) {
            const location = node.attributes[profile.attributes.id] || `line ${xml.slice(0, node.start).split('\n').length}`;
            issues.push({ target: ids.join(' '), message: `Empty bibliography citation (${location}) left unchanged. Citation text may have been intentionally deleted; check the author's corrections before restoring it.` });
            continue;
        }
        if (!ids.length || (node.name === profile.elements.singleCitation && ids.length !== 1) || mapped.some(n => n === undefined)) {
            issues.push({ target: ids.join(' ') || node.name, message: 'Citation targets cannot all be numbered; citation left unchanged.' }); continue;
        }
        let inReference = false;
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (ancestor.name === profile.elements.reference) inReference = true;
        if (inReference) {
            issues.push({ target: ids.join(' '), message: 'Citation inside bibliography preserved for review.' }); continue;
        }
        const sorted = [...new Set(mapped as number[])].sort((a, b) => a - b), groups: string[] = [];
        for (let i = 0; i < sorted.length; i++) {
            const start = sorted[i]; let end = start;
            while (sorted[i + 1] === end + 1) end = sorted[++i];
            groups.push(end - start >= 2 ? `${start}–${end}` : start === end ? `${start}` : `${start},${end}`);
        }
        let start = node.openEnd, end = node.closeStart;
        const citationOpen = xml.slice(node.start, node.openEnd);
        const selfClosing = /\/\s*>$/.test(citationOpen);
        const replacementOpen = selfClosing ? citationOpen.replace(/\/\s*>$/, '>') : citationOpen;
        const replacementClose = selfClosing ? `</${node.name}>` : xml.slice(node.closeStart, node.end);
        const formatCitationText = (original: string): string | undefined => {
            // Decode only predefined/numeric references, keeping source offsets so
            // locator text and whitespace retain their original entity spelling.
            let decoded = '';
            const offsets = [0];
            for (const token of original.matchAll(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);|[\s\S]/g)) {
                const value = decodeAttribute(token[0]);
                decoded += value;
                for (let i = 0; i < value.length; i++) offsets.push(token.index! + token[0].length);
            }
            let from = 0, to = decoded.length;
            const trim = () => {
                from += /^\s*/.exec(decoded.slice(from, to))![0].length;
                to -= /\s*$/.exec(decoded.slice(from, to))![0].length;
            };
            // Match configured affixes before trimming: spaces can be part of them.
            let outerFrom = 0, outerTo = decoded.length;
            trim();
            outerFrom = from; outerTo = to;
            const candidates = [[0, decoded.length], [from, to]];
            const oldAffixes = ids.map(id => originalAffixes.get(id));
            const old = oldAffixes[0];
            const formats: [string, string][] = [[prefix, suffix]];
            if (old && oldAffixes.every(pair => pair && pair[0] === old[0] && pair[1] === old[1])) formats.push(old);
            const format = formats.find(([left, right]) => (left || right) && candidates.some(([a, b]) =>
                b - a >= left.length + right.length && decoded.slice(a, b).startsWith(left) && decoded.slice(a, b).endsWith(right)));
            const configured = format && candidates.find(([a, b]) => b - a >= format[0].length + format[1].length &&
                decoded.slice(a, b).startsWith(format[0]) && decoded.slice(a, b).endsWith(format[1]));
            if (configured) {
                [from, to] = configured;
                outerFrom = from; outerTo = to;
                from += format![0].length; to -= format![1].length;
                trim();
            } else if (decoded[from] === '[' || decoded[from] === '(' || decoded[from] === '{') {
                const text = decoded.slice(from, to);
                const close = text[0] === '[' ? ']' : text[0] === '(' ? ')' : '}';
                if (!text.endsWith(close)) return undefined;
                from++; to--; trim();
            }
            const text = decoded.slice(from, to);
            let locator = '';
            if (node.name === profile.elements.singleCitation) {
                const match = /^(\d+)(\s*,\s*pp?\.\s*\d+(?:\s*[–—-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–—-]\s*\d+)?)*)?\s*$/.exec(text);
                if (!match) return undefined;
                if (match[2]) locator = original.slice(offsets[from + match[1].length], offsets[from + match[1].length + match[2].length]);
            } else if (!/^\d+(?:\s*[,;–—-]\s*\d+)*$/.test(text)) return undefined;
            return original.slice(0, offsets[outerFrom]) + escapeText(`${citationPrefix}${groups.join(',')}`) + locator + escapeText(citationSuffix) + original.slice(offsets[outerTo]);
        };
        let newText = escapeText(`${citationPrefix}${groups.join(',')}${citationSuffix}`);
        let replacementContent = newText;
        if (!node.children.length && xml.slice(node.openEnd, node.closeStart).includes('<')) {
            issues.push({ target: ids.join(' '), message: 'Complex citation markup preserved; review numbering manually.' }); continue;
        }
        if (!node.children.length && !selfClosing) {
            const formatted = formatCitationText(xml.slice(node.openEnd, node.closeStart));
            if (formatted === undefined) {
                issues.push({ target: ids.join(' '), message: 'Ambiguous citation text preserved; review numbering manually.' }); continue;
            }
            replacementContent = formatted;
        }
        if (node.children.length) {
            // A single chain of formatting wrappers has one unambiguous numeric
            // text slot. Preserve every wrapper, attribute, and surrounding space.
            const formatting = new Set(['ce:italic', 'ce:bold', 'ce:sup', 'ce:inf']);
            let leaf = node, safe = true;
            while (leaf.children.length) {
                const child = leaf.children[0];
                if (leaf.children.length !== 1 || !formatting.has(child.name) ||
                    xml.slice(leaf.openEnd, child.start).trim() || xml.slice(child.end, leaf.closeStart).trim() ||
                    /\/\s*>$/.test(xml.slice(child.start, child.openEnd))) { safe = false; break; }
                leaf = child;
            }
            const text = xml.slice(leaf.openEnd, leaf.closeStart);
            const formatted = safe ? formatCitationText(text) : undefined;
            if (formatted === undefined) {
                issues.push({ target: ids.join(' '), message: 'Complex citation markup preserved; review numbering manually.' }); continue;
            }
            newText = formatted;
            replacementContent = xml.slice(node.openEnd, leaf.openEnd) + newText + xml.slice(leaf.closeStart, node.closeStart);
            if (!retainCitationFormatting) {
                const formattingNodes: XmlNode[] = [];
                let wrapper = node.children[0];
                while (wrapper) { formattingNodes.push(wrapper); wrapper = wrapper.children[0]; }
                if (formattingNodes.some(n => {
                    const id = n.attributes[profile.attributes.id];
                    return id && nodes.some(other => Object.entries(other.attributes).some(([key, value]) =>
                        key !== profile.attributes.id && (value.split(/\s+/).includes(id) || value.endsWith('#' + id))));
                })) {
                    issues.push({ target: ids.join(' '), message: 'Formatting contains a linked ID; retained to protect links.' });
                } else replacementContent = newText;
            }
        }
        const before = /\[\s*$/.exec(xml.slice(0, node.start));
        const after = /^\s*\]/.exec(xml.slice(node.end));
        if (!sharedBrackets.has(node) && prefix === '[' && suffix === ']' && before && after) {
            // Normalize an existing bracket pair outside the citation into its text.
            start = node.start - before[0].length; end = node.end + after[0].length;
            edits.push({ start, end, text: replacementOpen + replacementContent + replacementClose });
        } else if (selfClosing) edits.push({ start: node.start, end: node.end, text: replacementOpen + escapeText(`${prefix}${groups.join(',')}${suffix}`) + replacementClose });
        else edits.push({ start, end, text: replacementContent });
    }
    let output = xml;
    let boundary = xml.length;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        if (edit.end > boundary) throw new Error('Overlapping XML edits; numbering stopped.');
        output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
        boundary = edit.start;
    }
    const citedIds = new Set(nodes.filter(n => n.name === profile.elements.singleCitation || n.name === profile.elements.groupedCitation)
        .flatMap(n => (n.attributes[profile.attributes.targets] || '').trim().split(/\s+/)));
    return { output, changes, issues, processed: count, missingLabelCount: changes.filter(c => c.missingLabel).length,
        uncitedIds: [...seen].filter(id => !citedIds.has(id)) };
}
