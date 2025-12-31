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
    if (invalidLower.length < 3) return [];
    
    CREDIT_DB.forEach(role => {
        let bestDist = Infinity;
        role.aliases.forEach(alias => {
            const dist = levenshtein(invalidLower, alias);
            if (dist < bestDist) bestDist = dist;
        });
        
        // Dynamic threshold: Allow more errors for longer strings, tighter for short ones
        const threshold = Math.max(3, Math.floor(invalidLower.length * 0.4));
        
        if (bestDist <= threshold) {
            suggestions.push({ name: role.name, dist: bestDist });
        }
    });
    return suggestions.sort((a, b) => a.dist - b.dist).slice(0, 3);
}

export function findCreditRole(inputRole: string): CreditRole | null {
    if (!inputRole) return null;
    
    // aggressive normalization for matching
    const clean = inputRole.toLowerCase()
        .replace(/writting/g, "writing")
        .replace(/orginal/g, "original")
        .replace(/reviewand/g, "review and")
        .replace(/–/g, "-") // en-dash to hyphen
        .replace(/—/g, "-") // em-dash to hyphen
        .replace(/\band\b/g, "&")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim();
        
    for (const roleDef of CREDIT_DB) {
        // Check exact name match
        if (roleDef.name.toLowerCase() === clean) return roleDef;

        // Check aliases
        if (roleDef.aliases.includes(clean)) return roleDef;
        
        // Check if alias exists inside input (e.g. "Lead Conceptualization")
        // This is dangerous but helpful for "Lead" or "Equal" prefixes
        // for (const alias of roleDef.aliases) {
        //    if (clean.includes(alias) && clean.length < alias.length + 10) return roleDef;
        // }
    }
    return null;
}