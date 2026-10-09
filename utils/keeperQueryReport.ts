import type { KeeperEvidence } from './keeperEvidence.js';
import {requestsOptTagCounts,renderOptCounts,summarizeOptChanges} from './keeperOptSummary.js';
import {keeperOptReviewKinds,keeperRecordInOptReview} from './keeperReviewScope.js';
export function keeperFallbackReport(evidence:KeeperEvidence,task:string) {
  const kinds=keeperOptReviewKinds(task);
  return (requestsOptTagCounts(task) ? renderOptCounts(summarizeOptChanges(evidence))+'\n\n' : '')+(kinds.length ? keeperOptReport(evidence,kinds) : '')+(!kinds.length||/\bquer(?:y|ies)\b/i.test(task) ? '\n\n'+keeperQueryReport(evidence) : '');
}

function keeperOptReport(evidence:KeeperEvidence,kinds:string[]) {
  const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]{}|])/g,'\\$1');
  const records=evidence.records.filter(r=>keeperRecordInOptReview(r.kind,kinds));
  const lines=['## Requested OPT evidence','AI interpretation was unavailable. These are observed records, not an assessment that instructions were carried out.',`Extracted matching records: ${records.length}.`];
  if(!evidence.files.some(file=>file.kind==='xml'))lines.push('No XML file was supplied; an XML OPT inventory is unavailable.');
  let shown=0,used=lines.join('\n').length;
  for(const record of records){
    if(shown>=100||used>=180000)break;
    const file=evidence.files.find(f=>f.id===record.artifactId);
    const block=`\n### ${escape(record.kind)} — ${escape(record.id)}\nSource: ${escape(file?.name||record.artifactId)}, line ${record.line??'unknown'}.\n\n${escape(record.text.slice(0,5000))}${record.text.length>5000?' [Excerpt truncated; retrieve the complete record.]':''}\n${record.diagnostics.map(d=>escape(d.severity+': '+d.message)).join('\n')}`;
    lines.push(block);used+=block.length;shown++;
  }
  if(shown<records.length)lines.push(`Incomplete OPT report: showing ${shown} of ${records.length} extracted records. Remaining records require retrieval.`);
  if(evidence.files.some(file=>file.diagnostics.length))lines.push('File inspection has limitations; this is not confirmed complete coverage. See inspection diagnostics below.');
  for(const file of evidence.files)for(const diagnostic of file.diagnostics)lines.push(`Inspection limitation — ${escape(file.name)}: ${escape(diagnostic)}`);
  return lines.join('\n');
}

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
