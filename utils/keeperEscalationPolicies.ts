export type KeeperEscalationProblemCategory='ambiguous_target'|'conflicting_evidence'|'unresolved_response'|'insufficient_evidence'|'observed_difference';
export type KeeperEscalationType='jm_query'|'problem_task'|'human_review';
export type KeeperEscalationPolicyBasis={ruleId:string;ruleCitation:string}|{requiresHumanPolicyReview:true};
export interface KeeperEscalationPolicyProvenance {source:string;sourceVersion:string;recordedAt:string;recordedBy:string}
export interface KeeperEscalationPolicy {id:string;version:string;title:string;description:string;effectiveFrom:string|null;effectiveUntil:string|null;allowedTypes:ReadonlySet<KeeperEscalationType>;provenance:KeeperEscalationPolicyProvenance}
export interface KeeperProductionRule {ruleId:string;ruleCitation:string;title:string;appliesTo:ReadonlySet<KeeperEscalationType>;source:string;sourceVersion:string}
export interface ProductionRuleVerification {verified:boolean;rule?:KeeperProductionRule;reason:string}
export interface KeeperEscalationAuthorization {eligible:boolean;policyQualified:boolean;policyId?:string;policyTitle?:string;escalationType?:KeeperEscalationType;reason:string}

// A frozen Set still permits add/delete. Expose only read operations over a private copy.
function readonlySet<T>(values:Iterable<T>):ReadonlySet<T>{
    const set=new Set(values);
    const view:ReadonlySet<T>={
        get size(){return set.size;},has:value=>set.has(value),entries:()=>set.entries(),keys:()=>set.keys(),values:()=>set.values(),[Symbol.iterator]:()=>set[Symbol.iterator](),
        forEach:(callback,thisArg)=>set.forEach(value=>callback.call(thisArg,value,value,view)),
        union:other=>set.union(other),intersection:other=>set.intersection(other),difference:other=>set.difference(other),symmetricDifference:other=>set.symmetricDifference(other),
        isSubsetOf:other=>set.isSubsetOf(other),isSupersetOf:other=>set.isSupersetOf(other),isDisjointFrom:other=>set.isDisjointFrom(other)
    };
    return Object.freeze(view);
}
export const ALLOWED_PROBLEM_CATEGORIES=readonlySet<KeeperEscalationProblemCategory>(['ambiguous_target','conflicting_evidence','unresolved_response','insufficient_evidence','observed_difference']);
export const ALLOWED_ESCALATION_TYPES=readonlySet<KeeperEscalationType>(['jm_query','problem_task','human_review']);
export const KEEPER_ESCALATION_POLICIES:readonly KeeperEscalationPolicy[]=Object.freeze([Object.freeze({
    id:'jm-escalation-v1',version:'1.0.0',title:'Journal Manager escalation proposal',
    description:'Proposal only; does not create, send, execute, or authorize an escalation.',
    effectiveFrom:null,effectiveUntil:null,allowedTypes:readonlySet(ALLOWED_ESCALATION_TYPES),
    provenance:Object.freeze({source:'Pending independent documentation',sourceVersion:'unknown',recordedAt:new Date().toISOString(),recordedBy:'Keeper Phase 2B Unit 2'})
})]);
export const KEEPER_PRODUCTION_RULES:readonly KeeperProductionRule[]=Object.freeze([]);

const dateBoundary=(value:string|null)=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date.getTime():NaN;
};
export function isEscalationPolicyEffective(policy:KeeperEscalationPolicy,asOf:Date=new Date()):boolean{
    const from=dateBoundary(policy.effectiveFrom),until=policy.effectiveUntil===null?Infinity:dateBoundary(policy.effectiveUntil);
    return Number.isFinite(asOf.getTime())&&Number.isFinite(from)&&until>from&&from<=asOf.getTime()&&asOf.getTime()<until;
}
const exactKeys=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
export function validatePolicyBasis(basis:unknown,type:KeeperEscalationType):KeeperEscalationPolicyBasis{
    if(type==='human_review'){
        if(!exactKeys(basis,['requiresHumanPolicyReview'])||basis.requiresHumanPolicyReview!==true)throw Error('human_review requires requiresHumanPolicyReview: true without a production rule.');
        return {requiresHumanPolicyReview:true};
    }
    if(!exactKeys(basis,['ruleId','ruleCitation'])||typeof basis.ruleId!=='string'||!basis.ruleId.trim()||typeof basis.ruleCitation!=='string'||!basis.ruleCitation.trim())throw Error('Escalation requires an applicable production rule only (ruleId + ruleCitation).');
    return {ruleId:basis.ruleId,ruleCitation:basis.ruleCitation};
}
export interface KeeperEscalationProposal {action:string;decision:string;problemCategory?:KeeperEscalationProblemCategory;escalationType?:KeeperEscalationType;policyBasis?:KeeperEscalationPolicyBasis;policyId?:string;references:unknown[]}

