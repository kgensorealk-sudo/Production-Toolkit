import React, { useState, useMemo } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { 
    FileText, Copy, Download, CheckCircle2, Filter, Layers, 
    ShieldCheck, Eye, Code, Sparkles, RefreshCw, CheckSquare, 
    Square, Search, FileCheck, Info, X, Zap, ArrowRight, ArrowLeft
} from 'lucide-react';

interface ExtractedRef {
    id: string;
    label: string;
    rawText: string;
    formattedHtml: string;
    sourceType: 'other-ref' | 'structured' | 'fallback';
    hasSuperscript: boolean;
    hasSubscript: boolean;
    hasItalic: boolean;
    hasBold: boolean;
    hasSmallCaps: boolean;
    hasUnderline: boolean;
}

/**
 * CONVERTS XML FORMATTING TAGS TO STANDARD HTML TAGS
 */
const convertXmlTagsToHtml = (xml: string): string => {
    if (!xml) return '';
    return xml
        // Italic tags
        .replace(/<ce:italic\b[^>]*>/gi, '<i>')
        .replace(/<\/ce:italic>/gi, '</i>')
        .replace(/<ce:emphasis\b[^>]*>/gi, '<i>')
        .replace(/<\/ce:emphasis>/gi, '</i>')
        .replace(/<italic\b[^>]*>/gi, '<i>')
        .replace(/<\/italic>/gi, '</i>')
        .replace(/<em\b[^>]*>/gi, '<i>')
        .replace(/<\/em>/gi, '</i>')
        
        // Bold tags
        .replace(/<ce:bold\b[^>]*>/gi, '<b>')
        .replace(/<\/ce:bold>/gi, '</b>')
        .replace(/<bold\b[^>]*>/gi, '<b>')
        .replace(/<\/bold>/gi, '</b>')
        .replace(/<strong\b[^>]*>/gi, '<b>')
        .replace(/<\/strong>/gi, '</b>')

        // Volume tags -> bold (data within <sb:volume> / <ce:volume-nr> should always be bolded)
        .replace(/<s[be]:volume(?:-nr)?\b[^>]*>/gi, '<b>')
        .replace(/<\/s[be]:volume(?:-nr)?>/gi, '</b>')
        .replace(/<c[be]:volume(?:-nr)?\b[^>]*>/gi, '<b>')
        .replace(/<\/c[be]:volume(?:-nr)?>/gi, '</b>')
        .replace(/<volume(?:-nr)?\b[^>]*>/gi, '<b>')
        .replace(/<\/volume(?:-nr)?>/gi, '</b>')

        // Superscript tags
        .replace(/<ce:sup\b[^>]*>/gi, '<sup>')
        .replace(/<\/ce:sup>/gi, '</sup>')
        .replace(/<superscript\b[^>]*>/gi, '<sup>')
        .replace(/<\/superscript>/gi, '</sup>')

        // Subscript tags
        .replace(/<ce:inf\b[^>]*>/gi, '<sub>')
        .replace(/<\/ce:inf>/gi, '</sub>')
        .replace(/<ce:sub\b[^>]*>/gi, '<sub>')
        .replace(/<\/ce:sub>/gi, '</sub>')
        .replace(/<subscript\b[^>]*>/gi, '<sub>')
        .replace(/<\/subscript>/gi, '</sub>')

        // Small caps tags
        .replace(/<ce:small-caps\b[^>]*>/gi, '<span class="small-caps" style="font-variant: small-caps;">')
        .replace(/<\/ce:small-caps>/gi, '</span>')
        .replace(/<small-caps\b[^>]*>/gi, '<span class="small-caps" style="font-variant: small-caps;">')
        .replace(/<\/small-caps>/gi, '</span>')

        // Underline tags
        .replace(/<ce:underline\b[^>]*>/gi, '<u>')
        .replace(/<\/ce:underline>/gi, '</u>')
        .replace(/<underline\b[^>]*>/gi, '<u>')
        .replace(/<\/underline>/gi, '</u>');
};

/**
 * SANITIZES FORMATTED HTML FOR WORD & DISPLAY
 * Converts XML formatting tags to clean HTML (i, b, sup, sub, u, span),
 * strips non-formatting XML tags without adding extra word spaces,
 * and cleans up punctuation spacing relative to formatting tags.
 */
const sanitizeFormattedHtml = (rawXml: string): string => {
    if (!rawXml) return '';

    // Step 1: Normalize unicode whitespace & remove control chars
    let step = rawXml
        .normalize('NFKC')
        .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '');

    // Step 2: Convert formatting XML tags to standard HTML
    step = convertXmlTagsToHtml(step);

    // Step 3: Strip non-formatting XML/HTML tags
    step = step.replace(/<(?!\/?(?:i|b|sup|sub|u|span)\b)[^>]+>/gi, '');

    // Step 4: Remove whitespace inside open/close formatting tags
    step = step
        .replace(/<(i|b|sup|sub|u)\b[^>]*>\s+/gi, '<$1>')
        .replace(/\s+<\/(i|b|sup|sub|u)>/gi, '</$1>')
        .replace(/<span\b[^>]*>\s+/gi, '<span style="font-variant: small-caps;">')
        .replace(/\s+<\/span>/gi, '</span>');

    // Step 5: Collapse multiple spaces
    step = step.replace(/\s+/g, ' ');

    // Step 6: Fix spaces before punctuation (including when preceded by closing tags)
    step = step
        .replace(/\s+([,.:;)])/g, '$1')
        .replace(/(<\/(?:i|b|sup|sub|u|span)>)\s+([,.:;)])/gi, '$1$2')
        .replace(/\s+(<\/(?:i|b|sup|sub|u|span)>)/gi, '$1')
        .replace(/\(\s+/g, '(')
        .replace(/\bet\s+al\b(?!\.)/gi, 'et al.')
        .replace(/,\s*,/g, ', ')
        .replace(/,\s*\./g, '.')
        .replace(/\.\s*,/g, '.');

    // Step 6.5: Enforce Year directly after author names & formatting rules
    step = enforceYearAfterAuthors(step);

    // Ensure URLs and DOIs are never bolded or italicized
    step = step.replace(/(https?:\/\/[^\s,;)]+|doi:[^\s,;)]+)/gi, (url) => url.replace(/<\/?(?:b|i|sup|sub|u|span)\b[^>]*>/gi, ''));

    step = step.trim();

    // Step 7: Final Rule - Enforce trailing period if missing
    if (step && !step.endsWith('.')) {
        step += '.';
    }

    return step;
};

/**
 * CAPITALIZES PUBLISHER NAMES (e.g. "Springer publishing company" -> "Springer Publishing Company")
 */
