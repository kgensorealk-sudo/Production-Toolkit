/**
 * Grant Sponsor & Grant Number Extractor Utility
 * Provides system prompt, AI output sanitizer, and robust offline rule-based fallback.
 */

export const GRANT_EXTRACTION_SYSTEM_PROMPT = `You are given an acknowledgement or funding statement. Task: Identify only the grant sponsor(s) and corresponding grant number(s) explicitly mentioned in the text. Rules: Do not rewrite, paraphrase, or correct the original wording. Preserve the exact institution names and capitalization as presented. Identify only explicit funding bodies (the official organization that awarded or administered the grant). Do NOT capture program names, project titles, funding schemes, fellowship names, ethics codes, or internal administrative references as sponsors unless they are clearly presented as the funding institution itself. If a grant is awarded through a program but administered by a parent organization, capture the parent organization as the Grant Sponsor. If multiple sponsors are present, list them separately. If a sponsor has multiple grant numbers, list them on the same line separated by commas. If no grant number is stated, write: No grant number provided Do not infer, assume, or generate missing information. Ignore disclaimers and non-funding statements. Output Format (strictly follow): Grant Sponsor: Grant Number:`;

export interface ExtractedGrantPair {
  sponsor: string;
  numbers: string[];
}

/**
 * Sanitizes and parses the raw text from the AI or offline engine
 * into the strict format expected by the Grant Tagger:
 *
 * Grant Sponsor: <Name>
 * Grant Number: <Num1, Num2>
 */
