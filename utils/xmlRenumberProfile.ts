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

export function renumberWithProfile(xml: string, profile: RenumberProfile, prefix: string, suffix: string) {
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
    const seen = new Set<string>();
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
        const newLabel = `${prefix}${++count}${suffix}`;
        numbers.set(id, count);
        const labelOpen = xml.slice(label.start, label.openEnd);
        if (/\/\s*>$/.test(labelOpen)) edits.push({ start: label.start, end: label.end, text: labelOpen.replace(/\/\s*>$/, '>') + escapeText(newLabel) + `</${label.name}>` });
        else edits.push({ start: label.openEnd, end: label.closeStart, text: escapeText(newLabel) });
        changes.push({ id, oldLabel: oldLabel.trim(), newLabel, changed: oldLabel !== escapeText(newLabel), isOtherRef });
    }
    for (const node of nodes.filter(n => n.name === profile.elements.singleCitation || n.name === profile.elements.groupedCitation)) {
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
        const before = /\[\s*$/.exec(xml.slice(0, node.start));
        const after = /^\s*\]/.exec(xml.slice(node.end));
        if (prefix === '[' && suffix === ']' && before && after) {
            // Normalize an existing bracket pair outside the citation into its text.
            start = node.start - before[0].length; end = node.end + after[0].length;
            edits.push({ start, end, text: replacementOpen + escapeText(`[${groups.join(',')}]`) + replacementClose });
        } else if (selfClosing) edits.push({ start: node.start, end: node.end, text: replacementOpen + escapeText(`${prefix}${groups.join(',')}${suffix}`) + replacementClose });
        else edits.push({ start, end, text: escapeText(`${prefix}${groups.join(',')}${suffix}`) });
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
