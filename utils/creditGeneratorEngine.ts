import { findCreditRole, getSuggestions } from './creditLogic';
import { scanReferenceXml } from './referenceUpdaterXml';

export const escapeCreditText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function splitCreditRoles(text: string): string[] {
    return text.split(/[,;]/).flatMap(token => {
        token = token.trim().replace(/\.+$/, '').trim();
        if (!token) return [];
        if (findCreditRole(token)) return [token];
        // Split a conjunction only when both sides are recognized roles.
        for (const match of token.matchAll(/\s+(?:and|&)\s+/gi)) {
            const left = token.slice(0, match.index).trim();
            const right = token.slice(match.index! + match[0].length).trim();
            const parts = splitCreditRoles(right);
            if (findCreditRole(left) && parts.length && parts.every(p => findCreditRole(p))) return [left, ...parts];
        }
        return [token];
    });
}

export function generateCredit(input: string) {
    let text = input;
    let opening = '', closing = '';
    if (/<\/?ce:[\w-]+\b/.test(input)) {
        const parsed = scanReferenceXml(input, {allowDuplicateIds: true});
        const roots = parsed.nodes.filter(n => !parsed.nodes.some(other => other.start < n.start && other.end > n.end));
        const paras = roots.filter(n => n.name === 'ce:para');
        if (roots.length !== 1 || paras.length !== 1) throw new Error('Provide one CRediT paragraph, or plain author-role text.');
        text = parsed.textContent(paras[0]);
        opening = input.slice(paras[0].start, paras[0].openEnd);
        closing = '</ce:para>';
    }
    // Periods in initials stay within the author name; delimiters require a following author colon.
    const segments: string[] = [];
    let cursor = 0;
    for (const match of text.matchAll(/(?:;\s*|\.\s+|[\r\n]+|\s+and\s+)(?=[^:;\r\n<>]+:)/gi)) {
        if (!text.slice(cursor, match.index).includes(':')) continue;
        segments.push(text.slice(cursor, match.index));
        cursor = match.index! + match[0].length;
    }
    segments.push(text.slice(cursor));
    const authors: Array<{name: string; originalSegment: string; roles: Array<{normalized: string; original: string; isCorrection: boolean; isDuplicate: boolean; isUnknown: boolean}>}> = [];
    const issues: Array<{id: string; original: string; suggestion?: string; type: 'typo'|'unknown'|'duplicate'; authorIndex: number}> = [];
    const bold: string[] = [], xml: string[] = [];
    for (const segment of segments) {
        const part = segment.trim().replace(/\.+$/, '').trim();
        if (!part) continue;
        const colon = part.indexOf(':');
        const name = part.slice(0, colon).trim();
        if (colon < 1 || !name || /[<>]/.test(name)) throw new Error('Each author must have a name followed by a colon and contribution roles.');
        const tokens = splitCreditRoles(part.slice(colon + 1));
        if (!tokens.length) throw new Error(`No contribution roles supplied for ${name}.`);
        const seen = new Set<string>();
        const roles = tokens.map(original => {
            const match = findCreditRole(original);
            const normalized = match?.name ?? original;
            const isDuplicate = !!match && seen.has(normalized);
            const isCorrection = !!match && original.toLowerCase() !== normalized.toLowerCase();
            if (match) seen.add(normalized);
            if (!match || isDuplicate || isCorrection) issues.push({id: String(issues.length), original,
                suggestion: isDuplicate ? 'Removed duplicate' : match?.name ?? getSuggestions(original)[0]?.name,
                type: !match ? 'unknown' : isDuplicate ? 'duplicate' : 'typo', authorIndex: authors.length});
            return {normalized, original, isCorrection, isDuplicate, isUnknown: !match};
        });
        authors.push({name, originalSegment: part, roles});
        bold.push(`<ce:bold>${escapeCreditText(name)}:</ce:bold> ${roles.filter(r => !r.isDuplicate).map(r => escapeCreditText(r.normalized)).join(', ')}.`);
        const tags = roles.filter(r => !r.isDuplicate && !r.isUnknown).map(r => {
            const match = findCreditRole(r.normalized)!;
            return `<ce:contributor-role role="${match.url}">${escapeCreditText(match.name)}</ce:contributor-role>`;
        });
        xml.push(`${name}:\n${tags.join('\n') || '<!-- No valid CRediT roles found -->'}`);
    }
    if (!authors.length) throw new Error('No author contributions found.');
    return {authors, issues, bold: opening + bold.join(' ') + closing, xml: xml.join('\n\n')};
}

export function correctCreditAliases(input: string): string {
    // XML edits require source offsets; leave markup intact rather than rewriting its contents.
    if (/<\/?ce:/.test(input)) return input;
    const result = generateCredit(input);
    let output = input;
    for (const author of result.authors) {
        const colon = author.originalSegment.indexOf(':');
        const roles = author.originalSegment.slice(colon + 1);
        const corrected = roles.split(/([,;])/).map(token => {
            const match = findCreditRole(token.trim().replace(/\.+$/, ''));
            return match ? token.replace(token.trim(), match.name) : token;
        }).join('');
        output = output.replace(author.originalSegment, author.originalSegment.slice(0, colon + 1) + corrected);
    }
    return output;
}
