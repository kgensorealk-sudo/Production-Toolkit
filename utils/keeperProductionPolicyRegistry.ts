import type {KeeperEscalationType} from './keeperEscalationPolicies.js';

export interface KeeperJournalScopeAll {readonly kind:'all'}
export interface KeeperJournalScopeJournals {readonly kind:'journals';readonly journalIds:readonly string[]}
export type KeeperJournalScope=KeeperJournalScopeAll|KeeperJournalScopeJournals;
// Describes application-owned context only. No production caller binds one in Unit 3.
export type KeeperTrustedJournalContext={trusted:true;journalId:string;source:'application-bound'};
export interface KeeperProductionRuleRegistration {documentedSource:string;documentVersion:string;recordedAt:string;recordedBy:string;authorityReference:string}
export interface RegisteredKeeperProductionRule {
    ruleId:string;ruleCitation:string;title:string;appliesTo:ReadonlySet<KeeperEscalationType>;
    ruleVersion:string;effectiveFrom:string;effectiveUntil:string|null;journalScope:KeeperJournalScope;
    registrationProvenance:KeeperProductionRuleRegistration;supersedes:string|null;
}
export const REGISTERED_PRODUCTION_RULE_FIELDS=Object.freeze(['ruleVersion','effectiveFrom','effectiveUntil','journalScope','registrationProvenance','supersedes'] as const);
const requiredFields=['ruleId','ruleCitation','title','appliesTo',...REGISTERED_PRODUCTION_RULE_FIELDS];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const trimmed=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value===value.trim();
const placeholder=(value:string)=>/\b(?:pending|unknown|tbd|placeholder)\b/i.test(value);

