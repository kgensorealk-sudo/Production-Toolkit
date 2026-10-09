import type { KeeperEvidence } from './keeperEvidence.js';

// Report verified associations only; never substitute a nearby or similarly numbered answer.
export function keeperQueryReport(evidence: KeeperEvidence) {
  const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]{}|])/g,'\\$1');
  const queries = evidence.records.filter(r => r.kind === 'query');
  const lines = ['AI interpretation was unavailable. The following report comes from deterministic file inspection; it does not confirm that any requested edit was completed.', '', `Original XML queries found: ${queries.length}.`];
  if (!queries.length) lines.push('No original XML query records were extracted. PDF answers cannot be verified against missing XML queries.');
  let used = 0;
  for (const query of queries) {
    if (used >= 100 || lines.join('\n').length >= 180000) break;
    used++;
    const file = evidence.files.find(f => f.id === query.artifactId);
    const binding = query.binding;
    const pdf = evidence.records.find(r => r.id === binding?.pdfRecordId);
    const pdfFile = evidence.files.find(f => f.id === pdf?.artifactId);
    const state = binding?.state || 'unresolved';
    const short = (text: string) => escape(text.slice(0,5000)) + (text.length > 5000 ? ' [Excerpt truncated; retrieve the complete record with the evidence tool.]' : '');
    lines.push('', `### ${escape(query.queryId || query.id)}${query.commented ? ' (commented XML query)' : ''}`, `Source: ${escape(file?.name || query.artifactId)}, line ${query.line ?? 'unknown'}; record ${escape(query.id)}.`, '', `**Query:** ${short(query.text)}`, '', `**Association:** ${escape(state)}. ${escape(binding?.reason || 'Response association unavailable.')}`);
    if (state === 'established' && binding?.response) lines.push('', `**Author response:** ${short(binding.response)}`, '', `Response source: ${escape(pdfFile?.name || pdf?.artifactId || 'unknown')}, page ${pdf?.page ?? 'unknown'}; record ${escape(binding.pdfRecordId || 'unknown')}.`, '', '**Edit status:** Not established by response matching.');
    else lines.push('', '**Author response:** Not verified; no answer has been assigned to this query.');
  }
  if (used < queries.length) lines.push('', `Incomplete report: showing ${used} of ${queries.length} queries. Remaining queries require further retrieval.`);
  for (const file of evidence.files) for (const diagnostic of file.diagnostics) lines.push('', `Inspection limitation — ${escape(file.name)}: ${escape(diagnostic)}`);
  return lines.join('\n');
}
