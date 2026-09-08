/**
 * Affiliation Sequencer & ID Normalizer
 *
 * Implements strict editorial rules for Elsevier Journal CE XML:
 * - Sequentially renumbers <ce:affiliation id="..."> in increments of 5 (af0005, af0010, af0015, af0020...)
 * - Preserves affiliation-id="..." strictly intact
 * - Synchronizes <ce:cross-ref refid="..."> links pointing to corrected affiliation IDs (e.g. refid="af0025" -> refid="af0020")
 * - Preserves <ce:cross-ref id="..."> attributes and inner <ce:sup> labels intact
 * - Preserves all <ce:author>, <sa:affiliation>, and document structure intact
 */

export interface AffiliationChange {
  index: number;
  oldId: string;
  newId: string;
  label?: string;
  affiliationId?: string;
  organization?: string;
  isChanged: boolean;
}

export interface CrossRefChange {
  oldRefId: string;
  newRefId: string;
  crossRefId?: string;
  label?: string;
  originalTag: string;
  updatedTag: string;
}

export interface StrictAffiliationSequenceResult {
  outputXml: string;
  totalAffiliations: number;
  changedCount: number;
  changes: AffiliationChange[];
  crossRefChanges: CrossRefChange[];
  totalCrossRefsUpdated: number;
  isAlreadySequential: boolean;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export function getAlphabetLabel(index0Based: number): string {
  let label = "";
  let n = index0Based;
  while (n >= 0) {
    label = ALPHABET[n % 26] + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Format 1-based affiliation index into sequential ID:
 * 1 -> af0005, 2 -> af0010, 3 -> af0015, 4 -> af0020, etc.
 */
export function formatAffiliationId(index1Based: number, increment = 5): string {
  const num = index1Based * increment;
  return `af${num.toString().padStart(4, '0')}`;
}

/**
 * Synchronizes <ce:cross-ref refid="..."> elements so that references point
 * to the corrected affiliation IDs.
 *
 * Preserves the cross-ref's own id attribute (e.g. id="cf0040") and inner <ce:sup> intact.
 * e.g. <ce:cross-ref refid="af0025" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>
 *   -> <ce:cross-ref refid="af0020" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>
 */
/**
 * Synchronizes <ce:cross-ref refid="..."> elements so that references point
 * to the corrected affiliation IDs.
 *
 * Preserves the cross-ref's own id attribute (e.g. id="cf0040") and inner <ce:sup> intact.
 * Handles space- and comma-separated multiple refid tokens, compound superscripts
 * (e.g. "b, d", "b and d"), and strictly preserves distinct author affiliation links.
 */
export function synchronizeAffiliationCrossRefs(
  xml: string,
  idMap: Record<string, string>,
  labelToNewIdMap: Record<string, string> = {},
  labelReplacementMap: Record<string, string> = {}
): { outputXml: string; updatedCount: number; changes: CrossRefChange[] } {
  if (!xml || typeof xml !== 'string') {
    return { outputXml: xml || '', updatedCount: 0, changes: [] };
  }

  const crossRefChanges: CrossRefChange[] = [];
  let updatedCount = 0;

  // Regex matches <ce:cross-ref ...> tags with or without content/closing tags
  const crossRefRegex = /<ce:cross-ref\b([^>]*)(?:\/>|>([\s\S]*?)<\/ce:cross-ref>)/gi;

  const outputXml = xml.replace(crossRefRegex, (fullMatch, attrString, innerContent) => {
    // Check if tag has refid attribute
    const refidAttrRegex = /(^|\s)refid=(["'])(.*?)\2/i;
    const refidMatch = attrString.match(refidAttrRegex);

    if (!refidMatch) {
      return fullMatch;
    }

    const quote = refidMatch[2];
    const originalRefIdVal = refidMatch[3];
    const refTokens = originalRefIdVal.trim().split(/[\s,]+/).filter(Boolean);

    // Skip non-affiliation refs (e.g. bib, tbl, fig, fn, cor)
    const isNonAff = refTokens.some((t: string) => /^(bib|b\d|ref|tbl|tb\d|fig|gr\d|fn\d|cor\d)/i.test(t));
    if (isNonAff) {
      return fullMatch;
    }

    // Optional cross-ref ID extraction (e.g. id="cf0040")
    const cfIdMatch = attrString.match(/(^|\s)id=(["'])(.*?)\2/i);
    const crossRefId = cfIdMatch ? cfIdMatch[3] : undefined;

    // Extract label from innerContent if available (e.g. <ce:sup>d</ce:sup> or <ce:sup>b, d</ce:sup>)
    const supRegex = /<ce:sup>([\s\S]*?)<\/ce:sup>/i;
    const supMatch = innerContent ? innerContent.match(supRegex) : null;
    const rawSup = supMatch ? supMatch[1].trim() : '';

    const parseSupLabels = (text: string): string[] => {
      if (!text) return [];
      return text.split(/(?:,|\band\b|&|;|\s)+/i).map((s: string) => s.trim()).filter(Boolean);
    };

    const supLabels = parseSupLabels(rawSup);

    // Identify if this tag is an affiliation cross-reference
    const isAffCrossRef = refTokens.some((t: string) => idMap[t] || /^aff?\d*$/i.test(t) || labelToNewIdMap[t.toLowerCase()]) ||
                          supLabels.some((l: string) => labelToNewIdMap[l.toLowerCase()]);

    if (!isAffCrossRef) {
      return fullMatch;
    }

    let resolvedNewIds: string[] = [];
    let updatedSup = rawSup;

    // Strategy 1: Visible superscript labels represent the author's true intent
    if (supLabels.length > 0 && supLabels.some((l: string) => labelToNewIdMap[l.toLowerCase()])) {
      const validMappings = supLabels
        .map((l: string) => ({ oldLabel: l, newId: labelToNewIdMap[l.toLowerCase()] }))
        .filter((m: { oldLabel: string; newId: string }) => Boolean(m.newId));

      if (validMappings.length > 0) {
        resolvedNewIds = validMappings.map((m: { oldLabel: string; newId: string }) => m.newId);

        // If specific label characters changed, update inside rawSup while preserving formatting
        validMappings.forEach((m: { oldLabel: string; newId: string }) => {
          const replacement = labelReplacementMap[m.oldLabel.toLowerCase()];
          if (replacement && replacement !== m.oldLabel) {
            const wordRegex = new RegExp(`\\b${m.oldLabel}\\b`, 'g');
            updatedSup = updatedSup.replace(wordRegex, replacement);
          }
        });
      }
    }

    // Strategy 2: If not resolved via supLabels, map tokens in refid individually
    if (resolvedNewIds.length === 0) {
      resolvedNewIds = refTokens.map((token: string) => {
        if (idMap[token]) return idMap[token];
        if (labelToNewIdMap[token.toLowerCase()]) return labelToNewIdMap[token.toLowerCase()];
        return token;
      });
    }

    // Deduplicate resolved IDs while preserving order
    const uniqueNewIds: string[] = [];
    resolvedNewIds.forEach(id => {
      if (!uniqueNewIds.includes(id)) uniqueNewIds.push(id);
    });

    const newRefIdVal = uniqueNewIds.join(' ');
    const isRefIdChanged = originalRefIdVal !== newRefIdVal;
    const isSupChanged = rawSup !== updatedSup;

    if (!isRefIdChanged && !isSupChanged) {
      return fullMatch;
    }

    const updatedAttrString = attrString.replace(refidAttrRegex, `$1refid=${quote}${newRefIdVal}${quote}`);

    let newInner = innerContent || '';
    if (isSupChanged && supMatch) {
      newInner = newInner.replace(supRegex, `<ce:sup>${updatedSup}</ce:sup>`);
    }

    let updatedTag = '';
    if (innerContent !== undefined) {
      updatedTag = `<ce:cross-ref${updatedAttrString}>${newInner}</ce:cross-ref>`;
    } else {
      updatedTag = `<ce:cross-ref${updatedAttrString}/>`;
    }

    updatedCount++;
    crossRefChanges.push({
      oldRefId: originalRefIdVal,
      newRefId: newRefIdVal,
      crossRefId,
      label: updatedSup || rawSup || undefined,
      originalTag: fullMatch,
      updatedTag,
    });

    return updatedTag;
  });

  return {
    outputXml,
    updatedCount,
    changes: crossRefChanges,
  };
}

/**
 * Normalizes the `id` attribute of <ce:affiliation> tags in increments of 5 (af0005, af0010...).
 * Also synchronizes corresponding author <ce:cross-ref refid="..."> links so references to
 * updated affiliation IDs remain valid (e.g., refid="af0025" -> refid="af0020").
 *
 * Strictly preserves:
 * - affiliation-id="..." attributes
 * - <ce:cross-ref id="..."> attributes (e.g. id="cf0040")
 * - <ce:sup> labels and author names
 * - XML formatting and structure
 */
export function sequenceAffiliationIdsStrict(
  xml: string, 
  increment = 5,
  syncCrossRefs = true
): StrictAffiliationSequenceResult {
  if (!xml || typeof xml !== 'string') {
    return {
      outputXml: xml || '',
      totalAffiliations: 0,
      changedCount: 0,
      changes: [],
      crossRefChanges: [],
      totalCrossRefsUpdated: 0,
      isAlreadySequential: true,
    };
  }

  // 1. First pass: analyze all <ce:affiliation> elements and record mappings
  const affOpeningTagRegex = /<ce:affiliation\b([^>]*)>/gi;
  const changes: AffiliationChange[] = [];
  const idMap: Record<string, string> = {};
  const labelToNewIdMap: Record<string, string> = {};
  const labelReplacementMap: Record<string, string> = {};

  let affIndex = 0;
  let changedCount = 0;
  let match: RegExpExecArray | null;

  while ((match = affOpeningTagRegex.exec(xml)) !== null) {
    affIndex++;
    const attrString = match[1];
    const expectedId = formatAffiliationId(affIndex, increment);

    // Match ONLY id="..." without matching affiliation-id="..."
    const idAttrRegex = /(^|\s)id=(["'])(.*?)\2/i;
    const idMatch = attrString.match(idAttrRegex);
    const oldId = idMatch ? idMatch[3] : '';

    const isChanged = oldId !== expectedId;
    if (isChanged) {
      changedCount++;
    }

    if (oldId) {
      idMap[oldId] = expectedId;
    }

    // Extract auxiliary info for reporting & mapping
    const affIdMatch = attrString.match(/(^|\s)affiliation-id=(["'])(.*?)\2/i);
    const affiliationId = affIdMatch ? affIdMatch[3] : undefined;

    // Look for inner <ce:label> in following snippet
    const afterPos = match.index;
    const snippet = xml.slice(afterPos, afterPos + 1200);
    const labelMatch = snippet.match(/<ce:label>([^<]*)<\/ce:label>/i);
    const explicitLabel = labelMatch ? labelMatch[1].trim() : '';

    // Alphabetical label for this index (e.g. 1->'a', 2->'b', 3->'c', 4->'d'...)
    const alphabetLabel = getAlphabetLabel(affIndex - 1);
    const numericLabel = String(affIndex);

    if (explicitLabel) {
      labelToNewIdMap[explicitLabel.toLowerCase()] = expectedId;
      if (explicitLabel.toLowerCase() !== alphabetLabel.toLowerCase()) {
        labelReplacementMap[explicitLabel.toLowerCase()] = alphabetLabel;
      }
    }
    labelToNewIdMap[alphabetLabel.toLowerCase()] = expectedId;
    labelToNewIdMap[numericLabel] = expectedId;

    changes.push({
      index: affIndex,
      oldId: oldId || '(none)',
      newId: expectedId,
      label: explicitLabel || alphabetLabel,
      affiliationId,
      isChanged,
    });
  }

  // 2. Second pass: update <ce:affiliation> opening tags
  let currentAffIndex = 0;
  let xmlWithUpdatedAffiliations = xml.replace(affOpeningTagRegex, (fullMatch, attrString) => {
    currentAffIndex++;
    const expectedId = formatAffiliationId(currentAffIndex, increment);

    const idAttrRegex = /(^|\s)id=(["'])(.*?)\2/i;
    const idMatch = attrString.match(idAttrRegex);
    const oldId = idMatch ? idMatch[3] : '';

    if (oldId === expectedId) {
      return fullMatch;
    }

    let updatedAttrString = attrString;
    if (idMatch) {
      updatedAttrString = attrString.replace(idAttrRegex, `$1id="${expectedId}"`);
    } else {
      updatedAttrString = ` id="${expectedId}"${attrString}`;
    }

    return `<ce:affiliation${updatedAttrString}>`;
  });

  // 3. Third pass: synchronize <ce:cross-ref refid="..."> if enabled
  let finalXml = xmlWithUpdatedAffiliations;
  let crossRefChanges: CrossRefChange[] = [];
  let totalCrossRefsUpdated = 0;

  if (syncCrossRefs) {
    const syncResult = synchronizeAffiliationCrossRefs(finalXml, idMap, labelToNewIdMap, labelReplacementMap);
    finalXml = syncResult.outputXml;
    crossRefChanges = syncResult.changes;
    totalCrossRefsUpdated = syncResult.updatedCount;
  }

  return {
    outputXml: finalXml,
    totalAffiliations: affIndex,
    changedCount,
    changes,
    crossRefChanges,
    totalCrossRefsUpdated,
    isAlreadySequential: changedCount === 0 && totalCrossRefsUpdated === 0,
  };
}
