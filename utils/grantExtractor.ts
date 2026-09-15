/**
 * Grant Sponsor & Grant Number Extractor Utility
 * Provides system prompt, AI output sanitizer, and robust offline rule-based fallback.
 */

export const GRANT_EXTRACTION_SYSTEM_PROMPT = `You are given an acknowledgement or funding statement. Task: Identify only the grant sponsor(s) and corresponding grant number(s) explicitly mentioned in the text.

Rules:
- Do not rewrite, paraphrase, or correct the original wording. Preserve the exact institution names and capitalization as presented.
- Identify only explicit funding bodies (the official organization that awarded or administered the grant).
- Do NOT capture program names, project titles, funding schemes, fellowship names, ethics codes, or internal administrative references as sponsors unless they are clearly presented as the funding institution itself.
- The parent-organization rule applies ONLY when the text explicitly states an administrative relationship between two separately-named entities — e.g. "Program X, administered by University Y" or "funded by University Y through its Z Program." In that case only, capture the parent organization (University Y) as the sponsor.
- Do NOT apply the parent-organization rule merely because an institution's name appears as a prefix within a longer program title (e.g. "Shanghai Dianji University Excellent Engineer Program" is one single, specific program name — not "a program administered by Shanghai Dianji University." Capture the full name exactly as written; do not truncate it down to just the institution.)
- Each distinct funding source, program, or project named in the text is its own separate entry — even if two or more entries share a common institution name or prefix. Never merge, generalize, or collapse multiple distinctly-named programs into a single combined sponsor. The number of Grant Sponsor entries in your output must equal the number of distinct funding sources named in the input.
- If multiple sponsors are present, list them separately.
- If a sponsor has multiple grant numbers, list them on the same line separated by commas. Only include numbers/codes that are genuinely grant or award identifiers — never include a project title, team name, or descriptive phrase as if it were a grant number, even if it appears in the same parenthetical as a real grant number.
- Each grant number belongs ONLY to the sponsor it is stated with. Never carry a number over to a sponsor that has none of its own, and never assign the same number to more than one sponsor unless the text explicitly says it funded both.
- Keep each organization's full name intact as written. Do not split a single name at internal words (e.g. "Japan Society for the Promotion of Science" is ONE sponsor, not "Japan Society" plus "Promotion of Science"), and do not merge two sponsors listed together (e.g. "the Leverhulme Trust and the Royal Society" is TWO separate sponsors).
- The identifier may be introduced by a label other than "grant number" — e.g. "award ID," "project ID," "project number," "contract number," or "reference number" all serve the same purpose and must be captured as the Grant Number. This is different from a project TITLE (a descriptive name, which is never captured) — a project ID/number is a short alphanumeric code, not a description.
- If no grant number is stated for a given sponsor, write: No grant number provided
- Do not infer, assume, or generate missing information. Ignore disclaimers and non-funding statements. If the text states that no specific funding was received, return no sponsors at all.

Output Format (strictly follow):
Grant Sponsor:
Grant Number:`;

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

  // Proper noun sequence regex: capitalized words linked by lowercase connectors.
  // Two connector classes, deliberately different:
  //  - of/for/in/the/de/... chain freely, so "Japan Society *for the* Promotion of Science"
  //    stays one name instead of splitting into two phantom sponsors.
  //  - "and"/"&" only link when followed IMMEDIATELY by a capitalized word. This keeps
  //    "Ministry of Science and Technology" whole while still splitting a list like
  //    "Leverhulme Trust *and the* Royal Society" into two separate sponsors.
  const properNounPattern = /\b[A-Z][A-Za-z0-9]*(?:(?:\s+(?:of|for|in|the|de|des|du|der|von)){1,3}\s+[A-Z][A-Za-z0-9]+|\s+(?:and|&)\s+[A-Z][A-Za-z0-9]+|\s+[A-Z][A-Za-z0-9]+)+\b/g;
  const orgWordPattern = /(?:Foundation|Institutes?|Council|Agency|Trust|Society|Department|Ministry|Association|Organization|Fund|University|Commission|Center|Centre|Laboratory|Program|Academy|Board|Federation|Union|Initiative|Health|Science|Research)\b/i;
  const leadingNoise = /^(?:This|The|Authors?|Study|Work|Research|Financial|Acknowledgement|Funding|Also|Additionally|Furthermore|In|At|By|From|For|We|With|Grant|Grants)\s+/i;

  const foundCandidates: Array<{ name: string; index: number; length: number }> = [];

  // Ranges covered by parentheses — these hold project titles, team names, and
  // descriptive sub-titles, not funding bodies. A capitalized phrase scraped from
  // inside one (e.g. "...Collaborative Education Mechanism for Digital Health")
  // would otherwise be emitted as a phantom extra sponsor.
  const parentheticalRanges: Array<[number, number]> = [];
  for (const m of text.matchAll(/\([^()]*\)/g)) {
    parentheticalRanges.push([m.index, m.index + m[0].length]);
  }
  const isInsideParenthetical = (idx: number) =>
    parentheticalRanges.some(([start, end]) => idx > start && idx < end);

  // Match proper noun phrases
  for (const m of text.matchAll(properNounPattern)) {
    const raw = m[0];
    const cleaned = raw.replace(leadingNoise, '').trim();
    if (cleaned.length >= 3 && orgWordPattern.test(cleaned)) {
      const offset = m.index + (raw.length - cleaned.length);
      if (isInsideParenthetical(offset)) continue;
      foundCandidates.push({ name: cleaned, index: offset, length: cleaned.length });
    }
  }

  // Match standalone acronyms
  for (const m of text.matchAll(acronymPattern)) {
    const acronym = m[0];
    const index = m.index;
    if (isInsideParenthetical(index)) continue;
    if (!foundCandidates.some(c => index >= c.index && index < c.index + c.length)) {
      foundCandidates.push({ name: acronym, index, length: acronym.length });
    }
  }

  // Sort by appearance in text
  foundCandidates.sort((a, b) => a.index - b.index);

  for (let ci = 0; ci < foundCandidates.length; ci++) {
    const candidate = foundCandidates[ci];
    // Avoid duplicates
    if (pairs.some(p => p.sponsor.toLowerCase() === candidate.name.toLowerCase())) {
      continue;
    }

    // Search for grant numbers after this sponsor, but STOP at the next sponsor.
    // Without this bound, a sponsor whose own code isn't recognised silently grabs the
    // NEXT sponsor's number instead — e.g. "...Foundation of China (No. 82071234) and
    // the ...Foundation of Jiangsu Province (BK20201234)" assigned BK20201234 to both.
    const searchStart = candidate.index + candidate.length;
    const nextCandidateIndex = ci + 1 < foundCandidates.length ? foundCandidates[ci + 1].index : text.length;
    const afterSlice = text.slice(searchStart, Math.min(searchStart + 150, nextCandidateIndex));

    const codeToken = '[A-Za-z0-9][A-Za-z0-9\\/\\-_.]*[0-9][A-Za-z0-9\\/\\-_.]*';
    const codeList = `${codeToken}(?:\\s*,?\\s*(?:and\\s+)?${codeToken})*`;

    const grantNumMatch =
      // Keyword-introduced code(s): "grant no. X", "award numbers X and Y", "grant agreement No 874662".
      afterSlice.match(new RegExp(`(?:grant|award|project|contract|agreement)s?(?:\\s+(?:agreement|numbers?|nos?\\.?|codes?|id))?\\s*[:#]?\\s*(${codeList})`, 'i')) ||
      // "No."/"Number" lead-in without the word "grant", common inside parentheses: "(No. 82071234)".
      afterSlice.match(new RegExp(`\\b(?:nos?\\.?|numbers?)\\s*[:#]?\\s*(${codeList})`, 'i')) ||
      afterSlice.match(/\[([A-Za-z0-9\/\-_.\s]+)\]/) ||
      // Bare identifier code inside a parenthetical, e.g. "(Long Project Title, C2026151)".
      // Requires a digit and no spaces so real codes match but prose/titles never do.
      afterSlice.match(/\(([^()]*?,\s*)?([A-Za-z]{0,6}[0-9][A-Za-z0-9\/\-_.]*)\s*\)/);

    let numbers: string[] = [];
    if (grantNumMatch) {
      // The bare-parenthetical pattern captures its code in group 2; the others use group 1.
      const rawNums = (grantNumMatch[2] || grantNumMatch[1] || '').trim();
      if (rawNums && !/^(?:and|the|for|this|grant|none|no)\b/i.test(rawNums)) {
        numbers = rawNums
          .split(/[,;]|\band\b/i)
          .map((n) => n.trim().replace(/^[:#\s-]+/, '').replace(/[.;]+$/, ''))
          .filter((n) => n.length >= 2 && !/^(?:and|the|grant|no|none|numbers?|award)$/i.test(n));
      }
    }

    // Fallback: the number may precede the sponsor — "Grant 2021YFA123 from the Ministry of ...".
    // Only a short backward window, and only when introduced by a grant keyword, so unrelated
    // digits earlier in the sentence can't be mistaken for this sponsor's award code.
    if (numbers.length === 0) {
      const beforeSlice = text.slice(Math.max(0, candidate.index - 80), candidate.index);
      const beforeMatch = beforeSlice.match(
        new RegExp(`(?:grant|award|contract|agreement)s?(?:\\s+(?:numbers?|nos?\\.?|codes?|id))?\\s*[:#]?\\s*(${codeList})\\s+(?:from|by|of|awarded by)\\s+(?:the\\s+)?$`, 'i')
      );
      if (beforeMatch && beforeMatch[1]) {
        numbers = beforeMatch[1]
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
