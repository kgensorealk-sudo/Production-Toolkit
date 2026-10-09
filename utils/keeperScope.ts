export const keeperScopeTool={
  name:'report_scope_limit',
  description:'State that the requested action is outside the available sandbox capabilities or cannot be established from available evidence. Use instead of unrelated evidence reads or pretending to complete a review. This ends the current request without claiming any editorial work was performed. For mixed requests, use the evidence tools for supported work and disclose unsupported parts in the final answer; end the request here only when no meaningful requested action can be completed.',
  parameters:{type:'object',properties:{status:{type:'string',enum:['out_of_scope','insufficient_evidence']},reason:{type:'string'},suggestedAction:{type:'string'}},required:['status','reason'],additionalProperties:false}
};
export function keeperScopeResult(args:unknown){
  if(!args||typeof args!=='object'||Array.isArray(args))return {error:'Invalid scope arguments.'};
  const a=args as Record<string,unknown>;
  if(Object.keys(a).some(k=>!['status','reason','suggestedAction'].includes(k))||!['out_of_scope','insufficient_evidence'].includes(String(a.status))||typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>1000||a.suggestedAction!==undefined&&(typeof a.suggestedAction!=='string'||a.suggestedAction.length>500))return {error:'Invalid scope arguments.'};
  return {status:a.status as 'out_of_scope'|'insufficient_evidence',reason:a.reason.trim(),suggestedAction:typeof a.suggestedAction==='string'?a.suggestedAction.trim():undefined};
}
export function renderKeeperScope(result:{status:string;reason:string;suggestedAction?:string}){
  const plain=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]{}])/g,'\\$1');
  return (result.status==='out_of_scope'?'This request is outside my available sandbox tools.':'I cannot establish this from the available evidence.')+'\n\n'+plain(result.reason)+(result.suggestedAction?'\n\nSuggested next step: '+plain(result.suggestedAction):'')+'\n\nThe requested action has not been completed.';
}
