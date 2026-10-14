import {CANDIDATE_MODELS} from './keeperEngine.js';

export type KeeperFailurePhase='provider_request'|'response_parsing'|'schema_validation'|'proposal_finalization'|'evidence_validation'|'tool_execution'|'unknown';
type Category='none'|'timeout'|'rate_limit_or_quota'|'quota_exceeded'|'authentication_or_access'|'model_unavailable'|'provider_unavailable'|'provider_error'|'parsing_failure'|'schema_rejection'|'proposal_rejected'|'evidence_rejected'|'tool_failure'|'unknown';
export interface KeeperDiagnosticAttempt {provider:string;model:string;phase:KeeperFailurePhase;outcome:'success'|'failed';elapsedMs:number;error?:unknown}
const phases=new Set<string>(['provider_request','response_parsing','schema_validation','proposal_finalization','evidence_validation','tool_execution','unknown']);
// Codes, unlike arbitrary exception strings, must match a reviewed finite vocabulary.
const codes=new Set(['RESOURCE_EXHAUSTED','INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','UNAVAILABLE','INTERNAL','DEADLINE_EXCEEDED','CANCELLED','UNKNOWN','insufficient_quota','rate_limit_exceeded','invalid_api_key','model_not_found','context_length_exceeded','billing_hard_limit_reached','server_error','invalid_request_error']);
const schemaErrors=new Set(['Invalid Keeper final proposal fields.','Invalid Keeper final proposal.','Invalid Keeper finding proposal.','Invalid evidence citation link.','Keeper final proposal is too large.']);
function read(value:unknown,key:string):unknown {try{return value&&typeof value==='object'?(value as Record<string,unknown>)[key]:undefined;}catch{return undefined;}}
function message(error:unknown){const value=read(error,'message');return typeof value==='string'?value:'';}
export function keeperFailurePhase(phase:KeeperFailurePhase,error:unknown):KeeperFailurePhase {
    if(phase==='provider_request'&&read(error,'name')==='SyntaxError')return 'response_parsing';
    if(phase!=='proposal_finalization')return phases.has(phase)?phase:'unknown';
    const text=message(error);
    if(text==='Keeper final answer must be a validated proposal, not free text.')return 'response_parsing';
    return schemaErrors.has(text)?'schema_validation':phase;
}
function failure(error:unknown,phase:KeeperFailurePhase):{category:Category;httpStatus?:number;providerCode?:string}{
    // Local errors cannot manufacture provider status/code metadata.
    if(phase!=='provider_request')return {category:phase==='response_parsing'?'parsing_failure':phase==='schema_validation'?'schema_rejection':phase==='proposal_finalization'?'proposal_rejected':phase==='evidence_validation'?'evidence_rejected':phase==='tool_execution'?'tool_failure':'unknown'};
    const nested=read(error,'error'),response=read(error,'response');
    const status=[read(error,'status'),read(error,'statusCode'),read(error,'code'),read(nested,'code'),read(response,'status')].find(value=>typeof value==='number'&&Number.isInteger(value)&&value>=100&&value<=599) as number|undefined;
    const providerCode=[read(error,'code'),read(nested,'code'),read(nested,'status'),read(error,'status'),read(error,'type')].find(value=>typeof value==='string'&&codes.has(value)) as string|undefined;
    let category:Category='provider_error';
    if(read(error,'name')==='AbortError'||/timed out|timeout|aborted/i.test(message(error))||message(error)==='Keeper request time budget exhausted.'||providerCode==='DEADLINE_EXCEEDED')category='timeout';
    else if(providerCode==='insufficient_quota'||providerCode==='billing_hard_limit_reached')category='quota_exceeded';
    else if(status===429||providerCode==='RESOURCE_EXHAUSTED'||providerCode==='rate_limit_exceeded')category='rate_limit_or_quota';
    else if(status===401||status===403||['UNAUTHENTICATED','PERMISSION_DENIED','invalid_api_key'].includes(providerCode||''))category='authentication_or_access';
    else if(status===404||providerCode==='NOT_FOUND'||providerCode==='model_not_found')category='model_unavailable';
    else if((status!==undefined&&status>=500)||providerCode==='UNAVAILABLE'||providerCode==='INTERNAL')category='provider_unavailable';
    return {category,...(status!==undefined?{httpStatus:status}:{}),...(providerCode?{providerCode}:{})};
}
export function keeperProviderDiagnosticEvents(requestId:string,attempts:readonly KeeperDiagnosticAttempt[]){
    const correlationId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)?requestId:'unavailable';
    return attempts.map((attempt,index)=>{
        const allowed=CANDIDATE_MODELS.some(candidate=>candidate.provider===attempt.provider&&candidate.model===attempt.model);
        const outcome=attempt.outcome==='success'?'success':'failed';
        const phase=keeperFailurePhase(attempt.phase,attempt.error);
        const fallbackAttempted=index+1<attempts.length;
        // Explicit field construction only: no error objects, messages, headers or document data.
        return {event:'keeper_provider_attempt',version:1,requestId:correlationId,provider:allowed?attempt.provider:'unknown',model:allowed?attempt.model:'unknown',phase,outcome,...(outcome==='failed'?failure(attempt.error,phase):{category:'none' as const}),elapsedMs:Number.isFinite(attempt.elapsedMs)?Math.max(0,Math.floor(attempt.elapsedMs)):0,fallbackAttempted,fallbackOutcome:fallbackAttempted?(attempts.slice(index+1).some(next=>next.outcome==='success')?'succeeded':'failed'):'not_attempted'};
    });
}