// Input-derived UTC boundaries only; registration never reads the wall clock.
export function registeredRuleDateBoundary(value:unknown):number{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date.getTime():NaN;
}
function frozenTypes(values:Iterable<KeeperEscalationType>):ReadonlySet<KeeperEscalationType>{
    const set=new Set(values);
    const view:ReadonlySet<KeeperEscalationType>={get size(){return set.size;},has:value=>set.has(value),entries:()=>set.entries(),keys:()=>set.keys(),values:()=>set.values(),[Symbol.iterator]:()=>set[Symbol.iterator](),forEach:(callback,thisArg)=>set.forEach(value=>callback.call(thisArg,value,value,view)),union:other=>set.union(other),intersection:other=>set.intersection(other),difference:other=>set.difference(other),symmetricDifference:other=>set.symmetricDifference(other),isSubsetOf:other=>set.isSubsetOf(other),isSupersetOf:other=>set.isSupersetOf(other),isDisjointFrom:other=>set.isDisjointFrom(other)};
    return Object.freeze(view);
}
export function validateRegisteredProductionRule(rule:unknown):RegisteredKeeperProductionRule{
    if(!object(rule)||!requiredFields.every(field=>Object.hasOwn(rule,field)))throw Error('Registered production rules must carry the complete Unit 3 registration contract.');
    // Legacy source fields may accompany a registered record; canonical source comes from provenance.
    if(Object.keys(rule).some(key=>!requiredFields.includes(key)&&!['source','sourceVersion'].includes(key)))throw Error('Unexpected registered production rule field.');
    for(const key of ['ruleId','ruleCitation','title'])if(!trimmed(rule[key]))throw Error(`Invalid registered production rule ${key}.`);
    if(typeof rule.ruleVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(rule.ruleVersion))throw Error('Invalid registered production rule version.');
    const from=registeredRuleDateBoundary(rule.effectiveFrom),until=rule.effectiveUntil===null?Infinity:registeredRuleDateBoundary(rule.effectiveUntil);
    if(!Number.isFinite(from)||Number.isNaN(until)||until<=from)throw Error('Invalid registered production rule effective dates.');
    const scope=rule.journalScope;
    if(!object(scope)||!['all','journals'].includes(scope.kind as string)||!exactKeys(scope,scope.kind==='all'?['kind']:['kind','journalIds']))throw Error('Invalid registered production rule journal scope.');
    if(scope.kind==='journals'){
        const journalIds=scope.journalIds;
        if(!Array.isArray(journalIds)||!journalIds.length)throw Error('Invalid journal applicability identifiers.');
        // every() skips holes; require an own entry at every index before capture.
        for(let index=0;index<journalIds.length;index++)if(!Object.hasOwn(journalIds,index))throw Error('Invalid journal applicability identifiers.');
        if(!journalIds.every(trimmed)||new Set(journalIds).size!==journalIds.length)throw Error('Invalid journal applicability identifiers.');
    }
    const provenance=rule.registrationProvenance;
    const provenanceFields=['documentedSource','documentVersion','recordedAt','recordedBy','authorityReference'];
    if(!object(provenance)||!exactKeys(provenance,provenanceFields)||!provenanceFields.every(key=>trimmed(provenance[key])))throw Error('Incomplete registered production rule provenance.');
    for(const key of ['documentedSource','documentVersion','authorityReference'])if(placeholder(provenance[key] as string))throw Error('Placeholder registered production rule provenance.');
    const recordedAt=provenance.recordedAt as string;
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(recordedAt))throw Error('Invalid registration recordedAt.');
    const recorded=new Date(recordedAt);
    if(!Number.isFinite(recorded.getTime())||recorded.toISOString().slice(0,19)!==recordedAt.slice(0,19))throw Error('Invalid registration recordedAt calendar value.');
    if(rule.supersedes!==null&&(typeof rule.supersedes!=='string'||!/^[A-Za-z0-9._-]+@\d+\.\d+\.\d+$/.test(rule.supersedes)))throw Error('Invalid production rule supersession identity.');
    if(!object(rule.appliesTo)||typeof (rule.appliesTo as {[Symbol.iterator]?:unknown})[Symbol.iterator]!=='function'||typeof rule.appliesTo.has!=='function'||!Number.isSafeInteger(rule.appliesTo.size))throw Error('Invalid registered production rule appliesTo set.');
    const types=[...(rule.appliesTo as unknown as Iterable<KeeperEscalationType>)];
    if(!types.length||types.some(type=>!['jm_query','problem_task'].includes(type)))throw Error('Invalid registered production rule appliesTo types.');
    return Object.freeze({ruleId:rule.ruleId as string,ruleCitation:rule.ruleCitation as string,title:rule.title as string,appliesTo:frozenTypes(types),ruleVersion:rule.ruleVersion,effectiveFrom:rule.effectiveFrom as string,effectiveUntil:rule.effectiveUntil as string|null,journalScope:scope.kind==='all'?Object.freeze({kind:'all' as const}):Object.freeze({kind:'journals' as const,journalIds:Object.freeze([...(scope.journalIds as string[])])}),registrationProvenance:Object.freeze({...provenance}) as unknown as KeeperProductionRuleRegistration,supersedes:rule.supersedes as string|null});
}
export function registerKeeperProductionRules(candidates:readonly unknown[]):readonly RegisteredKeeperProductionRule[]{
    if(!Array.isArray(candidates))throw Error('Registered production rules require a candidate array.');
    const rules=candidates.map(validateRegisteredProductionRule),identities=new Map<string,RegisteredKeeperProductionRule>(),groups=new Map<string,RegisteredKeeperProductionRule[]>();
    for(const rule of rules){
        const identity=rule.ruleId+'@'+rule.ruleVersion;
        if(identities.has(identity))throw Error('Duplicate registered production rule version identity.');
        identities.set(identity,rule);groups.set(rule.ruleId,[...(groups.get(rule.ruleId)||[]),rule]);
    }
    for(const group of groups.values()){
        const heads=group.filter(rule=>rule.supersedes===null),successors=new Map<string,RegisteredKeeperProductionRule>();
        for(const rule of group){if(rule.supersedes===null)continue;
            const previous=identities.get(rule.supersedes);
            if(!previous)throw Error('Dangling production rule supersession chain.');
            if(previous.ruleId!==rule.ruleId)throw Error('Cross-rule production supersession chain.');
            if(successors.has(rule.supersedes))throw Error('Production supersession chain has multiple successors.');
            successors.set(rule.supersedes,rule);
        }
        if(heads.length!==1)throw Error('Production supersession chain must have exactly one head.');
        const visited=new Set<string>();let current:RegisteredKeeperProductionRule|undefined=heads[0];
        while(current){const identity=current.ruleId+'@'+current.ruleVersion;if(visited.has(identity))throw Error('Cyclic production supersession chain.');visited.add(identity);current=successors.get(identity);}
        if(visited.size!==group.length)throw Error('Production supersession chain does not cover every version.');
        for(const rule of group){if(rule.supersedes===null)continue;const previous=identities.get(rule.supersedes)!;
            if(previous.effectiveUntil===null||registeredRuleDateBoundary(previous.effectiveUntil)>registeredRuleDateBoundary(rule.effectiveFrom))throw Error('Invalid production supersession effective-window edge.');
        }
        const ordered=[...group].sort((a,b)=>registeredRuleDateBoundary(a.effectiveFrom)-registeredRuleDateBoundary(b.effectiveFrom));
        for(let index=1;index<ordered.length;index++)if(ordered[index-1].effectiveUntil===null||registeredRuleDateBoundary(ordered[index-1].effectiveUntil)>registeredRuleDateBoundary(ordered[index].effectiveFrom))throw Error('Overlapping registered production rule effective windows.');
    }
    return Object.freeze(rules);
}
