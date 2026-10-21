import {authorGroupLimits,evaluateAuthorGroup,incompleteAuthorGroup} from './keeperAuthorGroupEvaluation';
import type {AuthorGroupEvaluation} from './keeperAuthorGroupEvaluation';

export interface AuthorGroupRequest {requestId:number;bytes:ArrayBuffer;name:string;instructions:string}
export interface AuthorGroupResponse {requestId:number;result:AuthorGroupEvaluation}
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))).map(v=>v.toString(16).padStart(2,'0')).join('');
/** Also exported for tests of the actual worker protocol, without a browser database or provider. */
export async function processAuthorGroupRequest(request:AuthorGroupRequest):Promise<AuthorGroupResponse>{
 let result:AuthorGroupEvaluation;
 const bytes=request.bytes instanceof ArrayBuffer?new Uint8Array(request.bytes):null;
 if(!Number.isSafeInteger(request.requestId)||request.requestId<0||!bytes||bytes.length>authorGroupLimits.bytes||typeof request.instructions!=='string'||request.instructions.length>authorGroupLimits.instructions||typeof request.name!=='string'||request.name.length>200){
  return {requestId:request.requestId,result:incompleteAuthorGroup('Invalid or over-limit evaluation request.')};
 }
 const [sourceSha256,instructionsSha256]=await Promise.all([hash(bytes),hash(new TextEncoder().encode(request.instructions))]);
 try{result=evaluateAuthorGroup(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),request.instructions);}
 catch{result=incompleteAuthorGroup('Source is not valid UTF-8 XML.');}
 return {requestId:request.requestId,result:{...result,sourceSha256,instructionsSha256,sourceName:request.name,byteLength:bytes.length}};
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
 self.onmessage=(event:MessageEvent<AuthorGroupRequest>)=>{
  void processAuthorGroupRequest(event.data).then(response=>self.postMessage(response)).catch(()=>{
   self.postMessage({requestId:event.data?.requestId,result:incompleteAuthorGroup('Worker evaluation failed. No result was verified.')});
  });
 };
}