export function sanitizeGrantExtractionResult(rawText: string): {
  formattedText: string;
  pairs: ExtractedGrantPair[];
} {
  if (!rawText || !rawText.trim()) {
    return { formattedText: '', pairs: [] };
  }

  // Remove markdown code fences if model wrapped response in ```
  const cleanedText = rawText
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  // Split by "Grant Sponsor:" to parse individual sponsor blocks
  const blocks = cleanedText.split(/(?:^|\n)(?=Grant Sponsor:)/i).filter((b) => b.trim());
  const pairs: ExtractedGrantPair[] = [];

  for (const block of blocks) {
    const sponsorMatch = block.match(/Grant Sponsor:\s*([^\n]+)/i);
    const numberMatch = block.match(/Grant Number:\s*([^\n]+)/i);

    if (sponsorMatch) {
      const sponsor = sponsorMatch[1].trim().replace(/^[:\s-]+/, '').replace(/[.;]+$/, '');
      if (sponsor) {
        let numberStr = numberMatch ? numberMatch[1].trim() : 'No grant number provided';
        if (!numberStr || /^(?:none|n\/a|not (?:stated|provided|specified))\b/i.test(numberStr)) {
          numberStr = 'No grant number provided';
        }

        const isNoNumber = /no grant number provided/i.test(numberStr);
        const numbers = isNoNumber
          ? []
          : numberStr
              .split(/[,;]|\band\b/i)
              .map((n) => n.trim().replace(/^[:#\s-]+/, '').replace(/[.;]+$/, ''))
              .filter(Boolean);

        pairs.push({
          sponsor,
          numbers: isNoNumber ? ['No grant number provided'] : numbers,
        });
      }
    }
  }

  // Construct standardized output text with double newline separation
  const formattedText = pairs
    .map((p) => {
      const numLine = p.numbers.length > 0 ? p.numbers.join(', ') : 'No grant number provided';
      return `Grant Sponsor: ${p.sponsor}\nGrant Number: ${numLine}`;
    })
    .join('\n\n');

  return { formattedText, pairs };
}

/**
 * Robust offline rule-based fallback for identifying grant sponsors & numbers
 * when network is unreachable, offline mode is engaged, or no API key is provided.
 */
export function extractGrantsOffline(statement: string): {
  formattedText: string;
  pairs: ExtractedGrantPair[];
} {
  if (!statement || !statement.trim()) {
    return { formattedText: '', pairs: [] };
  }

  const text = statement.trim();
  const pairs: ExtractedGrantPair[] = [];

  // Known abbreviations or standalone acronyms of funding bodies
  const standaloneAcronyms = ['NIH', 'NSF', 'ERC', 'DFG', 'UKRI', 'MRC', 'EPSRC', 'BBSRC', 'HHMI', 'CIHR', 'NSERC', 'JSPS', 'NNSFC', 'NASA', 'DOE', 'DOD'];
  const acronymPattern = new RegExp(`\\b(?:${standaloneAcronyms.join('|')})\\b`, 'g');

  // Proper noun sequence regex: sequences of capitalized words linked by standard lowercase connectors
  const properNounPattern = /\b[A-Z][A-Za-z0-9]*(?:\s+(?:of|and|&|the|for|in|de|des|du|der|von)\s+[A-Z][A-Za-z0-9]+|\s+[A-Z][A-Za-z0-9]+)+\b/g;
  const orgWordPattern = /(?:Foundation|Institutes?|Council|Agency|Trust|Society|Department|Ministry|Association|Organization|Fund|University|Commission|Center|Centre|Laboratory|Program|Academy|Board|Federation|Health|Science|Research)\b/i;
  const leadingNoise = /^(?:This|The|Authors?|Study|Work|Research|Financial|Acknowledgement|Funding|Also|Additionally|Furthermore|In|At|By|From|For|We|With|Grant|Grants)\s+/i;

  const foundCandidates: Array<{ name: string; index: number; length: number }> = [];

  // Match proper noun phrases
  for (const m of text.matchAll(properNounPattern)) {
    const raw = m[0];
    const cleaned = raw.replace(leadingNoise, '').trim();
    if (cleaned.length >= 3 && orgWordPattern.test(cleaned)) {
      const offset = m.index + (raw.length - cleaned.length);
      foundCandidates.push({ name: cleaned, index: offset, length: cleaned.length });
    }
  }

  // Match standalone acronyms
  for (const m of text.matchAll(acronymPattern)) {
    const acronym = m[0];
    const index = m.index;
    if (!foundCandidates.some(c => index >= c.index && index < c.index + c.length)) {
      foundCandidates.push({ name: acronym, index, length: acronym.length });
    }
  }

  // Sort by appearance in text
  foundCandidates.sort((a, b) => a.index - b.index);

  for (const candidate of foundCandidates) {
    // Avoid duplicates
    if (pairs.some(p => p.sponsor.toLowerCase() === candidate.name.toLowerCase())) {
      continue;
    }

    // Search for grant numbers in the vicinity of this sponsor (within 150 chars after)
    const afterSlice = text.slice(candidate.index + candidate.length, candidate.index + candidate.length + 150);
    const grantNumMatch = 
      afterSlice.match(/(?:grant|award|project|contract|agreement)(?:\s+(?:agreement|numbers?|number|nos?|no\.?|codes?|id))?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\/\-_.\s]*?[A-Za-z0-9])(?:\]|\)|\.|\s*,|\s+and|\s+under|\s+via|$)/i) ||
      afterSlice.match(/\[([A-Za-z0-9\/\-_.\s]+)\]/);

    let numbers: string[] = [];
    if (grantNumMatch && grantNumMatch[1]) {
      const rawNums = grantNumMatch[1].trim();
      if (!/^(?:and|the|for|this|grant|none|no)\b/i.test(rawNums)) {
        numbers = rawNums
          .split(/[,;]|\band\b/i)
          .map((n) => n.trim().replace(/^[:#\s-]+/, '').replace(/[.;]+$/, ''))
          .filter((n) => n.length >= 2 && !/^(?:and|the|grant|no|none|numbers?|award)$/i.test(n));
      }
    }

    pairs.push({
      sponsor: candidate.name,
      numbers: numbers.length > 0 ? numbers : ['No grant number provided'],
    });
  }

  const formattedText = pairs
    .map((p) => {
      const numLine = p.numbers.length > 0 ? p.numbers.join(', ') : 'No grant number provided';
      return `Grant Sponsor: ${p.sponsor}\nGrant Number: ${numLine}`;
    })
    .join('\n\n');

  return { formattedText, pairs };
}
