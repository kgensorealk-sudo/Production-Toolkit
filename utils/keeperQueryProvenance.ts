import type {KeeperEvidence} from './keeperEvidenceCore';

export function keeperQueryProvenance(evidence:KeeperEvidence){
  const files=new Map(evidence.files.map(file=>[file.id,file]));
  const records=new Map(evidence.records.map(record=>[record.id,record]));
  return evidence.records.filter(record=>record.kind==='query').map(query=>{
    const xml=files.get(query.artifactId);
    const candidate=query.binding?.pdfRecordId?records.get(query.binding.pdfRecordId):undefined;
    const pdf=candidate?files.get(candidate.artifactId):undefined;
    const established=query.binding?.state==='established';
    const matched=!!(established&&xml?.kind==='xml'&&xml.inspectionStatus==='ready'&&xml.sha256&&candidate?.kind==='pdf_query'&&pdf?.kind==='pdf'&&pdf.inspectionStatus==='ready'&&pdf.sha256&&query.binding?.response?.trim()&&candidate.binding?.response===query.binding.response);
    return {query,xml,pdf:matched?pdf:undefined,pdfRecord:matched?candidate:undefined,response:matched?query.binding!.response!:undefined,
      matchStatus:established&&!matched?'unresolved':query.binding?.state||'unresolved',
      reason:established&&!matched?'Stored association lacks consistent XML/PDF response provenance. Reinspect the original sources.':query.binding?.reason||'No author response association is established.',
      authorAnswered:matched,editVerified:false as const};
  });
}