const formatPublisherName = (name: string): string => {
    if (!name) return '';
    const minorWords = new Set(['and', 'of', 'for', 'the', 'in', 'on', 'at', 'to', 'a', 'an', '&']);
    return name
        .trim()
        .split(/\s+/)
        .map((word, idx) => {
            const lower = word.toLowerCase();
            if (idx > 0 && minorWords.has(lower)) {
                return lower;
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
};

/**
 * CONVERTS A STRING TO TITLE CASE WHILE PRESERVING ACRONYMS AND FORMATTING TAGS
 * e.g. "Statistical power analysis for the behavioral sciences"
 *   -> "Statistical Power Analysis for the Behavioral Sciences"
 */
const toTitleCase = (str: string): string => {
    if (!str) return '';
    const minorWords = new Set([
        'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with', 'from', 'into', 'over'
    ]);
    
    return str.replace(/[A-Za-z0-9]+(?:['’][a-z]+)?/g, (word, offset, full) => {
        if (/^[A-Z0-9]{2,}$/.test(word)) return word; // Preserve acronyms like HPA, DNA, APA, etc.
        const lower = word.toLowerCase();
        const prevSlice = full.slice(0, offset).trim();
        const prevChar = prevSlice.slice(-1);
        const isStart = offset === 0 || [':', '-', '–', '—', '.', '?', '!', '['].includes(prevChar);
        const isLast = offset + word.length >= full.trim().length;

        if (!isStart && !isLast && minorWords.has(lower)) {
            return lower;
        }
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
};

/**
 * CONVERTS A STRING TO SENTENCE CASE WHILE PRESERVING ACRONYMS AND PUNCTUATION CAPITALIZATION
 * e.g. "Network Psychometrics" -> "Network psychometrics"
 */
const toSentenceCase = (str: string): string => {
    if (!str) return '';
    return str.replace(/[A-Za-z0-9]+(?:['’][a-z]+)?/g, (word, offset, full) => {
        if (/^[A-Z0-9]{2,}$/.test(word)) return word; // Preserve acronyms
        if (/^[a-z]+[A-Z]/.test(word)) return word;   // Preserve camelCase words like PubMed

        const prevSlice = full.slice(0, offset).trim();
        const prevChar = prevSlice.slice(-1);
        const isStart = offset === 0 || [':', '-', '–', '—', '.', '?', '!', '['].includes(prevChar);

        const lower = word.toLowerCase();
        if (isStart) {
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        }
        return lower;
    });
};

/**
 * REMOVES ERRONEOUS "In:" / "In." PREFIXES:
 * - Before publishers (e.g. ". In. Routledge" -> ". Routledge", ", In: Springer" -> ". Springer")
 * - Before institutions/universities for thesis (e.g. ", In: Yale University" -> ". Yale University")
 * - Before journals (e.g. "In: American Journal of..." -> "American Journal of...")
 */
const cleanErroneousIn = (text: string): string => {
    let cleaned = text;

    // Erroneous In: or In. before known publisher names
    cleaned = cleaned.replace(/[,.]?\s*\bIn[:.]\s*([A-Z][A-Za-z0-9\s&]+(?:\b(?:Press|Publishing(?:\s+Company)?|Publishers?|Company|Books?|Springer|Elsevier|Wiley|Routledge|Academic|OUP|CUP|Nature|Plenum|Karger|De\s+Gruyter|Pergamon|Sage|Taylor\s*(?:&|and)\s*Francis|Oxford|Cambridge|Harvard|MIT|Addison-Wesley|McGraw-Hill|Prentice\s+Hall|Macmillan|Simon\s*(?:&|and)\s*Schuster|HarperCollins|Beacon|StatPearls)\b[A-Za-z0-9\s&]*))\b/gi, (_, pub) => {
        return `. ${formatPublisherName(pub)}`;
    });

    // Erroneous In: or In. before university/institution for thesis
    cleaned = cleaned.replace(/[,.]?\s*\bIn[:.]\s*([A-Z][A-Za-z0-9\s&]+(?:\b(?:University|College|Institute|School|Academy)\b[A-Za-z0-9\s&]*))\b/gi, (_, inst) => {
        return `. ${inst.trim()}`;
    });

    // Erroneous In: before journal
    cleaned = cleaned.replace(/[,.]?\s*\bIn[:.]\s*([A-Z][A-Za-z0-9.\s&]+(?:\b(?:Journal|Annals|Archives|Reviews?|Transactions|Bulletin|Gazette)\b[A-Za-z0-9.\s&]*))\b/gi, (_, j) => {
        return ` ${j.trim()}`;
    });

    // Erroneous standalone "In." or "In:" right before the final publisher word (e.g. "... sciences. In. Routledge.")
    cleaned = cleaned.replace(/\.\s*In[:.]\s+([A-Z][A-Za-z0-9&]+(?:\s+[A-Za-z0-9&]+){0,3}\.?)$/i, (_, pub) => {
        return `. ${formatPublisherName(pub)}`;
    });

    return cleaned;
};

/**
 * FORMATS THE REST OF A REFERENCE AFTER AUTHORS AND YEAR:
 * - Sanitizes erroneous "In:" before publishers, institutions, or journals.
 * - When "In:" is legitimately present (Book Chapter):
 *     Chapter title in sentence case (e.g. "Network psychometrics")
 *     Book title in Title Case (e.g. "The Wiley Handbook of Psychometric Testing...")
 * - When citing a standalone complete book:
 *     Book title in Title Case (e.g. "Statistical Power Analysis for the Behavioral Sciences")
 */
const formatReferenceRest = (rest: string): string => {
    let cleaned = cleanErroneousIn(rest);

    const inMatch = cleaned.match(/^([\s\S]*?)[.,]?\s+In:\s*([\s\S]*)$/i);
    if (inMatch) {
        const rawChap = inMatch[1].trim().replace(/[\s,.]*$/, '');
        const restAfterIn = inMatch[2].trim();
        const chapTitle = toSentenceCase(rawChap);

        // Check for editor in restAfterIn: e.g. "Editor, A. (Ed.), Book Title, 953–986"
        const edMatch = restAfterIn.match(/^([^(]+?\((?:Eds?|Ed\.|Eds\.)\),?\s*)([\s\S]*)$/i);
        if (edMatch) {
            const editorPart = edMatch[1];
            const bookAndRest = edMatch[2];
            const pageMatch = bookAndRest.match(/^([\s\S]*?)(,\s*(?:pp?\.?\s*)?\d+[\s–-]+\d+[\s\S]*)$/i);
            if (pageMatch) {
                const bookTitle = toTitleCase(pageMatch[1].trim());
                cleaned = `${chapTitle}. In: ${editorPart}${bookTitle}${pageMatch[2]}`;
            } else {
                cleaned = `${chapTitle}. In: ${editorPart}${toTitleCase(bookAndRest)}`;
            }
        } else {
            const pageMatch = restAfterIn.match(/^([\s\S]*?)(,\s*(?:pp?\.?\s*)?\d+[\s–-]+\d+[\s\S]*)$/i);
            if (pageMatch) {
                const bookTitle = toTitleCase(pageMatch[1].trim());
                cleaned = `${chapTitle}. In: ${bookTitle}${pageMatch[2]}`;
            } else {
                cleaned = `${chapTitle}. In: ${toTitleCase(restAfterIn)}`;
            }
        }
    } else {
        // Standalone book check: e.g. "Statistical power analysis for the behavioral sciences. Routledge."
        const bookMatch = cleaned.match(/^([^.]+)\.\s*([A-Z][A-Za-z0-9\s&]+(?:\b(?:Press|Publishing(?:\s+Company)?|Publishers?|Company|Books?|Springer|Elsevier|Wiley|Routledge|Academic|OUP|CUP|Nature|Plenum|Karger|De\s+Gruyter|Pergamon|Sage|Taylor\s*(?:&|and)\s*Francis|Oxford|Cambridge|Harvard|MIT|Addison-Wesley|McGraw-Hill|Prentice\s+Hall|Macmillan|Simon\s*(?:&|and)\s*Schuster|HarperCollins|Beacon|StatPearls)\b[A-Za-z0-9\s&]*)\.?)$/i);
        if (bookMatch) {
            const bookTitle = toTitleCase(bookMatch[1].trim());
            const pub = formatPublisherName(bookMatch[2].trim().replace(/\.$/, ''));
            cleaned = `${bookTitle}. ${pub}.`;
        }
    }

    return cleaned;
};

/**
 * STANDARDIZES AUTHOR INITIALS TO APA STYLE WITH PERIODS AND SPACES:
 * e.g. "R.S." -> "R. S.", "S." -> "S.", "Richard S." -> "R. S.", "J.-P." -> "J.-P."
 */
const formatInitials = (given: string): string => {
    if (!given) return '';
    const trimmed = given.trim().replace(/,/g, '');
    
    // If it's already properly spaced initials: e.g. "R. S." or "S." or "A. B. C."
    if (/^[A-Z]\.(?:\s+[A-Z]\.)*$/i.test(trimmed)) {
        return trimmed.replace(/\s+/g, ' ');
    }
    // If it's unspaced initials with dots: e.g. "R.S." or "R.S.T."
    if (/^[A-Z]\.(?:[A-Z]\.)+$/i.test(trimmed)) {
        return trimmed.replace(/([A-Z])\./gi, '$1. ').trim();
    }
    // If it has hyphens: e.g. "J.-P." or "J-P"
    if (/^[A-Z]\.?\s*-\s*[A-Z]\.?$/i.test(trimmed)) {
        return trimmed.replace(/^([A-Z])\.?\s*-\s*([A-Z])\.?$/i, '$1.-$2.');
    }
    // If single letter: "S" or "S."
    if (/^[A-Z]\.?$/i.test(trimmed)) {
        return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
    }
    // Multiple letters without dots: e.g. "RS" or "ABC"
    if (/^[A-Z]{2,4}$/.test(trimmed)) {
        return trimmed.split('').join('. ') + '.';
    }
    // Full words / names: e.g. "Richard S." or "Richard"
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
        return parts.map(part => {
            if (part.includes('-')) {
                return part.split('-').map(sub => `${sub.charAt(0).toUpperCase()}.`).join('-');
            }
            if (/^[A-Z]\.?$/i.test(part)) {
                return part.endsWith('.') ? part.toUpperCase() : `${part.toUpperCase()}.`;
            }
            return `${part.charAt(0).toUpperCase()}.`;
        }).join(' ');
    }
    return trimmed;
};

/**
 * PARSES AN AUTHOR STRING AND FORMATS IT AS "Surname, Initials" (APA STYLE)
 * e.g. "R.S. Lazarus" -> "Lazarus, R. S."
 * e.g. "S. Folkman" -> "Folkman, S."
 * e.g. "Lazarus, R. S." -> "Lazarus, R. S."
 */
const parseAndFormatAuthorString = (authorStr: string): string => {
    let str = authorStr.trim();
    if (!str || /^et\s+al\.?$/i.test(str)) return str;

    // Check if "Surname, Initials/Given"
    if (str.includes(',')) {
        const parts = str.split(',').map(x => x.trim());
        const last = parts[0];
        const rest = parts.slice(1);
        
        let suffix = '';
        let givenPart = rest.join(', ');
        if (rest.length > 1 && /^(?:Jr\.?|Sr\.?|III|II|IV)$/i.test(rest[rest.length - 1])) {
            suffix = rest[rest.length - 1];
            givenPart = rest.slice(0, -1).join(', ');
        } else if (rest.length === 1 && /^(?:Jr\.?|Sr\.?|III|II|IV)$/i.test(rest[0])) {
            return `${last}, ${rest[0]}`;
        }
        
        const init = formatInitials(givenPart);
        let res = init ? `${last}, ${init}` : last;
        if (suffix) res += `, ${suffix}`;
        return res;
    }

    // Check if "Given/Initials Surname"
    const surnamePrefix = `(?:(?:van|von|der|de|da|del|della|du|le|la|al|bin|ibn)\\s+)*`;
    const givenRegex = new RegExp(`^((?:[A-Z]\\.?\\s*-?\\s*)+|[A-Z][a-z]+(?:\\s+[A-Z]\\.?)*)\\s+(${surnamePrefix}[A-Z][a-zA-Z\\-']+)$`, 'i');
    const match = str.match(givenRegex);
    if (match) {
        const given = match[1].trim();
        const surname = match[2].trim();
        const init = formatInitials(given);
        return init ? `${surname}, ${init}` : `${surname}, ${given}`;
    }

    return str;
};

/**
 * JOINS FORMATTED AUTHORS IN APA STYLE (e.g. "Lazarus, R. S., & Folkman, S.")
 */
const joinAuthorList = (authors: string[]): string => {
    if (authors.length === 0) return '';
    const formatted = authors.map(a => parseAndFormatAuthorString(a));
    
    const hasEtAl = formatted.length > 0 && /^et\s+al\.?$/i.test(formatted[formatted.length - 1]);
    const mainAuthors = hasEtAl ? formatted.slice(0, -1) : formatted;

    if (mainAuthors.length === 0) {
        return hasEtAl ? 'et al.' : '';
    }
    if (mainAuthors.length === 1) {
        return hasEtAl ? `${mainAuthors[0]}, et al.` : mainAuthors[0];
    }
    if (mainAuthors.length === 2) {
        return hasEtAl 
            ? `${mainAuthors[0]}, ${mainAuthors[1]}, et al.`
            : `${mainAuthors[0]}, & ${mainAuthors[1]}`;
    }
    const allButLast = mainAuthors.slice(0, -1).join(', ');
    const last = mainAuthors[mainAuthors.length - 1];
    return hasEtAl
        ? `${allButLast}, ${last}, et al.`
        : `${allButLast}, & ${last}`;
};

/**
 * FORMATS A SINGLE AUTHOR FROM XML FIELDS (Surname, Given, Suffix)
 */
const formatSingleAuthor = (given: string, surname: string, suffix?: string, degrees?: string): string => {
    let s = surname ? surname.trim() : '';
    let g = given ? given.trim() : '';
    let suf = suffix ? suffix.trim() : '';

    if (g && s) {
        const init = formatInitials(g);
        let res = init ? `${s}, ${init}` : `${s}, ${g}`;
        if (suf) res += `, ${suf}`;
        return res;
    } else if (s) {
        if (s.includes(',')) {
            return parseAndFormatAuthorString(s);
        }
        return s;
    } else if (g) {
        return formatInitials(g);
    }
    return '';
};

function splitAuthorsAndRest(step: string): { authors: string; rest: string } {
    let workingStr = step.trim();

    // Regex for ONE author:
    // 1. Initials (including multi-part, hyphenated, or mixed case like E.MacA., J.-P., M.U., A.) + Surname (with optional prefixes like van, der, de, etc.)
    // 2. Surname + comma/space + Initials
    // 3. Given Name + Surname
    // 4. "et al." / "and others"
    const initialPart = `(?:[A-Z][A-Za-z0-9]?\\.(?:\\s*-?\\s*[A-Z][A-Za-z0-9]?\\.)*|[A-Z]{1,4}\\b)`;
    const surnamePart = `(?:(?:van|von|der|de|da|del|della|du|le|la|al|bin|ibn)\\s+)*[A-Z][a-zA-Z\\-']{1,}`;
    const authorRegex = new RegExp(`^(?:${initialPart}\\s+${surnamePart}|${surnamePart}\\s*,\\s*${initialPart}|${surnamePart}\\s+${initialPart}|[A-Z]\\.\\s*,\\s*${surnamePart}|[A-Z][a-z]{1,}\\s+${surnamePart})`, 'i');

    let authors: string[] = [];
    let currentPos = 0;

    while (currentPos < workingStr.length) {
        // Skip leading punctuation/delimiters like comma, semicolon, "and", "&", whitespace
        const delimMatch = workingStr.slice(currentPos).match(/^(?:[\s,;&]|and\b)+/i);
        if (delimMatch) {
            currentPos += delimMatch[0].length;
        }

        const remaining = workingStr.slice(currentPos);
        if (!remaining) break;

        // Check for "et al." or "and others"
        const etAlMatch = remaining.match(/^(?:et\s+al\.?|and\s+others\b)/i);
        if (etAlMatch) {
            authors.push('et al.');
            currentPos += etAlMatch[0].length;
            break;
        }

        const match = remaining.match(authorRegex);
        if (!match) break;

        let authorText = match[0].trim();

        // Title word guard (words that look like titles or journal names rather than human authors)
        if (/^(?:Journal|Proceedings|Advances|International|American|European|Transactions|Review|Letters|Strategies|Synthesis|Development|Effect|Analysis|Role|Impact|Characterization|Design|Fabrication|Preparation|Application|Study|Evaluation|Investigation|Country|Report|Guidelines|Approaches)\b/i.test(authorText)) {
            break;
        }

        currentPos += match[0].length;

        // Check for suffix like ", Jr." or ", III"
        const suffixMatch = workingStr.slice(currentPos).match(/^,\s*(?:Jr\.?|Sr\.?|III|II|IV)\b/i);
        if (suffixMatch) {
            authorText += suffixMatch[0];
            currentPos += suffixMatch[0].length;
        }

        authors.push(authorText);

        // Look at next character after the author name
        const nextChar = workingStr.slice(currentPos).trimStart();
        if (nextChar.startsWith('.')) {
            // Check if what follows the period is another author or title
            const postPeriod = nextChar.slice(1).trimStart();
            const postPeriodDelim = postPeriod.match(/^(?:[\s,;&]|and\b)+/i);
            const postPeriodRest = postPeriodDelim ? postPeriod.slice(postPeriodDelim[0].length) : postPeriod;

            const isEtAl = /^(?:et\s+al\.?|and\s+others\b)/i.test(postPeriodRest);
            const isNextAuthor = postPeriodRest.match(authorRegex);
            if (!isNextAuthor && !isEtAl) {
                // Next segment is title! Stop author loop here.
                const dotOffset = workingStr.slice(currentPos).indexOf('.');
                if (dotOffset !== -1) {
                    currentPos += dotOffset + 1;
                }
                break;
            }
        }
    }

    if (authors.length > 0) {
        let authorsString = joinAuthorList(authors);
        const restString = workingStr.slice(currentPos).trim();
        return { authors: authorsString, rest: restString };
    }

    return { authors: '', rest: workingStr };
}

/**
 * Safely masks URLs and DOIs so formatting regexes never alter them
 */
const protectUrlsAndDois = (str: string, fn: (text: string) => string): string => {
    if (!str) return '';
    const urls: string[] = [];
    const masked = str.replace(/(https?:\/\/[^\s,;)]+|doi:[^\s,;)]+)/gi, (match) => {
        urls.push(match);
        return `___URL_TOKEN_${urls.length - 1}___`;
    });
    const processed = fn(masked);
    return processed.replace(/___URL_TOKEN_(\d+)___/g, (_, idx) => urls[parseInt(idx)]);
};

/**
 * ENFORCES:
 * 1. Placement of Year directly AFTER Author names in APA style: e.g. "Authors (2023). Title..."
 * 2. Formats Author list with & and initials: e.g. "Lazarus, R. S., & Folkman, S. (1984)."
 * 3. Removes erroneous "In:" before publisher in standalone books: e.g. "Title. Springer Publishing Company."
 * 4. Volume(Issue) Pages formatting with comma: e.g. "14(1), 310–331", "10, 598"
 * 5. En-dash for page ranges: e.g. "511–535", "e106–e113"
 * 6. Book chapter ordering: Publisher before pages e.g. "Springer, 587–603"
 * NON-DESTRUCTIVE: Never strips years from titles, DOIs, URLs, or page ranges.
 */
const enforceYearAfterAuthors = (html: string): string => {
    if (!html) return '';

    return protectUrlsAndDois(html, (text) => {
        let step = text;

        // 1. Normalize hyphens in page ranges (e.g. 877-893 -> 877–893, e106-e113 -> e106–e113)
        step = step.replace(/([a-z]?\d+)\s*[-–—]\s*([a-z]?\d+)/gi, '$1–$2');

        // 2. Remove space between Volume (number or <b>volume</b>) and Issue in parentheses: "14 (1)" -> "14(1)"
        step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)\s*,\s*(\([\w\d\s-]+\))/gi, '$1$2');
        step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)\s+(\([\w\d\s-]+\))/gi, '$1$2');

        // 3. Volume + Issue before Pages/Article-number: MUST have comma and space
        // e.g. "14(1) 310–331" -> "14(1), 310–331"
        // e.g. "14(1): 310–331" -> "14(1), 310–331"
        // e.g. "<b>14</b>(1) 310–331" -> "<b>14</b>(1), 310–331"
        step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)(\([\w\d\s-]+\))\s*[:;,]?\s+([a-z]?\d+(?:[–-][a-z]?\d+)?\b)/gi, '$1$2, $3');

        // 4. Volume (bolded or plain after journal) before Pages/Article-number without issue: MUST have comma and space
        // e.g. "<b>10</b> 598" -> "<b>10</b>, 598"
        // e.g. "<b>7</b> 511–535" -> "<b>7</b>, 511–535"
        // e.g. "<b>129</b> 105267" -> "<b>129</b>, 105267"
        // e.g. "<b>8</b> e106–e113" -> "<b>8</b>, e106–e113"
        step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>)\s*[:;,]?\s+([a-z]?\d+(?:[–-][a-z]?\d+)?\b)(?!<\/b>)/gi, '$1, $2');

        // Plain volume after journal title (e.g. "Front. Neurol., 10 598." -> "Front. Neurol., 10, 598.")
        step = step.replace(/(,\s*<[a-z]+>[\s\S]*?<\/[a-z]+>|,\s*[A-Z][a-zA-Z0-9.\s]+),\s*(\d{1,4})\s+([a-z]?\d+(?:[–-][a-z]?\d+)?\b)/g, '$1, $2, $3');

        // 5. Remove erroneous "In:" before publishers in standalone books:
        step = cleanErroneousIn(step);

        // 6. Book chapter order: If pages appear before known publisher (e.g. "587–603, Springer" -> "Springer, 587–603")
        step = step.replace(/(\b[a-z]?\d+[–-][a-z]?\d+\b),\s*([A-Z][A-Za-z0-9\s&]+(?:\b(?:Press|Publishers?|Springer|Elsevier|Wiley|Routledge|Academic|OUP|CUP|Nature|Plenum|Karger|De\s+Gruyter)\b[A-Za-z0-9\s&]*))\b/g, '$2, $1');

        // 7. Remove comma directly before year in parentheses: e.g. "Authors, (1984)." -> "Authors (1984)."
        step = step.replace(/([^\d\s,;&]+)\s*,\s*(\((?:19|20)\d{2}[a-z]?\))/g, '$1 $2');

        // Check if year is ALREADY positioned right after authors near the start:
        // e.g. "Authors (2023)." or "Authors, (2023)."
        const earlyYearMatch = step.match(/^([^\d()]{1,300}?)\s*\(((?:19|20)\d{2}[a-z]?)\)([.,]?)([\s\S]*)$/);
        if (earlyYearMatch) {
            const rawAuthors = earlyYearMatch[1].trim();
            const y = earlyYearMatch[2];
            let afterYear = earlyYearMatch[4].trim();

            const { authors: parsedAuthors } = splitAuthorsAndRest(rawAuthors);
            if (parsedAuthors) {
                afterYear = formatReferenceRest(afterYear);
                step = `${parsedAuthors} (${y}). ${afterYear}`;
                return step
                    .replace(/,\s*,/g, ', ')
                    .replace(/\.\s*\./g, '.')
                    .replace(/\s+/g, ' ')
                    .replace(/\s+([,.:;)])/g, '$1')
                    .trim();
            }
        }

        // 8. Find 4-digit year (19xx or 20xx)
        const yearMatch = step.match(/\b((?:19|20)\d{2}[a-z]?)\b/);
        if (!yearMatch) {
            return step;
        }
        const year = yearMatch[1];

        // Check if there are authors
        const { authors: detectedAuthors } = splitAuthorsAndRest(step);
        if (!detectedAuthors) {
            // If there are no authors, keep year as-is (e.g. "Title. Journal, 6(8), (2025) 1020–1032")
            return step
                .replace(/,\s*,/g, ', ')
                .replace(/\.\s*\./g, '.')
                .replace(/\s+/g, ' ')
                .replace(/\s+([,.:;)])/g, '$1')
                .trim();
        }

        // 9. Match author block and rest
        const { authors, rest } = splitAuthorsAndRest(step);

        if (authors && rest) {
            let cleanAuthors = authors.trim().replace(/[\s,;&]+$/, '');
            if (/et\s+al\.?$/i.test(cleanAuthors)) {
                cleanAuthors = cleanAuthors.replace(/et\s+al\.?$/i, 'et al.');
            } else {
                cleanAuthors = cleanAuthors.replace(/[\s,;&.]+$|[\s,;&]+$/, '');
            }

            // Only remove the year from the rest if it was a standalone year in parentheses or preceded by comma/semicolon/in
            let cleanRest = rest.trim();
            cleanRest = cleanRest.replace(new RegExp(`[,;]?\\s*\\(${year}\\)`, 'i'), '');
            cleanRest = cleanRest.replace(new RegExp(`(?:[,;]\\s*|\\bin\\s+)\\b${year}\\b(?=[\\s,;.:]|$)`, 'i'), '');
            cleanRest = cleanRest.replace(/^[\s,.]+/, '');

            cleanRest = formatReferenceRest(cleanRest);

            step = `${cleanAuthors} (${year}). ${cleanRest}`;
        } else if (authors) {
            let cleanAuthors = authors.trim().replace(/[\s,;&]+$/, '');
            if (/et\s+al\.?$/i.test(cleanAuthors)) {
                cleanAuthors = cleanAuthors.replace(/et\s+al\.?$/i, 'et al.');
            } else {
                cleanAuthors = cleanAuthors.replace(/[\s,;&.]+$|[\s,;&]+$/, '');
            }
            step = `${cleanAuthors} (${year}).`;
        }

        // Final punctuation cleanup
        step = step
            .replace(/,\s*,/g, ', ')
            .replace(/\.\s*\./g, '.')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.:;)])/g, '$1')
            .trim();

        return step;
    });
};

