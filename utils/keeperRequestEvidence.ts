import type {KeeperEvidence} from './keeperEvidenceCore';
import {planKeeperReviewBatch,type KeeperReviewCursor} from './keeperReviewBatch';
import {isOptCountRequest} from './keeperOptSummary';

export function keeperTaskQuestion(instructions:string,prompt:string,cursor?:KeeperReviewCursor){
  if(cursor)return cursor.question;
  const rule=instructions.trim();
  let request=prompt.trim();
  // Fresh review may reuse a stored canonical question after instructions change.
  const marker='\n\nRequest:\n';
  if(request.startsWith('Task instructions:\n')&&request.includes(marker))request=request.slice(request.indexOf(marker)+marker.length);
  if(!rule)return request;
  if(!request||request===rule)return rule;
  const prefix=`Task instructions:\n${rule}\n\n`;
  return request.startsWith(prefix)?request:prefix+`Request:\n${request}`;
}
export const keeperRecordLength=(record:KeeperEvidence['records'][number])=>record.contentLength??Math.max(record.source.length,record.text.length,record.binding?.response?.length||0);
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
// Leave room for messages, instructions and the cursor inside the 4 MB API limit.
export function prepareKeeperRequestEvidence(evidence:KeeperEvidence,question:string,cursor?:KeeperReviewCursor):KeeperEvidence{
  if(bytes(evidence)<=2800000)return evidence;
  const plan=planKeeperReviewBatch(evidence,question,cursor);
  const selected=new Set(plan?.evidence.records.map(record=>record.id)||[]);
  const queries=[...question.matchAll(/\bq\d+\b/gi)].map(match=>match[0].toLowerCase());
  if(!plan&&!isOptCountRequest(question)){
    for(const record of evidence.records)if(queries.includes((record.queryId||'').toLowerCase()))selected.add(record.id);
    if(!selected.size)throw Error('This inventory is too large for one request. Ask to review every query, review all OPT changes, or name specific query IDs so Keeper can retrieve a bounded selection.');
  }
  for(const record of evidence.records)if(selected.has(record.id)&&record.binding?.pdfRecordId)selected.add(record.binding.pdfRecordId);
  const projected={...evidence,records:evidence.records.map(record=>{
    if(selected.has(record.id))return record;
    return {...record,source:'',text:'',context:undefined,
      binding:record.binding?{...record.binding,response:undefined}:undefined,
      contentOmitted:true,contentLength:keeperRecordLength(record),
      whitespaceOnly:/^\s+$/.test(record.text)};
  })};
  if(bytes(projected)>2800000)throw Error('The selected evidence or inventory metadata exceeds the safe request size. Use fewer source files or a more specific query request; no evidence has been silently truncated.');
  return projected;
}
