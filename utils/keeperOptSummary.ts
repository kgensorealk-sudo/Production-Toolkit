import type {KeeperEvidence} from './keeperEvidence.js';

export function summarizeOptChanges(evidence: KeeperEvidence) {
  const files=evidence.files.filter(f=>f.kind==='xml');
  const rows=files.map(file=>{
    const records=evidence.records.filter(r=>r.artifactId===file.id);
    const count=(kind:string)=>{
      const hits=records.filter(r=>r.kind===kind);
      return {tags:hits.length,flagged:hits.filter(r=>r.diagnostics.some(d=>d.severity==='error')).length,whitespaceOnly:hits.filter(r=>/^\s+$/.test(r.text)).length};
    };
    return {artifactId:file.id,name:file.name,complete:file.inspectionStatus!=='failed' && file.diagnostics.length===0,diagnostics:file.diagnostics,inserted:count('opt_ins'),deleted:count('opt_del')};
  });
  return {files:rows,complete:rows.length>0 && rows.every(f=>f.complete),inserted:rows.reduce((n,f)=>n+f.inserted.tags,0),deleted:rows.reduce((n,f)=>n+f.deleted.tags,0),unit:'OPT tag occurrences, not words or verified completed edits'};
}

export function requestsOptTagCounts(text:string) {
  return text.split(/\b(?:and|also|then)\b/i).some(part=>{
    if(/\b(?:words?|characters?|letters?|sentences?|authors?|references?|citations?|affiliations?|equations?|rows?|columns?|cells?|pages?|paragraphs?|sections?|tables?|figures?|comments?|quer(?:y|ies))\b|\b(?:for|within|under|in)\s+q\d+\b/i.test(part))return false;
    return /\b(?:how\s+many|count|counts|number\s+of|total)\b/i.test(part) && /\b(?:insert(?:ed|ion|ions|s)?|delet(?:e|ed|ion|ions|es)|opt_ins|opt_del)\b/i.test(part);
  });
}
export function isOptCountRequest(text:string) {
  if (/\b(?:words?|characters?|letters?|sentences?|q\d+|quer(?:y|ies)|paragraphs?|sections?|tables?|figures?)\b/i.test(text)) return false;
  return text.length<600 && requestsOptTagCounts(text) && !/\b(?:also|then|as\s+well|and\s+(?:review|check|explain|compare|list|show))\b/i.test(text);
}

export function renderOptCounts(result:ReturnType<typeof summarizeOptChanges>) {
  if(!result.files.length) return 'Insertion/deletion counts are unavailable: no XML file was supplied. A PDF query report does not establish XML OPT counts.';
  const lines=[result.complete ? `Inserted: **${result.inserted}** \`opt_INS\` tags. Deleted: **${result.deleted}** \`opt_DEL\` tags.` : `Exact insertion/deletion counts are unavailable because XML inspection is incomplete. Observed so far: **${result.inserted}** insertion tags and **${result.deleted}** deletion tags; these are not confirmed totals.`];
  for(const file of result.files) {
    const name=file.name.replace(/[\\`*_[\]<>]/g,'\\$&');
    lines.push(`\n${name}: ${file.inserted.tags} insertion tags; ${file.deleted.tags} deletion tags${file.complete?'':' (incomplete inspection)'}.`);
    for(const diagnostic of file.diagnostics) lines.push(`Inspection note: ${diagnostic.replace(/[\\`*_[\]<>]/g,'\\$&')}`);
    if(file.inserted.flagged+file.deleted.flagged) lines.push(`${file.inserted.flagged+file.deleted.flagged} insertion/deletion tags are flagged as errors and are included in these occurrence counts.`);
    if(file.inserted.whitespaceOnly+file.deleted.whitespaceOnly) lines.push(`${file.inserted.whitespaceOnly+file.deleted.whitespaceOnly} tags contain only whitespace and may represent intentional spacing.`);
  }
  lines.push('\nCounts represent XML tag occurrences, not words, characters, or confirmation that edits were applied.');
  return lines.join('\n');
}