/**
 * HELPER: Safely extracts inner XML markup of any Element preserving child formatting tags
 */
const getNodeInnerMarkup = (node: Element | null | undefined): string => {
    if (!node) return '';
    try {
        if (typeof XMLSerializer !== 'undefined') {
            const serializer = new XMLSerializer();
            let result = '';
            for (let i = 0; i < node.childNodes.length; i++) {
                result += serializer.serializeToString(node.childNodes[i]);
            }
            if (result) return result;
        }
    } catch {
        // Fallback
    }
    return (node as any).innerHTML || node.textContent || '';
};

/**
 * RECONSTRUCTS STRUCTURED REFERENCES (COMPREHENSIVE & LOSSLESS)
 * Preserves all authors, suffixes, degrees, collaborations, subtitles, translated titles,
 * books, chapters, editors, conferences, theses, patents, series, e-hosts, comments, URLs, DOIs, and pages.
 */
const reconstructStructuredReference = (content: string): string => {
    try {
        const wrapped = `<root xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:sb="http://www.elsevier.com/xml/common/struct-bib/dtd" xmlns:xlink="http://www.w3.org/1999/xlink">${content}</root>`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(wrapped, "text/xml");
        if (doc.getElementsByTagName("parsererror").length === 0) {
            // Authors
            const authorNodes = Array.from(doc.getElementsByTagName("sb:author")).concat(Array.from(doc.getElementsByTagName("ce:author")));
            const authorList: string[] = [];
            authorNodes.forEach(author => {
                const surname = author.getElementsByTagName("ce:surname")[0]?.textContent?.trim() || 
                                author.getElementsByTagName("sb:surname")[0]?.textContent?.trim() || "";
                const given = author.getElementsByTagName("ce:given-name")[0]?.textContent?.trim() || 
                              author.getElementsByTagName("sb:given-name")[0]?.textContent?.trim() || 
                              author.getElementsByTagName("ce:initials")[0]?.textContent?.trim() || 
                              author.getElementsByTagName("sb:initials")[0]?.textContent?.trim() || "";
                const suffix = author.getElementsByTagName("ce:suffix")[0]?.textContent?.trim() ||
                               author.getElementsByTagName("sb:suffix")[0]?.textContent?.trim() || "";
                const degrees = author.getElementsByTagName("ce:degrees")[0]?.textContent?.trim() ||
                                author.getElementsByTagName("sb:degrees")[0]?.textContent?.trim() || "";
                const indexed = author.getElementsByTagName("ce:indexed-name")[0]?.textContent?.trim() ||
                                author.getElementsByTagName("sb:indexed-name")[0]?.textContent?.trim() || "";

                let name = formatSingleAuthor(given, surname, suffix, degrees);
                if (!name && indexed) {
                    name = parseAndFormatAuthorString(indexed);
                }
                if (name && !authorList.includes(name)) {
                    authorList.push(name);
                }
            });

            // Collaboration / corporate author
            const collabNodes = Array.from(doc.getElementsByTagName("sb:collaboration")).concat(Array.from(doc.getElementsByTagName("ce:collaboration")));
            collabNodes.forEach(c => {
                const text = c.getElementsByTagName("ce:text")[0]?.textContent?.trim() || c.textContent?.trim();
                if (text && !authorList.includes(text)) authorList.push(text);
            });

            // Check et-al
            const hasEtAl = doc.getElementsByTagName("sb:et-al").length > 0 || doc.getElementsByTagName("ce:et-al").length > 0;
            let authorsStr = joinAuthorList(hasEtAl ? [...authorList, 'et al.'] : authorList);

            // Contribution Title
            const contNode = doc.getElementsByTagName("sb:contribution")[0] || doc.getElementsByTagName("ce:contribution")[0];
            let mainTitleXml = "";
            let hasContributionTitle = false;

            if (contNode) {
                const mainTitleNode = contNode.getElementsByTagName("sb:maintitle")[0] || contNode.getElementsByTagName("ce:maintitle")[0] || contNode.getElementsByTagName("sb:title")[0] || contNode.getElementsByTagName("ce:title")[0];
                if (mainTitleNode) {
                    mainTitleXml = getNodeInnerMarkup(mainTitleNode).trim();
                    hasContributionTitle = true;
                }

                const subTitleNode = contNode.getElementsByTagName("sb:subtitle")[0] || contNode.getElementsByTagName("ce:subtitle")[0];
                if (subTitleNode) {
                    const subTitleXml = getNodeInnerMarkup(subTitleNode).trim();
                    if (subTitleXml) {
                        mainTitleXml = mainTitleXml ? `${mainTitleXml}: ${subTitleXml}` : subTitleXml;
                    }
                }

                const transTitleNode = contNode.getElementsByTagName("sb:translated-title")[0] || contNode.getElementsByTagName("ce:translated-title")[0];
                if (transTitleNode) {
                    const transTitleXml = getNodeInnerMarkup(transTitleNode).trim();
                    if (transTitleXml) {
                        mainTitleXml = mainTitleXml ? `${mainTitleXml} [${transTitleXml}]` : `[${transTitleXml}]`;
                    }
                }
            }

            // Host Containers (Journal, Book, Conference, Series, Thesis, Patent, E-Host)
            const hostNodes = Array.from(doc.getElementsByTagName("sb:host"))
                .concat(Array.from(doc.getElementsByTagName("ce:host")))
                .concat(Array.from(doc.getElementsByTagName("sb:e-host")))
                .concat(Array.from(doc.getElementsByTagName("ce:e-host")));

            let hostTitleXml = "";
            let year = "";
            let volume = "";
            let issue = "";
            let pages = "";
            let articleNum = "";
            let edition = "";
            let publisherName = "";
            let publisherLoc = "";
            let conferenceXml = "";
            let degree = "";
            let institution = "";
            let patentNumber = "";
            let patentCountry = "";
            const editors: string[] = [];
            const urls: string[] = [];
            const dois: string[] = [];
            let dateAccessed = "";

            hostNodes.forEach(host => {
                // Title / Series Title / Book Title
                if (!hostTitleXml) {
                    const bookNode = host.getElementsByTagName("sb:book")[0] || host.getElementsByTagName("ce:book")[0];
                    const seriesNode = host.getElementsByTagName("sb:series")[0] || host.getElementsByTagName("ce:series")[0];
                    
                    let foundTitleNode = null;
                    if (bookNode) {
                        foundTitleNode = bookNode.getElementsByTagName("sb:maintitle")[0] || bookNode.getElementsByTagName("ce:maintitle")[0] || bookNode.getElementsByTagName("sb:title")[0];
                    } else if (seriesNode) {
                        foundTitleNode = seriesNode.getElementsByTagName("sb:maintitle")[0] || seriesNode.getElementsByTagName("ce:maintitle")[0] || seriesNode.getElementsByTagName("sb:title")[0];
                    } else {
                        foundTitleNode = host.getElementsByTagName("sb:maintitle")[0] || host.getElementsByTagName("ce:maintitle")[0] || host.getElementsByTagName("sb:title")[0] || host.getElementsByTagName("ce:title")[0];
                    }

                    if (foundTitleNode) {
                        let extractedTitle = getNodeInnerMarkup(foundTitleNode).trim();
                        const hostSubTitle = host.getElementsByTagName("sb:subtitle")[0] || host.getElementsByTagName("ce:subtitle")[0];
                        if (hostSubTitle) {
                            const sub = getNodeInnerMarkup(hostSubTitle).trim();
                            if (sub) extractedTitle += `: ${sub}`;
                        }

                        if (hasContributionTitle) {
                            if (!hostTitleXml) hostTitleXml = extractedTitle;
                        } else {
                            // For standalone works without a contribution, the host title is the main work title
                            if (!mainTitleXml) mainTitleXml = extractedTitle;
                        }
                    }
                }

                // Conference
                const confNode = host.getElementsByTagName("sb:conference")[0] || host.getElementsByTagName("ce:conference")[0];
                if (confNode && !conferenceXml) {
                    conferenceXml = getNodeInnerMarkup(confNode).trim() || confNode.textContent?.trim() || "";
                }

                // Book Edition
                if (!edition) {
                    const edNode = host.getElementsByTagName("sb:edition")[0] || host.getElementsByTagName("ce:edition")[0];
                    if (edNode) edition = edNode.textContent?.trim() || "";
                }

                // Publisher
                const pubNode = host.getElementsByTagName("sb:publisher")[0] || host.getElementsByTagName("ce:publisher")[0];
                if (pubNode) {
                    if (!publisherName) publisherName = pubNode.getElementsByTagName("sb:name")[0]?.textContent?.trim() || pubNode.getElementsByTagName("ce:name")[0]?.textContent?.trim() || "";
                    if (!publisherLoc) publisherLoc = pubNode.getElementsByTagName("sb:location")[0]?.textContent?.trim() || pubNode.getElementsByTagName("ce:location")[0]?.textContent?.trim() || "";
                }

                // Thesis
                const thesisNode = host.getElementsByTagName("sb:thesis")[0] || host.getElementsByTagName("ce:thesis")[0];
                if (thesisNode) {
                    if (!degree) degree = thesisNode.getElementsByTagName("sb:degree")[0]?.textContent?.trim() || thesisNode.getElementsByTagName("ce:degree")[0]?.textContent?.trim() || "";
                    if (!institution) institution = thesisNode.getElementsByTagName("sb:institution")[0]?.textContent?.trim() || thesisNode.getElementsByTagName("ce:institution")[0]?.textContent?.trim() || "";
                }

                // Patent
                const patentNode = host.getElementsByTagName("sb:patent")[0] || host.getElementsByTagName("ce:patent")[0];
                if (patentNode) {
                    if (!patentNumber) patentNumber = patentNode.getElementsByTagName("sb:patent-number")[0]?.textContent?.trim() || patentNode.getElementsByTagName("ce:patent-number")[0]?.textContent?.trim() || "";
                    if (!patentCountry) patentCountry = patentNode.getElementsByTagName("sb:patent-country")[0]?.textContent?.trim() || patentNode.getElementsByTagName("ce:patent-country")[0]?.textContent?.trim() || "";
                }

                // Editors
                const edNodes = Array.from(host.getElementsByTagName("sb:editor")).concat(Array.from(host.getElementsByTagName("ce:editor")));
                edNodes.forEach(ed => {
                    const surname = ed.getElementsByTagName("ce:surname")[0]?.textContent?.trim() || ed.getElementsByTagName("sb:surname")[0]?.textContent?.trim() || "";
                    const given = ed.getElementsByTagName("ce:given-name")[0]?.textContent?.trim() || ed.getElementsByTagName("sb:given-name")[0]?.textContent?.trim() || ed.getElementsByTagName("ce:initials")[0]?.textContent?.trim() || "";
                    const suffix = ed.getElementsByTagName("ce:suffix")[0]?.textContent?.trim() || ed.getElementsByTagName("sb:suffix")[0]?.textContent?.trim() || "";
                    let edName = formatSingleAuthor(given, surname, suffix);
                    if (edName && !editors.includes(edName)) editors.push(edName.trim());
                });

                // Date / Year
                if (!year) {
                    const dateNode = host.getElementsByTagName("sb:date")[0] || host.getElementsByTagName("ce:date")[0];
                    if (dateNode) year = dateNode.textContent?.trim() || "";
                }

                // Volume
                if (!volume) {
                    const volNode = host.getElementsByTagName("sb:volume-nr")[0] || host.getElementsByTagName("ce:volume-nr")[0];
                    if (volNode) volume = volNode.textContent?.trim() || "";
                }

                // Issue
                if (!issue) {
                    const issueNode = host.getElementsByTagName("sb:issue-nr")[0] || host.getElementsByTagName("ce:issue-nr")[0];
                    if (issueNode) issue = issueNode.textContent?.trim() || "";
                }

                // Pages
                if (!pages) {
                    const pagesNode = host.getElementsByTagName("sb:pages")[0] || host.getElementsByTagName("ce:pages")[0];
                    const firstPage = host.getElementsByTagName("sb:first-page")[0]?.textContent?.trim() || host.getElementsByTagName("ce:first-page")[0]?.textContent?.trim() || "";
                    const lastPage = host.getElementsByTagName("sb:last-page")[0]?.textContent?.trim() || host.getElementsByTagName("ce:last-page")[0]?.textContent?.trim() || "";
                    if (firstPage && lastPage) {
                        pages = `${firstPage}–${lastPage}`;
                    } else if (pagesNode) {
                        const innerFirst = pagesNode.getElementsByTagName("sb:first-page")[0]?.textContent?.trim() || pagesNode.getElementsByTagName("ce:first-page")[0]?.textContent?.trim() || "";
                        const innerLast = pagesNode.getElementsByTagName("sb:last-page")[0]?.textContent?.trim() || pagesNode.getElementsByTagName("ce:last-page")[0]?.textContent?.trim() || "";
                        if (innerFirst && innerLast) {
                            pages = `${innerFirst}–${innerLast}`;
                        } else if (innerFirst) {
                            pages = innerFirst;
                        } else {
                            let rawPages = pagesNode.textContent?.trim() || "";
                            rawPages = rawPages.replace(/(\b\d+)\s*[-–—]\s*(\d+\b)/g, '$1–$2');
                            pages = rawPages;
                        }
                    } else if (firstPage) {
                        pages = firstPage;
                    }
                }

                // Article Number
                if (!articleNum) {
                    const artNode = host.getElementsByTagName("sb:article-number")[0] || host.getElementsByTagName("ce:article-number")[0];
                    if (artNode) articleNum = artNode.textContent?.trim() || "";
                }

                // Inter-refs / URLs
                const interRefs = Array.from(host.getElementsByTagName("ce:inter-ref")).concat(Array.from(host.getElementsByTagName("sb:inter-ref")));
                interRefs.forEach(ir => {
                    const href = ir.getAttribute("xlink:href") || ir.textContent?.trim() || "";
                    if (href && !urls.includes(href)) urls.push(href);
                });

                const eAddrs = Array.from(host.getElementsByTagName("ce:e-address")).concat(Array.from(host.getElementsByTagName("sb:e-address")));
                eAddrs.forEach(ea => {
                    const href = ea.textContent?.trim() || ea.getAttribute("xlink:href") || "";
                    if (href && !urls.includes(href)) urls.push(href);
                });

                // Date accessed
                if (!dateAccessed) {
                    const daNode = host.getElementsByTagName("sb:date-accessed")[0] || host.getElementsByTagName("ce:date-accessed")[0];
                    if (daNode) {
                        const day = daNode.getAttribute("day");
                        const month = daNode.getAttribute("month");
                        const yearVal = daNode.getAttribute("year");
                        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                        let monthStr = month || "";
                        if (month && !isNaN(parseInt(month))) {
                            const mIdx = parseInt(month) - 1;
                            if (mIdx >= 0 && mIdx < 12) monthStr = monthNames[mIdx];
                        }
                        const fullDate = [day, monthStr, yearVal].filter(Boolean).join(" ");
                        dateAccessed = fullDate || daNode.textContent?.trim() || "";
                    }
                }
            });

            // Fallback for date directly under sb:reference
            if (!year) {
                const dateNode = doc.getElementsByTagName("sb:date")[0] || doc.getElementsByTagName("ce:date")[0];
                if (dateNode) year = dateNode.textContent?.trim() || "";
            }

            // DOIs across doc
            const doiNodes = Array.from(doc.getElementsByTagName("ce:doi")).concat(Array.from(doc.getElementsByTagName("sb:doi")));
            doiNodes.forEach(d => {
                const doiText = d.textContent?.trim();
                if (doiText && !dois.includes(doiText)) dois.push(doiText);
            });

            // Comments / Notes across doc
            const commentNodes = Array.from(doc.getElementsByTagName("sb:comment"))
                .concat(Array.from(doc.getElementsByTagName("ce:comment")))
                .concat(Array.from(doc.getElementsByTagName("sb:note")))
                .concat(Array.from(doc.getElementsByTagName("ce:note")));
            const comments: string[] = [];
            commentNodes.forEach(cm => {
                const txt = cm.textContent?.trim();
                if (txt && !comments.includes(txt)) comments.push(txt);
            });

            const isJournal = !!(
                doc.getElementsByTagName("sb:issue")[0] || 
                doc.getElementsByTagName("ce:issue")[0] || 
                doc.getElementsByTagName("sb:series")[0]
            );
            const isBook = !!(
                doc.getElementsByTagName("sb:book")[0] || 
                doc.getElementsByTagName("ce:book")[0]
            );
            const isConference = !!(
                conferenceXml || 
                doc.getElementsByTagName("sb:conference")[0] || 
                doc.getElementsByTagName("ce:conference")[0]
            );
            const isReferenceWork = !!(
                doc.getElementsByTagName("sb:reference-work")[0] || 
                doc.getElementsByTagName("ce:reference-work")[0]
            );

            const containerTitle = hostTitleXml || conferenceXml;

            // Container publication: Is the cited item a PART of another publication?
            // If yes -> "In:" is used (Book chapter, Conference paper, Encyclopedia entry, Reference-work entry)
            // If no -> "In:" is NOT used (Complete book, Journal article, Thesis, Report, Conference proceedings as a whole)
            const isPartInsideContainer = hasContributionTitle && !!containerTitle && !isJournal && !degree && !institution;

            // Casing rules:
            if (isPartInsideContainer) {
                // Chapter title -> sentence case (e.g. "Network psychometrics")
                if (mainTitleXml) mainTitleXml = toSentenceCase(mainTitleXml);
                // Container book title -> Title Case (e.g. "The Wiley Handbook of Psychometric Testing...")
                if (hostTitleXml) hostTitleXml = toTitleCase(hostTitleXml);
            } else if ((isBook || !!publisherName) && !isJournal) {
                // Standalone complete book -> Title Case (e.g. "Statistical Power Analysis for the Behavioral Sciences")
                if (mainTitleXml) mainTitleXml = toTitleCase(mainTitleXml);
            } else if (isJournal) {
                // Journal article -> sentence case for article title, Title Case for journal
                if (mainTitleXml) mainTitleXml = toSentenceCase(mainTitleXml);
                if (hostTitleXml) hostTitleXml = toTitleCase(hostTitleXml);
            }

            // Construct reference string
            let res = "";
            if (authorsStr) {
                if (year) {
                    res += `${authorsStr} (${year}). `;
                } else {
                    res += `${authorsStr}. `;
                }
                if (mainTitleXml) {
                    res += `${mainTitleXml.trim()}${mainTitleXml.trim().endsWith('.') ? '' : '.'} `;
                }
            } else if (editors.length > 0 && !mainTitleXml) {
                const edLabel = editors.length > 1 ? "Eds." : "Ed.";
                if (year) {
                    res += `${joinAuthorList(editors)} (${edLabel}) (${year}). `;
                } else {
                    res += `${joinAuthorList(editors)} (${edLabel}). `;
                }
            } else if (mainTitleXml) {
                // When NO authors, start with Title followed by period
                const cleanTitle = mainTitleXml.trim().replace(/[\s,.]*$/, '');
                res += `${cleanTitle}. `;
            }

            if (isPartInsideContainer && !res.includes('In:')) {
                if (res.trim().endsWith('.')) {
                    res = res.trim() + ' In: ';
                } else if (!res.trim().endsWith(',')) {
                    res = res.trim() + ', In: ';
                } else {
                    res = res.trim() + ' In: ';
                }

                if (editors.length > 0) {
                    const edLabel = editors.length > 1 ? "Eds." : "Ed.";
                    res += `${joinAuthorList(editors)} (${edLabel}), `;
                }
            }

            if (conferenceXml) {
                res += `${conferenceXml}. `;
            }

            if (hostTitleXml) {
                let formattedHost = hostTitleXml.trim();
                if (!formattedHost.includes('<ce:italic>') && !formattedHost.includes('<i>') && !formattedHost.includes('<italic>')) {
                    formattedHost = `<ce:italic>${formattedHost}</ce:italic>`;
                }
                res += formattedHost;
            }

            if (edition) {
                res += `, ${edition}`;
            }

            let volIssuePart = "";
            if (volume) {
                volIssuePart += `<b>${volume}</b>`;
                if (issue) volIssuePart += `(${issue})`;
            } else if (issue) {
                volIssuePart += `(${issue})`;
            }

            const pageOrArt = pages || articleNum;
            const formattedPublisher = formatPublisherName(publisherName);
            const pubStr = [formattedPublisher, publisherLoc].filter(Boolean).join(', ');

            if (pubStr) {
                // Book or Book Chapter with publisher:
                // Order: Publisher, Pages (e.g. "Springer Publishing Company." or "Springer Publishing Company, 587–603.")
                if (volIssuePart) {
                    res += `, ${volIssuePart}`;
                }
                if (!res.trim().endsWith('.')) {
                    res = res.trim().replace(/[,:]$/, '') + '. ';
                } else {
                    res = res.trim() + ' ';
                }
                res += pubStr;
                if (pageOrArt) {
                    res += `, ${pageOrArt}`;
                }
            } else {
                // Journal / Host without publisher:
                // Order: Volume, Pages separated by comma (e.g. "10, 598", "14(1), 310–331")
                let volPagesCombined = "";
                if (volIssuePart && pageOrArt) {
                    volPagesCombined = `${volIssuePart}, ${pageOrArt}`;
                } else if (volIssuePart) {
                    volPagesCombined = volIssuePart;
                } else if (pageOrArt) {
                    volPagesCombined = pageOrArt;
                }

                if (!authorsStr && year && !res.includes(`(${year})`)) {
                    volPagesCombined = volPagesCombined ? `${volPagesCombined}, (${year})` : `(${year})`;
                }

                if (volPagesCombined) {
                    res += (hostTitleXml ? `, ${volPagesCombined}` : volPagesCombined);
                }
            }

            if (degree || institution) {
                const thesisInfo = [degree ? `[${degree}]` : '', institution].filter(Boolean).join(', ');
                res += `, ${thesisInfo}`;
            }

            if (patentNumber || patentCountry) {
                const patInfo = [patentCountry, patentNumber].filter(Boolean).join(' ');
                res += `, ${patInfo}`;
            }

            if (comments.length > 0) {
                comments.forEach(cm => {
                    if (!res.trim().endsWith('.') && !res.trim().endsWith(',')) res += '.';
                    res += ` ${cm}`;
                });
            }

            if (urls.length > 0) {
                urls.forEach(u => {
                    res += `, ${u}`;
                });
            }

            if (dois.length > 0) {
                dois.forEach(d => {
                    const cleanDoi = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '').trim();
                    res += `, https://doi.org/${cleanDoi}`;
                });
            }

            if (dateAccessed) {
                res += ` (accessed ${dateAccessed})`;
            }

            if (res.trim()) return res.trim();
        }
    } catch (e) {
        console.warn("DOM-based reconstruct fallback:", e);
    }

    // Regex Fallback (when DOM parser fails)
    const authorMatches: string[] = [];
    const authorRegex = /<s[be]:author\b[^>]*>([\s\S]*?)<\/s[be]:author>/gi;
    let aMatch;
    while ((aMatch = authorRegex.exec(content)) !== null) {
        const authorXml = aMatch[1];
        const surnameMatch = authorXml.match(/<c[be]:surname\b[^>]*>([\s\S]*?)<\/c[be]:surname>/i);
        const givenMatch = authorXml.match(/<c[be]:given-name\b[^>]*>([\s\S]*?)<\/c[be]:given-name>/i) ||
                           authorXml.match(/<c[be]:initials\b[^>]*>([\s\S]*?)<\/c[be]:initials>/i);
        const suffixMatch = authorXml.match(/<c[be]:suffix\b[^>]*>([\s\S]*?)<\/c[be]:suffix>/i);
        const surname = surnameMatch ? surnameMatch[1].trim() : '';
        const given = givenMatch ? givenMatch[1].trim() : '';
        const suffix = suffixMatch ? suffixMatch[1].trim() : '';
        
        let aName = formatSingleAuthor(given, surname, suffix);
        if (aName) authorMatches.push(aName);
    }

    const hasEtAl = /<s[be]:et-al\b/i.test(content) || /<c[be]:et-al\b/i.test(content);
    let authorsStr = joinAuthorList(hasEtAl ? [...authorMatches, 'et al.'] : authorMatches);

    // Main Title & Subtitle vs Host Container Title
    const contributionMatch = content.match(/<s[be]:contribution\b[^>]*>([\s\S]*?)<\/s[be]:contribution>/i) ||
                              content.match(/<ce:contribution\b[^>]*>([\s\S]*?)<\/ce:contribution>/i);
    const hostMatch = content.match(/<s[be]:host\b[^>]*>([\s\S]*?)<\/s[be]:host>/i) ||
                      content.match(/<ce:host\b[^>]*>([\s\S]*?)<\/ce:host>/i);

    let titleStr = '';
    let journalStr = '';
    const hasContributionTitle = !!contributionMatch;

    if (contributionMatch) {
        const cContent = contributionMatch[1];
        const tMatch = cContent.match(/<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i) ||
                       cContent.match(/<c[be]:title\b[^>]*>([\s\S]*?)<\/c[be]:title>/i);
        const subMatch = cContent.match(/<s[be]:subtitle\b[^>]*>([\s\S]*?)<\/s[be]:subtitle>/i);
        if (tMatch) titleStr = tMatch[1].trim();
        if (titleStr && subMatch) titleStr += `: ${subMatch[1].trim()}`;

        if (hostMatch) {
            const hContent = hostMatch[1];
            const jMatch = hContent.match(/<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i) ||
                           hContent.match(/<s[be]:series\b[^>]*>[\s\S]*?<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i) ||
                           hContent.match(/<c[be]:title\b[^>]*>([\s\S]*?)<\/c[be]:title>/i);
            if (jMatch) journalStr = jMatch[1].trim();
        }
    } else {
        // Standalone work (complete book, thesis, report, conference proceedings as a whole)
        if (hostMatch) {
            const hContent = hostMatch[1];
            const tMatch = hContent.match(/<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i) ||
                           hContent.match(/<s[be]:series\b[^>]*>[\s\S]*?<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i) ||
                           hContent.match(/<c[be]:title\b[^>]*>([\s\S]*?)<\/c[be]:title>/i);
            const subMatch = hContent.match(/<s[be]:subtitle\b[^>]*>([\s\S]*?)<\/s[be]:subtitle>/i);
            if (tMatch) titleStr = tMatch[1].trim();
            if (titleStr && subMatch) titleStr += `: ${subMatch[1].trim()}`;
        } else {
            const tMatch = content.match(/<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i);
            if (tMatch) titleStr = tMatch[1].trim();
        }
        journalStr = '';
    }

    // Volume, Issue, Date, Pages, Article Number, DOI, Publisher, Comment
    const volMatch = content.match(/<s[be]:volume(?:-nr)?\b[^>]*>([\s\S]*?)<\/s[be]:volume(?:-nr)?>/i) ||
                     content.match(/<c[be]:volume(?:-nr)?\b[^>]*>([\s\S]*?)<\/c[be]:volume(?:-nr)?>/i) ||
                     content.match(/<volume(?:-nr)?\b[^>]*>([\s\S]*?)<\/volume(?:-nr)?>/i);
    const issueMatch = content.match(/<s[be]:issue-nr\b[^>]*>([\s\S]*?)<\/s[be]:issue-nr>/i);
    const dateMatch = content.match(/<s[be]:date\b[^>]*>([\s\S]*?)<\/s[be]:date>/i);
    const pagesMatch = content.match(/<s[be]:first-page\b[^>]*>([\s\S]*?)<\/s[be]:first-page>/i) ||
                       content.match(/<s[be]:pages\b[^>]*>([\s\S]*?)<\/s[be]:pages>/i);
    const lastPageMatch = content.match(/<s[be]:last-page\b[^>]*>([\s\S]*?)<\/s[be]:last-page>/i);
    const artNumMatch = content.match(/<s[be]:article-number\b[^>]*>([\s\S]*?)<\/s[be]:article-number>/i) ||
                        content.match(/<ce:article-number\b[^>]*>([\s\S]*?)<\/ce:article-number>/i);
    const doiMatch = content.match(/<ce:doi\b[^>]*>([\s\S]*?)<\/ce:doi>/i);
    const pubNameMatch = content.match(/<s[be]:publisher\b[^>]*>[\s\S]*?<s[be]:name\b[^>]*>([\s\S]*?)<\/s[be]:name>/i);
    const pubLocMatch = content.match(/<s[be]:publisher\b[^>]*>[\s\S]*?<s[be]:location\b[^>]*>([\s\S]*?)<\/s[be]:location>/i);
    const commentMatch = content.match(/<s[be]:comment\b[^>]*>([\s\S]*?)<\/s[be]:comment>/i);

    const vol = volMatch ? volMatch[1].trim() : '';
    const issue = issueMatch ? issueMatch[1].trim() : '';
    const date = dateMatch ? dateMatch[1].trim() : '';
    let pages = pagesMatch ? pagesMatch[1].trim() : '';
    if (pages && lastPageMatch && !pages.includes('–') && !pages.includes('-')) {
        const lp = lastPageMatch[1].trim();
        if (lp && lp !== pages) {
            pages += `–${lp}`;
        }
    }
    const artNum = artNumMatch ? artNumMatch[1].trim() : '';
    const doi = doiMatch ? doiMatch[1].trim() : '';
    const pubName = pubNameMatch ? pubNameMatch[1].trim() : '';
    const pubLoc = pubLocMatch ? pubLocMatch[1].trim() : '';
    const comment = commentMatch ? commentMatch[1].trim() : '';

    let result = '';

    const isJournal = !!content.match(/<s[be]:issue-nr\b|<ce:issue-nr\b|<s[be]:series\b/i);
    const isBook = !!content.match(/<s[be]:book\b|<ce:book\b/i);
    const isConference = !!content.match(/<s[be]:conference\b|<ce:conference\b/i);
    const isReferenceWork = !!content.match(/<s[be]:reference-work\b|<ce:reference-work\b/i);

    // Is the cited item a PART of another publication?
    // Requires that a container title (journalStr) exists, has contribution, and is not a journal
    const isPartInsideContainer = hasContributionTitle && !!journalStr && !isJournal;

    // Casing rules:
    if (isPartInsideContainer) {
        if (titleStr) titleStr = toSentenceCase(titleStr);
        if (journalStr) journalStr = toTitleCase(journalStr);
    } else if ((isBook || !!pubName) && !isJournal) {
        if (titleStr) titleStr = toTitleCase(titleStr);
    } else if (isJournal) {
        if (titleStr) titleStr = toSentenceCase(titleStr);
        if (journalStr) journalStr = toTitleCase(journalStr);
    }

    // 1. Authors & Year / Title
    if (authorsStr) {
        if (date) {
            result += `${authorsStr} (${date}). `;
        } else {
            result += `${authorsStr}. `;
        }
        if (titleStr) {
            result += `${titleStr}. `;
        }
    } else if (titleStr) {
        const cleanTitle = titleStr.replace(/[\s,.]*$/, '');
        result += `${cleanTitle}. `;
    }

    if (isPartInsideContainer && !result.includes('In:')) {
        if (result.trim().endsWith('.')) {
            result = result.trim() + ' In: ';
        } else if (!result.trim().endsWith(',')) {
            result = result.trim() + ', In: ';
        } else {
            result = result.trim() + ' In: ';
        }
    }

    // 2. Journal, Volume(Issue) Pages
    let hostStr = '';
    if (journalStr) {
        if (!journalStr.includes('<ce:italic>') && !journalStr.includes('<i>') && !journalStr.includes('<italic>')) {
            hostStr += `<ce:italic>${journalStr}</ce:italic>`;
        } else {
            hostStr += journalStr;
        }
    }

    let volIssuePart = '';
    if (vol) {
        volIssuePart += `<b>${vol}</b>`;
        if (issue) {
            volIssuePart += `(${issue})`;
        }
    } else if (issue) {
        volIssuePart += `(${issue})`;
    }

    const pageOrArt = pages || artNum;
    const formattedPubName = formatPublisherName(pubName);
    const pStr = [formattedPubName, pubLoc].filter(Boolean).join(', ');

    if (pStr) {
        // Book or Book Chapter with publisher:
        if (volIssuePart) {
            hostStr += hostStr ? `, ${volIssuePart}` : volIssuePart;
        }
        if (hostStr) {
            if (!hostStr.trim().endsWith('.')) {
                hostStr = hostStr.trim().replace(/[,:]$/, '') + '. ';
            } else {
                hostStr = hostStr.trim() + ' ';
            }
        }
        hostStr += pStr;
        if (pageOrArt) {
            hostStr += `, ${pageOrArt}`;
        }
    } else {
        // Journal / Host without publisher:
        let volPagesCombined = '';
        if (volIssuePart && pageOrArt) {
            volPagesCombined = `${volIssuePart}, ${pageOrArt}`;
        } else if (volIssuePart) {
            volPagesCombined = volIssuePart;
        } else if (pageOrArt) {
            volPagesCombined = pageOrArt;
        }

        if (!authorsStr && date) {
            volPagesCombined = volPagesCombined ? `${volPagesCombined}, (${date})` : `(${date})`;
        }

        if (volPagesCombined) {
            hostStr += hostStr ? `, ${volPagesCombined}` : volPagesCombined;
        }
    }

    if (hostStr.trim()) result += hostStr.trim();
    if (comment) result += `. ${comment}`;
    if (doi) {
        const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '').trim();
        result += `, https://doi.org/${cleanDoi}`;
    }

    return result.trim();
};

