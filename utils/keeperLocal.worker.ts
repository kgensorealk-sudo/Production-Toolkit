import {buildKeeperEvidence} from './keeperEvidenceCore';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
self.onmessage=async(event)=>{
  if(event.data?.kind!=='keeper-inspect')return;
  try {
    const evidence=await buildKeeperEvidence(event.data.artifacts,Date.now()+120000,{
      hash:async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(b=>b.toString(16).padStart(2,'0')).join(''),
      pdf:async()=>pdfjs,
    });
    self.postMessage({kind:'keeper-result',evidence});
  } catch {self.postMessage({kind:'keeper-result',error:'Local inspection failed. No files were transmitted.'});}
};
