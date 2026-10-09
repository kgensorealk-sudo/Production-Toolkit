import {ZipReader,BlobReader,configure} from '@zip.js/zip.js';
import type {KeeperArtifact} from './keeperEvidenceCore';
configure({useWebWorkers:false});
export async function unpackKeeperZip(blob:Blob){
  if(blob.size>25*1024*1024)throw Error('ZIP exceeds the local 25 MiB limit.');
  const reader=new ZipReader(new BlobReader(blob),{strictness:'strict'});
  try{
    const entries=[];let expanded=0;
    for await(const entry of reader.getEntriesGenerator()){
      entries.push(entry);
      if(entries.length>1000)throw Error('ZIP exceeds 1,000 entries.');
      const name=entry.filename.replace(/\\/g,'/');
      if(name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(p=>p==='..'||p==='.')||name.includes('\0'))throw Error('Unsafe ZIP path.');
      if(entry.encrypted||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw Error('Encrypted entries and symlinks are unsupported.');
      expanded+=entry.uncompressedSize;
      if(!Number.isSafeInteger(expanded)||expanded>64*1024*1024)throw Error('ZIP exceeds 64 MiB expanded size.');
    }
    const files=entries.filter(e=>!e.directory);
    const basename=(s:string)=>s.replace(/\\/g,'/').split('/').pop()!.toLowerCase();
    const xmls=files.filter(e=>/^[a-z][a-z0-9]*_\d+\.xml$/i.test(basename(e.filename)));
    const reports=files.filter(e=>/_edit_report\.pdf$/i.test(e.filename));
    const orders=files.filter(e=>/\.order$/i.test(e.filename));
    const issues:string[]=[];
    if(xmls.length!==1)issues.push(xmls.length?'Multiple article XML candidates; attach the intended XML manually.':'Missing production article XML; attach it manually.');
    const xml=xmls.length===1?xmls[0]:undefined;
    const stem=xml?basename(xml.filename).slice(0,-4):null;
    const pdfs=stem?reports.filter(e=>basename(e.filename)===stem+'_edit_report.pdf'):[];
    const matchingOrders=stem?orders.filter(e=>basename(e.filename)===stem+'.order'):[];
    if(pdfs.length!==1)issues.push('Missing or ambiguous matching edit-report PDF.');
    if(matchingOrders.length!==1)issues.push('Missing or ambiguous matching ORDER file.');
    const artifacts:KeeperArtifact[]=[];
    let actual=0;
    for(const entry of [xml,pdfs.length===1?pdfs[0]:undefined].filter(e=>e!==undefined)){
      if(entry.uncompressedSize>4_000_000)throw Error('Selected XML/PDF exceeds the current 4 MB inspection limit.');
      const chunks:Uint8Array[]=[];let size=0;
      await entry.getData(new WritableStream<Uint8Array>({write(chunk){
        size+=chunk.length;actual+=chunk.length;
        if(size>4_000_000||actual>8_000_000)throw Error('Extracted data exceeds the inspection limit.');
        chunks.push(chunk.slice());
      }}),{checkSignature:true});
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const kind=/\.pdf$/i.test(entry.filename)?'pdf':'xml';let content='';
      if(kind==='xml')content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      else{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));content=btoa(binary);}
      const identityBytes=await new Blob([kind+'\0'+entry.filename.replace(/\\/g,'/')+'\0',bytes]).arrayBuffer();
      const identity=new Uint8Array(await crypto.subtle.digest('SHA-256',identityBytes));
      artifacts.push({id:'source-'+Array.from(identity).map(byte=>byte.toString(16).padStart(2,'0')).join(''),name:entry.filename,kind,content});
    }
    return {artifacts,issues,files:files.map(e=>({name:e.filename,size:e.uncompressedSize})),orderPresent:matchingOrders.length===1};
  }finally{await reader.close();}
}