const ReferenceExtractor: React.FC = () => {
    const [input, setInput] = useState('');
    const [results, setResults] = useState<ExtractedRef[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [step, setStep] = useState<'input' | 'report'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

    // Filter and view controls
    const [searchQuery, setSearchQuery] = useState('');
    const [filterFormat, setFilterFormat] = useState<'all' | 'sup' | 'sub' | 'italic' | 'bold'>('all');
    const [viewMode, setViewMode] = useState<'rich' | 'code'>('rich');
    const [includeLabel, setIncludeLabel] = useState(false);

    const runExtraction = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const found: ExtractedRef[] = [];
                
                // Match <ce:bib-reference> entries with any attribute spacing or quotes
                const bibRegex = /<(?:ce:)?bib-reference\b([^>]*)>([\s\S]*?)<\/(?:ce:)?bib-reference>/gi;
                let match;
                let refIndex = 1;
                
                while ((match = bibRegex.exec(input)) !== null) {
                    const attrs = match[1];
                    const content = match[2];

                    // Extract id from attributes (supports double, single, or unquoted)
                    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
                    const id = idMatch ? idMatch[1].trim() : `ref-${refIndex}`;
                    
                    // Extract label (numeric or author-year: e.g. [1], 1., [Smith et al., 2020])
                    const labelMatch = content.match(/<ce:label\b[^>]*>([\s\S]*?)<\/ce:label>/i);
                    const rawLabel = labelMatch ? labelMatch[1].trim() : '';
                    
                    // Format label safely with superscript preservation if present
                    const formattedLabel = convertXmlTagsToHtml(rawLabel)
                        .replace(/<(?!\/?(?:i|b|sup|sub|u|span)\b)[^>]+>/gi, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    // Keep any non-empty label without discarding alphanumeric or author-year labels!
                    const displayLabel = formattedLabel;

                    // USER MANDATE: Information within <ce:source-text> is completely disregarded!
                    const cleanedContent = content.replace(/<ce:source-text\b[^>]*>[\s\S]*?<\/ce:source-text>/gi, '');

                    let bestSourceXml = '';
                    let sourceType: 'other-ref' | 'structured' | 'fallback' = 'fallback';

                    // Priority 1: Structured XML (<sb:reference> or <ce:reference>)
                    const structuredMatch = cleanedContent.match(/<(?:sb|ce):reference[^>]*>([\s\S]*?)<\/(?:sb|ce):reference>/i);
                    // Priority 2: ce:other-ref
                    const otherRefMatch = cleanedContent.match(/<ce:other-ref[^>]*>([\s\S]*?)<\/ce:other-ref>/i);

                    if (structuredMatch) {
                        const reconstructed = reconstructStructuredReference(structuredMatch[1]);
                        if (reconstructed && reconstructed.length > 5) {
                            bestSourceXml = reconstructed;
                            sourceType = 'structured';
                        } else if (otherRefMatch) {
                            bestSourceXml = otherRefMatch[1].replace(/<ce:label\b[^>]*>[\s\S]*?<\/ce:label>/gi, '').trim();
                            sourceType = 'other-ref';
                        } else {
                            bestSourceXml = structuredMatch[1];
                            sourceType = 'structured';
                        }
                    } else if (otherRefMatch) {
                        bestSourceXml = otherRefMatch[1].replace(/<ce:label\b[^>]*>[\s\S]*?<\/ce:label>/gi, '').trim();
                        sourceType = 'other-ref';
                    } else {
                        // Fallback: Strip <ce:label> (ce:source-text already disregarded)
                        bestSourceXml = cleanedContent
                            .replace(/<ce:label\b[^>]*>[\s\S]*?<\/ce:label>/gi, '')
                            .trim();
                        sourceType = 'fallback';
                    }

                    // Run Sanitizer to produce clean HTML formatted text
                    const formattedHtml = sanitizeFormattedHtml(bestSourceXml);

                    // Create Plain Text raw version
                    const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
                    let cleanRaw = '';
                    if (tempDiv) {
                        tempDiv.innerHTML = formattedHtml;
                        cleanRaw = tempDiv.textContent || tempDiv.innerText || '';
                    } else {
                        cleanRaw = formattedHtml.replace(/<[^>]+>/g, '');
                    }

                    // Detect formatting presence flags
                    const hasSuperscript = /<sup>/i.test(formattedHtml);
                    const hasSubscript = /<sub>/i.test(formattedHtml);
                    const hasItalic = /<i>/i.test(formattedHtml);
                    const hasBold = /<b>/i.test(formattedHtml);
                    const hasSmallCaps = /small-caps/i.test(formattedHtml);
                    const hasUnderline = /<u>/i.test(formattedHtml);

                    found.push({
                        id,
                        label: displayLabel,
                        rawText: cleanRaw,
                        formattedHtml,
                        sourceType,
                        hasSuperscript,
                        hasSubscript,
                        hasItalic,
                        hasBold,
                        hasSmallCaps,
                        hasUnderline
                    });

                    refIndex++;
                }

                // Direct element fallback if user pasted bare <ce:other-ref> or <sb:reference> without <ce:bib-reference> wrapper
                if (found.length === 0) {
                    const directRefRegex = /<(?:ce:other-ref|sb:reference)\b([^>]*)>([\s\S]*?)<\/(?:ce:other-ref|sb:reference)>/gi;
                    let directMatch;
                    let directIndex = 1;
                    while ((directMatch = directRefRegex.exec(input)) !== null) {
                        const attrs = directMatch[1];
                        const content = directMatch[2];
                        const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
                        const id = idMatch ? idMatch[1].trim() : `ref-${directIndex}`;

                        // Disregard any nested source-text inside content
                        const cleanedDirect = content.replace(/<ce:source-text\b[^>]*>[\s\S]*?<\/ce:source-text>/gi, '');

                        let bestSourceXml = '';
                        let sourceType: 'other-ref' | 'structured' | 'fallback' = 'other-ref';
                        if (directMatch[0].startsWith('<sb:reference') || directMatch[0].startsWith('<ce:reference')) {
                            bestSourceXml = reconstructStructuredReference(cleanedDirect);
                            sourceType = 'structured';
                        } else {
                            bestSourceXml = cleanedDirect.replace(/<ce:label\b[^>]*>[\s\S]*?<\/ce:label>/gi, '').trim();
                            sourceType = 'other-ref';
                        }

                        const formattedHtml = sanitizeFormattedHtml(bestSourceXml);
                        const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
                        let cleanRaw = '';
                        if (tempDiv) {
                            tempDiv.innerHTML = formattedHtml;
                            cleanRaw = tempDiv.textContent || tempDiv.innerText || '';
                        } else {
                            cleanRaw = formattedHtml.replace(/<[^>]+>/g, '');
                        }

                        found.push({
                            id,
                            label: '',
                            rawText: cleanRaw,
                            formattedHtml,
                            sourceType,
                            hasSuperscript: /<sup>/i.test(formattedHtml),
                            hasSubscript: /<sub>/i.test(formattedHtml),
                            hasItalic: /<i>/i.test(formattedHtml),
                            hasBold: /<b>/i.test(formattedHtml),
                            hasSmallCaps: /small-caps/i.test(formattedHtml),
                            hasUnderline: /<u>/i.test(formattedHtml)
                        });
                        directIndex++;
                    }
                }

                if (found.length === 0) {
                    setToast({ msg: "No bibliography items detected in input XML.", type: "info" });
                    setIsLoading(false);
                } else {
                    setResults(found);
                    setSelectedIndices(new Set(found.map((_, i) => i)));
                    setStep('report');
                    setToast({ msg: `Extracted ${found.length} bibliography item(s) with total data fidelity!`, type: "success" });
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("Extraction error:", err);
                setToast({ msg: "Extraction error encountered. Please check XML syntax.", type: "error" });
                setIsLoading(false);
            }
        }, 300);
    };

    const toggleIndex = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    const toggleAll = () => {
        if (selectedIndices.size === results.length) setSelectedIndices(new Set());
        else setSelectedIndices(new Set(results.map((_, i) => i)));
    };

    const copyToClipboard = async (items: ExtractedRef[]) => {
        if (items.length === 0) {
            setToast({ msg: "No items selected to copy.", type: "warn" });
            return;
        }
        try {
            const htmlItems = items.map(item => {
                const labelPrefix = (includeLabel && item.label) ? `<b style="font-weight: bold;">${item.label}</b> ` : '';
                return `<p style="margin-bottom: 8pt; font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15;">${labelPrefix}${item.formattedHtml}</p>`;
            }).join('');

            const fullHtmlDocument = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15; }
        p { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; margin-bottom: 8pt; line-height: 1.15; }
        b, strong { font-weight: bold; }
        i, em { font-style: italic; }
        sup { vertical-align: super; font-size: 0.83em; line-height: 0; }
        sub { vertical-align: sub; font-size: 0.83em; line-height: 0; }
        u { text-decoration: underline; }
        .small-caps { font-variant: small-caps; }
    </style>
</head>
<body>
    ${htmlItems}
</body>
</html>`.trim();

            const plainText = items.map(item => `${(includeLabel && item.label) ? item.label + ' ' : ''}${item.rawText}`).join('\n');

            const htmlBlob = new Blob([fullHtmlDocument], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });

            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': htmlBlob,
                        'text/plain': textBlob
                    })
                ]);
                setToast({ msg: `Copied ${items.length} item(s) to Clipboard! Ready to paste into Word (.docx) with exact formatting.`, type: "success" });
            } else {
                await navigator.clipboard.writeText(plainText);
                setToast({ msg: "Copied plain text (Browser clipboard fallback).", type: "warn" });
            }
        } catch (e) {
            console.error("Clipboard copy error:", e);
            setToast({ msg: "Clipboard copy failed.", type: "error" });
        }
    };

    const downloadWordDocument = (items: ExtractedRef[]) => {
        if (items.length === 0) {
            setToast({ msg: "No items selected to export.", type: "warn" });
            return;
        }
        const htmlItems = items.map(item => {
            const labelPrefix = (includeLabel && item.label) ? `<b style="font-weight: bold;">${item.label}</b> ` : '';
            return `<p style="margin-bottom: 8pt; font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15;">${labelPrefix}${item.formattedHtml}</p>`;
        }).join('');

        const fullHtmlDocument = `
<html xmlns:o='urn:schemas-microsoft-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset="utf-8">
    <title>Bibliography Export</title>
    <!--[if gte mso 9]>
    <xml>
    <w:WordDocument>
        <w:View>Normal</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        body { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15; }
        p { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; margin-bottom: 8pt; line-height: 1.15; }
        b, strong { font-weight: bold; }
        i, em { font-style: italic; }
        sup { vertical-align: super; font-size: 0.83em; }
        sub { vertical-align: sub; font-size: 0.83em; }
        u { text-decoration: underline; }
        .small-caps { font-variant: small-caps; }
    </style>
</head>
<body>
    ${htmlItems}
</body>
</html>`.trim();

        const blob = new Blob(['\ufeff' + fullHtmlDocument], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Bibliography_Extracted_${new Date().toISOString().slice(0, 10)}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setToast({ msg: `Downloaded ${items.length} reference(s) as MS Word document (.doc)!`, type: "success" });
    };

    const handleCopySelected = () => {
        const selectedItems = results.filter((_, i) => selectedIndices.has(i));
        copyToClipboard(selectedItems);
    };

    const handleDownloadSelected = () => {
        const selectedItems = results.filter((_, i) => selectedIndices.has(i));
        downloadWordDocument(selectedItems);
    };

    const filteredResults = useMemo(() => {
        return results.map((item, originalIndex) => ({ item, originalIndex })).filter(({ item }) => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matches = item.rawText.toLowerCase().includes(q) || 
                                item.formattedHtml.toLowerCase().includes(q) || 
                                item.id.toLowerCase().includes(q) || 
                                item.label.toLowerCase().includes(q);
                if (!matches) return false;
            }

            if (filterFormat === 'sup') return item.hasSuperscript;
            if (filterFormat === 'sub') return item.hasSubscript;
            if (filterFormat === 'italic') return item.hasItalic;
            if (filterFormat === 'bold') return item.hasBold;

            return true;
        });
    }, [results, searchQuery, filterFormat]);

    const formatCounts = useMemo(() => {
        return {
            all: results.length,
            sup: results.filter(r => r.hasSuperscript).length,
            sub: results.filter(r => r.hasSubscript).length,
            italic: results.filter(r => r.hasItalic).length,
            bold: results.filter(r => r.hasBold).length,
        };
    }, [results]);

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runExtraction : handleCopySelected,
        onClear: () => { setInput(''); setResults([]); setStep('input'); setSelectedIndices(new Set()); setSearchQuery(''); }
    }, [input, results, step, selectedIndices]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            {/* Header Badge & Title */}
            <div className="mb-8 text-center animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3 shadow-xs">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>100% Exact Text Formatting • Superscript, Subscript, Italics & Bold Protected for .docx</span>
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Bibliography Extractor</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">
                    Extract bibliography references with total typography preservation. All superscripts, subscripts, italics, bold, and small-caps transfer natively into Microsoft Word (.docx).
                </p>
            </div>

            {/* Main Container Card */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative transition-all duration-500 min-h-[720px]">
                {isLoading && <LoadingOverlay message="Extracting bibliography & preserving typography tags..." color="indigo" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in flex-grow">
                        <div className="bg-slate-50 px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                            <label className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                Master XML Bibliography Source Feed
                            </label>
                            <button 
                                onClick={() => setInput('')} 
                                className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider transition-colors"
                            >
                                Clear Input
                            </button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-8 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed text-slate-800 min-h-[480px] custom-scrollbar" 
                            placeholder="Paste your XML document or <ce:bib-reference> entries here..."
                            spellCheck={false}
                        />
                        <div className="p-6 border-t border-slate-200 flex flex-wrap justify-between items-center bg-slate-50/80 gap-4">
                            <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                                Preserves <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:sup&gt;</code>, <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:inf&gt;</code>, <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:italic&gt;</code>, <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:bold&gt;</code> tags. Extracts strictly from <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;sb:reference&gt;</code> or <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:other-ref&gt;</code>.
                            </div>
                            <button 
                                onClick={runExtraction} 
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-3 cursor-pointer"
                            >
                                <Zap className="h-5 w-5 fill-white" />
                                Run Precision Extraction
                            </button>
                        </div>
                    </div>
                )}

                {step === 'report' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in flex-grow overflow-hidden">
                        {/* Control Toolbar */}
                        <div className="px-8 py-5 border-b border-slate-200 bg-white shadow-xs z-10 space-y-4">
                            <div className="flex flex-wrap justify-between items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => { setStep('input'); }}
                                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                                        title="Back to Input"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div>
                                        <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                            Extracted Bibliography Report
                                            <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                                                {selectedIndices.size} of {results.length} Selected
                                            </span>
                                        </h3>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <button onClick={toggleAll} className="text-xs text-indigo-600 font-extrabold uppercase tracking-wider hover:underline">
                                                {selectedIndices.size === results.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Export Action Buttons */}
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <button 
                                        onClick={handleDownloadSelected}
                                        disabled={selectedIndices.size === 0}
                                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black py-3 px-6 rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all uppercase text-xs tracking-wider flex items-center gap-2"
                                        title="Download .doc file that opens in MS Word with 100% formatted text"
                                    >
                                        <Download className="h-4 w-4" />
                                        <span>Download .doc File</span>
                                    </button>

                                    <button 
                                        onClick={handleCopySelected} 
                                        disabled={selectedIndices.size === 0}
                                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-3 px-8 rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all uppercase text-xs tracking-wider flex items-center gap-2"
                                        title="Copy formatted HTML to Clipboard for instant pasting into MS Word"
                                    >
                                        <Copy className="h-4 w-4" />
                                        <span>Copy for Word (.docx)</span>
                                    </button>
                                </div>
                            </div>

                            {/* Search & Filter Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                                {/* Format Filter Tabs */}
                                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <button 
                                        onClick={() => setFilterFormat('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterFormat === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        All ({formatCounts.all})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('sup')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'sup' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Superscript <sup>x</sup> ({formatCounts.sup})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('sub')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'sub' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Subscript <sub>x</sub> ({formatCounts.sub})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('italic')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'italic' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Italics ({formatCounts.italic})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('bold')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'bold' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Bold ({formatCounts.bold})
                                    </button>
                                </div>

                                {/* View Mode Toggle & Search Box */}
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                        <input 
                                            type="text" 
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Search references or IDs..."
                                            className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
                                        />
                                    </div>

                                    {/* Include Labels Toggle */}
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors text-xs font-semibold text-slate-700" title="Prepend XML <ce:label> to reference text (e.g. [1], [An et al., 2019]). Off by default.">
                                        <input 
                                            type="checkbox"
                                            checked={includeLabel}
                                            onChange={e => setIncludeLabel(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                        />
                                        <span>Include Labels</span>
                                    </label>

                                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                                        <button 
                                            onClick={() => setViewMode('rich')}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'rich' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}
                                            title="Word Rendered Preview"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>Word View</span>
                                        </button>
                                        <button 
                                            onClick={() => setViewMode('code')}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'code' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}
                                            title="Raw HTML Tags Inspection"
                                        >
                                            <Code className="w-3.5 h-3.5" />
                                            <span>HTML Tags</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Reference Item List */}
                        <div className="flex-grow overflow-y-auto p-6 space-y-3 custom-scrollbar max-h-[580px]">
                            {filteredResults.length === 0 ? (
                                <div className="p-12 text-center text-slate-400">
                                    <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm font-bold">No reference items match your filter criteria.</p>
                                </div>
                            ) : (
                                filteredResults.map(({ item, originalIndex }) => {
                                    const isSelected = selectedIndices.has(originalIndex);
                                    return (
                                        <div 
                                            key={item.id} 
                                            onClick={() => toggleIndex(originalIndex)}
                                            className={`p-5 bg-white border-2 rounded-2xl shadow-2xs hover:shadow-md transition-all group flex items-start gap-4 cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {/* Checkbox */}
                                            <div className="shrink-0 pt-0.5">
                                                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                                                </div>
                                            </div>

                                            {/* Reference Content */}
                                            <div className="flex-grow min-w-0">
                                                {/* Header Badges */}
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className="text-[11px] font-mono font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                                                        ID: {item.id}
                                                    </span>
                                                    {item.label && (
                                                        <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                                                            Label: {item.label}
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                                                        item.sourceType === 'structured'
                                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                            : item.sourceType === 'other-ref'
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-slate-100 text-slate-500 border-slate-200'
                                                    }`}>
                                                        {item.sourceType === 'structured' ? 'sb:reference' : item.sourceType === 'other-ref' ? 'ce:other-ref' : 'fallback'}
                                                    </span>

                                                    {/* Format Presence Badges */}
                                                    <div className="ml-auto flex items-center gap-1">
                                                        {item.hasSuperscript && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-purple-100 text-purple-700 border border-purple-200">
                                                                SUP <sup>x</sup>
                                                            </span>
                                                        )}
                                                        {item.hasSubscript && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-blue-100 text-blue-700 border border-blue-200">
                                                                SUB <sub>x</sub>
                                                            </span>
                                                        )}
                                                        {item.hasItalic && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-amber-100 text-amber-700 border border-amber-200 italic">
                                                                ITALIC
                                                            </span>
                                                        )}
                                                        {item.hasBold && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">
                                                                BOLD
                                                            </span>
                                                        )}
                                                        {item.hasSmallCaps && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase">
                                                                SMALL-CAPS
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Text Display */}
                                                {viewMode === 'rich' ? (
                                                    <div 
                                                        className="text-[14px] text-slate-800 leading-relaxed font-serif break-words p-3 bg-slate-50/60 rounded-xl border border-slate-100"
                                                        dangerouslySetInnerHTML={{ 
                                                             __html: `${(includeLabel && item.label) ? `<b class="font-bold text-slate-900">${item.label}</b> ` : ''}${item.formattedHtml}` 
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="bg-slate-900 text-emerald-300 p-3 rounded-xl font-mono text-[12px] leading-relaxed break-all border border-slate-800">
                                                        {includeLabel && item.label && <span className="text-amber-400 font-bold">&lt;b&gt;{item.label}&lt;/b&gt; </span>}
                                                        {item.formattedHtml}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Single Copy Action Button */}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard([item]); }}
                                                className="shrink-0 p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-xs"
                                                title="Copy single reference formatted for MS Word"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceExtractor;
