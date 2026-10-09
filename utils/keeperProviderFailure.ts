export function keeperProviderFailure(error:unknown){
 const e=error as any,message=String(e?.message||'').toLowerCase();
 const status=Number(e?.status||e?.statusCode||e?.error?.code||0);
 if(/timed out|timeout|time budget|aborted/.test(message))return 'timeout';
 if(status===401||status===403||/api key not valid|invalid api key|permission_denied|unauthenticated/.test(message))return 'authentication_or_access';
 if(status===429||/resource_exhausted|quota|rate.limit/.test(message))return 'quota_or_rate_limit';
 if(status===404||/not found|not supported.*model|model.*not supported/.test(message))return 'model_unavailable';
 if(/empty model response/.test(message))return 'empty_response';
 if(/did not inspect|not retrieved|incomplete.*retrieval/.test(message))return 'evidence_not_retrieved';
 if(/tool.call limit|tool loop exhausted/.test(message))return 'tool_budget';
 return 'provider_error';
}