// Application-owned dependency boundary, never wired to request/model JSON.
// Isolated evaluators let synthetic tests qualify proposals without activating shipped registries.
export function createEscalationPolicyEvaluator(policies:readonly KeeperEscalationPolicy[],rules:readonly KeeperProductionRule[]){
    const policyRecords=policies.map(policy=>Object.freeze({...policy,allowedTypes:readonlySet(policy.allowedTypes),provenance:Object.freeze({...policy.provenance})}));
    const ruleRecords=rules.map(rule=>Object.freeze({...rule,appliesTo:readonlySet(rule.appliesTo)}));
    if(new Set(policyRecords.map(p=>p.id)).size!==policyRecords.length||new Set(ruleRecords.map(r=>r.ruleId)).size!==ruleRecords.length)throw Error('Duplicate trusted escalation registry identity.');
    const getEscalationPolicy=(id:string)=>policyRecords.find(policy=>policy.id===id);
    const getProductionRule=(id:string)=>ruleRecords.find(rule=>rule.ruleId===id);
    const getActiveEscalationPolicies=(asOf:Date=new Date())=>policyRecords.filter(policy=>isEscalationPolicyEffective(policy,asOf));
    const escalationPolicyQualifies=(id:string,type:KeeperEscalationType,asOf:Date=new Date())=>{const policy=getEscalationPolicy(id);return !!policy&&isEscalationPolicyEffective(policy,asOf)&&policy.allowedTypes.has(type);};
    const verifyProductionRule=(ruleId:string,ruleCitation:string,type:KeeperEscalationType):ProductionRuleVerification=>{
        const rule=getProductionRule(ruleId);
        if(!rule)return {verified:false,reason:'Production rule is not in the trusted rule registry.'};
        if(rule.ruleCitation!==ruleCitation)return {verified:false,reason:'Production rule citation does not match the trusted record.'};
        if(!rule.appliesTo.has(type))return {verified:false,reason:'Production rule does not apply to this escalation type.'};
        return {verified:true,rule,reason:'Production rule verified against trusted registry.'};
    };
    // Eligibility is NOT human authorization. This function has no execution or persistence path.
    const evaluateEscalationAuthorization=(proposal:KeeperEscalationProposal,asOf:Date=new Date()):KeeperEscalationAuthorization=>{
        const reject=(reason:string):KeeperEscalationAuthorization=>({eligible:false,policyQualified:false,reason});
        if(!proposal||proposal.action!=='propose_escalation')return reject('Not an escalation proposal.');
        if(proposal.decision!=='recommend_change')return reject('Inconsistent Keeper action proposal.');
        if(!Array.isArray(proposal.references)||!proposal.references.length)return reject('Escalation requires source evidence.');
        if(!ALLOWED_PROBLEM_CATEGORIES.has(proposal.problemCategory!))return reject('Invalid escalation problem category.');
        if(!ALLOWED_ESCALATION_TYPES.has(proposal.escalationType!))return reject('Invalid escalation type.');
        let basis:KeeperEscalationPolicyBasis;try{basis=validatePolicyBasis(proposal.policyBasis,proposal.escalationType!);}catch(error){return reject((error as Error).message);}
        if(proposal.escalationType==='human_review'){
            if(Object.hasOwn(proposal,'policyId'))return reject('human_review must not include a policyId.');
            return {eligible:true,policyQualified:false,escalationType:'human_review',reason:'Human review proposed only; not policy-qualified, not JM escalation-authorized, and not executed. Explicit human authorization is required before any escalation is created or sent.'};
        }
        if(typeof proposal.policyId!=='string'||!proposal.policyId.trim())return reject('Escalation requires a policy id.');
        const policy=getEscalationPolicy(proposal.policyId);
        if(!policy)return reject('Unknown escalation policy.');
        if(!escalationPolicyQualifies(policy.id,proposal.escalationType!,asOf))return reject('Escalation policy is not active or applicable.');
        const ruleBasis=basis as {ruleId:string;ruleCitation:string};
        const check=verifyProductionRule(ruleBasis.ruleId,ruleBasis.ruleCitation,proposal.escalationType!);
        if(!check.verified)return reject('Production rule could not be verified: '+check.reason);
        return {eligible:true,policyQualified:true,policyId:policy.id,policyTitle:policy.title,escalationType:proposal.escalationType,reason:'Proposal is policy-qualified and rule-verified only. Explicit human authorization is still required; no escalation is created, sent, or executed.'};
    };
    return Object.freeze({getEscalationPolicy,getProductionRule,getActiveEscalationPolicies,escalationPolicyQualifies,verifyProductionRule,evaluateEscalationAuthorization});
}
const shipped=createEscalationPolicyEvaluator(KEEPER_ESCALATION_POLICIES,KEEPER_PRODUCTION_RULES);
export const {getEscalationPolicy,getProductionRule,getActiveEscalationPolicies,escalationPolicyQualifies,verifyProductionRule,evaluateEscalationAuthorization}=shipped;
