import { CREDIT_DB } from '../constants';
import { CreditRole, Suggestion } from '../types';

export function levenshtein(a: string, b: string): number {
    const tmp: number[][] = [];
    let i, j, alen = a.length, blen = b.length;
    if (alen === 0) return blen;
    if (blen === 0) return alen;
    for (i = 0; i <= alen; i++) { tmp[i] = [i]; }
    for (j = 0; j <= blen; j++) { tmp[0][j] = j; }
    for (i = 1; i <= alen; i++) {
        for (j = 1; j <= blen; j++) {
            tmp[i][j] = (a[i - 1] === b[j - 1]) ? tmp[i - 1][j - 1] : Math.min(tmp[i - 1][j - 1], tmp[i - 1][j], tmp[i][j - 1]) + 1;
        }
    }
    return tmp[alen][blen];
}

export function getSuggestions(invalidRole: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const invalidLower = invalidRole.toLowerCase().trim();
    if (invalidLower.length < 2) return [];
    
    CREDIT_DB.forEach(role => {
        let bestDist = Infinity;
        
        const mainDist = levenshtein(invalidLower, role.name.toLowerCase());
        bestDist = Math.min(bestDist, mainDist);

        role.aliases.forEach(alias => {
            const dist = levenshtein(invalidLower, alias.toLowerCase());
            if (dist < bestDist) bestDist = dist;
        });
        
        const threshold = invalidLower.length < 5 ? 1 : Math.max(3, Math.floor(invalidLower.length * 0.35));
        if (bestDist <= threshold) {
            suggestions.push({ name: role.name, dist: bestDist });
        }
    });
    return suggestions.sort((a, b) => a.dist - b.dist).slice(0, 3);
}

export function findCreditRole(inputRole: string): CreditRole | null {
    if (!inputRole) return null;
    
    const clean = normalizeRole(inputRole);

    if (!clean) return null;

    // 1. Precise Match
    for (const roleDef of CREDIT_DB) {
        if (normalizeRole(roleDef.name) === clean) return roleDef;
        if (roleDef.aliases.some(a => normalizeRole(a) === clean)) return roleDef;
    }

    return null;
}
function normalizeRole(value: string): string {
    return value.toLowerCase().replace(/writting/g, 'writing').replace(/orginal/g, 'original')
        .replace(/reviewand/g, 'review and').replace(/&amp;/g, '&').replace(/&/g, ' and ')
        .replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}
