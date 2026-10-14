import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import * as registry from '../utils/keeperProductionPolicyRegistry.ts';
import {KEEPER_ESCALATION_POLICIES,KEEPER_PRODUCTION_RULES,createEscalationPolicyEvaluator,createRegisteredEscalationEvaluator,evaluateEscalationAuthorization} from '../utils/keeperEscalationPolicies.ts';
import {buildKeeperEvidence} from '../utils/keeperEvidence.ts';
import {finalizeKeeperProposal,retainKeeperQuoteSlices} from '../utils/keeperAnswerEvidence.ts';
const {registerKeeperProductionRules,validateRegisteredProductionRule}=registry;
let cases=0;
const test=(name,run)=>{run();cases++;console.log('PASS '+name);};
const valid=(overrides={})=>({ruleId:'SYNTH-RULE-1',ruleCitation:'Synthetic Manual section 1 v1',title:'Synthetic rule',appliesTo:new Set(['jm_query','problem_task']),ruleVersion:'1.0.0',effectiveFrom:'2026-01-01',effectiveUntil:'2026-07-01',journalScope:{kind:'all'},registrationProvenance:{documentedSource:'Synthetic Production Policy Manual',documentVersion:'synthetic-1',recordedAt:'2025-12-01T00:00:00Z',recordedBy:'synthetic-test',authorityReference:'SYNTH-CHANGE-1'},supersedes:null,...overrides});
const inside=new Date('2026-06-01T00:00:00Z');
const activePolicy={...KEEPER_ESCALATION_POLICIES[0],effectiveFrom:'2000-01-01',effectiveUntil:null,allowedTypes:new Set(['jm_query','problem_task']),provenance:{source:'Synthetic policy',sourceVersion:'synthetic-1',recordedAt:'1999-12-01T00:00:00Z',recordedBy:'synthetic-test'}};
const legacy={ruleId:'SYNTH-RULE-1',ruleCitation:'Synthetic legacy citation',title:'Synthetic legacy',appliesTo:new Set(['jm_query']),source:'Synthetic source',sourceVersion:'synthetic-1'};
const proposal=(citation=valid().ruleCitation)=>({action:'propose_escalation',decision:'recommend_change',reason:'ambiguous_target',problemCategory:'ambiguous_target',escalationType:'jm_query',policyId:activePolicy.id,policyBasis:{ruleId:'SYNTH-RULE-1',ruleCitation:citation},references:[{}]});
const reject=(rules,pattern)=>{assert.throws(()=>registerKeeperProductionRules(rules),pattern);assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],rules),/registered|supersession|version|identity/i);};

test('R1 complete registration is deeply frozen and caller-isolated',()=>{
  const input=valid({journalScope:{kind:'journals',journalIds:['J-A']}}),output=registerKeeperProductionRules([input]);
  assert.equal(Object.isFrozen(output),true);assert.equal(Object.isFrozen(output[0]),true);assert.equal(Object.isFrozen(output[0].journalScope),true);assert.equal(Object.isFrozen(output[0].journalScope.journalIds),true);assert.equal(Object.isFrozen(output[0].registrationProvenance),true);assert.equal(Object.isFrozen(output[0].appliesTo),true);
  assert.throws(()=>output.push(valid()),TypeError);assert.throws(()=>{output[0].effectiveFrom='2000-01-01';},TypeError);assert.throws(()=>output[0].journalScope.journalIds.push('J-B'),TypeError);assert.equal(output[0].appliesTo.add,undefined);
  input.journalScope.journalIds[0]='J-B';input.registrationProvenance.authorityReference='changed';input.appliesTo.clear();input.ruleCitation='changed';
  assert.deepEqual(output[0].journalScope.journalIds,['J-A']);assert.equal(output[0].registrationProvenance.authorityReference,'SYNTH-CHANGE-1');assert.equal(output[0].appliesTo.has('jm_query'),true);assert.equal(output[0].ruleCitation,valid().ruleCitation);
  assert.equal(createRegisteredEscalationEvaluator([activePolicy],[valid()]).evaluateEscalationAuthorization(proposal(),inside).policyQualified,true);
});
test('R2 legacy/partial/null records cannot enter registered construction',()=>{
  assert.throws(()=>validateRegisteredProductionRule(legacy),/complete Unit 3 registration contract/);assert.throws(()=>validateRegisteredProductionRule(null),/registration contract/);assert.throws(()=>registerKeeperProductionRules(null),/candidate array/);
  for(const field of ['ruleVersion','effectiveFrom','effectiveUntil','journalScope','registrationProvenance','supersedes']){
    const partial=valid();delete partial[field];assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],[partial]),/Partially registered/);assert.throws(()=>validateRegisteredProductionRule(partial),/registration contract/);
  }
  assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],[{...legacy,ruleVersion:'1.0.0'}]),/Partially registered/);
  const inherited=Object.assign(Object.create({ruleVersion:'1.0.0'}),legacy);assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],[inherited]),/Partially registered/);
  for(const field of ['ruleId','ruleCitation','title','appliesTo']){const input=valid();delete input[field];reject([input],/registration contract/);}
});
test('R2 strict strings, versions, applicability and calendar dates',()=>{
  for(const field of ['ruleId','ruleCitation','title'])for(const value of ['',null,3,' padded '])reject([valid({[field]:value})],/Invalid registered production rule/);
  for(const version of ['1','1.0','v1.0.0','1.0.0-beta',null,' 1.0.0'])reject([valid({ruleVersion:version})],/version/);
  for(const date of [null,'','2026-02-30','2026-13-01','March 1, 2026',4])reject([valid({effectiveFrom:date})],/effective dates/);
  for(const date of ['','invalid','2026-02-30','2026-01-01','2025-12-31'])reject([valid({effectiveUntil:date})],/effective dates/);
  for(const types of [null,[],{},new Set(),new Set(['human_review']),new Set(['jm_query','made_up'])])reject([valid({appliesTo:types})],/appliesTo/);
  for(const supersedes of ['',4,'OTHER@bad','bad id@1.0.0'])reject([valid({supersedes})],/supersession/);
});
test('R2 provenance requires all fields, no placeholders and calendar-valid UTC timestamp',()=>{
  for(const field of ['documentedSource','documentVersion','recordedAt','recordedBy','authorityReference']){
    const missing=valid();delete missing.registrationProvenance[field];reject([missing],/provenance/);
    for(const value of ['',null,' padded '])reject([valid({registrationProvenance:{...valid().registrationProvenance,[field]:value}})],/provenance/);
  }
  for(const field of ['documentedSource','documentVersion','authorityReference'])for(const value of ['Pending','UNKNOWN','tbd','placeholder','Pending independent documentation'])reject([valid({registrationProvenance:{...valid().registrationProvenance,[field]:value}})],/Placeholder/);
  for(const recordedAt of ['2026-02-30T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:00:00+00:00','2026-01-01','invalid'])reject([valid({registrationProvenance:{...valid().registrationProvenance,recordedAt}})],/recordedAt/);
  assert.doesNotThrow(()=>validateRegisteredProductionRule(valid({registrationProvenance:{...valid().registrationProvenance,recordedAt:'2024-02-29T12:30:45.123456Z'}})));
  reject([valid({registrationProvenance:{...valid().registrationProvenance,extra:true}})],/provenance/);
});
test('R2 omitted asOf always uses wall-clock date; explicit boundaries fail closed',()=>{
  for(const [from,until,expected]of [['2020-01-01','2021-01-01',false],['2999-01-01',null,false],['2000-01-01',null,true]]){
    const evaluator=createRegisteredEscalationEvaluator([activePolicy],[valid({effectiveFrom:from,effectiveUntil:until})]);
    assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query').verified,expected);
    assert.equal(evaluator.evaluateEscalationAuthorization(proposal()).eligible,expected);
  }
  const evaluator=createRegisteredEscalationEvaluator([activePolicy],[valid()]);
  for(const [date,expected]of [['2025-12-31T23:59:59Z',false],['2026-01-01T00:00:00Z',true],['2026-06-30T23:59:59Z',true],['2026-07-01T00:00:00Z',false],['invalid',false]])assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',{asOf:new Date(date)}).verified,expected);
});
const version2=(overrides={})=>valid({ruleVersion:'2.0.0',ruleCitation:'Synthetic Manual section 1 v2',effectiveFrom:'2026-07-01',effectiveUntil:'2027-01-01',supersedes:'SYNTH-RULE-1@1.0.0',...overrides});
test('R3 active version is selected BEFORE exact citation comparison',()=>{
  const evaluator=createRegisteredEscalationEvaluator([activePolicy],[version2(),valid()]);
  const june={asOf:inside},august={asOf:new Date('2026-08-01')};
  assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',june).rule.ruleVersion,'1.0.0');
  assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',version2().ruleCitation,'jm_query',august).rule.ruleVersion,'2.0.0');
  assert.match(evaluator.verifyProductionRule('SYNTH-RULE-1',version2().ruleCitation,'jm_query',june).reason,/does not match/);
  assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',august).verified,false);
  const gap=createRegisteredEscalationEvaluator([activePolicy],[valid(),version2({effectiveFrom:'2026-09-01'})]);
  assert.match(gap.verifyProductionRule('SYNTH-RULE-1',version2().ruleCitation,'jm_query',august).reason,/is effective as of/);
  assert.equal(gap.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',august).verified,false);
});
test('R3 every invalid chain rejects the full batch on both construction paths',()=>{
  for(const rules of [
    [valid(),valid()], [valid(),version2({effectiveFrom:'2026-06-01'})], [valid(),version2({supersedes:'SYNTH-RULE-1@9.0.0'})],
    [valid(),version2({supersedes:null})], [valid({effectiveUntil:null}),version2()],
    [valid(),version2({ruleId:'OTHER'})], [valid({supersedes:'SYNTH-RULE-1@2.0.0'}),version2()],
    [valid(),version2(),version2({ruleVersion:'3.0.0',effectiveFrom:'2027-01-01',effectiveUntil:'2028-01-01'})],
    [valid(),version2({supersedes:'SYNTH-RULE-1@3.0.0'}),version2({ruleVersion:'3.0.0',effectiveFrom:'2027-01-01',effectiveUntil:'2028-01-01',supersedes:'SYNTH-RULE-1@2.0.0'})]
  ])reject(rules,/version|supersession|chain|window/);
  assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],[legacy,valid()]),/mixes legacy/);
  assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],[legacy,legacy]),/Duplicate/);
  assert.equal(createEscalationPolicyEvaluator([activePolicy],[legacy]).verifyProductionRule(legacy.ruleId,legacy.ruleCitation,'jm_query').verified,true);
  assert.equal(KEEPER_PRODUCTION_RULES.length,0);
});
test('R4 journal-specific rules need matching application-bound context',()=>{
  const evaluator=createRegisteredEscalationEvaluator([activePolicy],[valid({journalScope:{kind:'journals',journalIds:['J-A']}})]);
  const journal={trusted:true,journalId:'J-A',source:'application-bound'};
  assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',{asOf:inside,journal}).verified,true);
  assert.equal(evaluator.evaluateEscalationAuthorization(proposal(),inside,journal).eligible,true);
  for(const invalid of [undefined,null,'J-A',{},'application-bound',{...journal,trusted:false},{...journal,source:'request'},{...journal,journalId:'j-a'},{...journal,journalId:'J-B'},{...journal,journalId:' J-A'},{...journal,extra:true}]){
    const result=evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',{asOf:inside,journal:invalid});assert.equal(result.verified,false);assert.match(result.reason,/application-bound journal identity/);assert.equal(evaluator.evaluateEscalationAuthorization(proposal(),inside,invalid).eligible,false);
  }
  assert.equal(createRegisteredEscalationEvaluator([activePolicy],[valid()]).verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',{asOf:inside}).verified,true);
});
test('R4 malformed journal scopes are rejected at registration',()=>{
  for(const journalIds of [Array(1),['J-A',,]]){
    const input=valid({journalScope:{kind:'journals',journalIds}});
    assert.throws(()=>registerKeeperProductionRules([input]),/Invalid journal applicability identifiers/);
    assert.throws(()=>createEscalationPolicyEvaluator([activePolicy],[input]),/Invalid journal applicability identifiers/);
    assert.throws(()=>createRegisteredEscalationEvaluator([activePolicy],[input]),/Invalid journal applicability identifiers/);
  }
  for(const journalScope of [null,{},[],{kind:'unknown'},{kind:'all',journalIds:['J-A']},{kind:'journals',journalIds:[]},{kind:'journals',journalIds:['J-A','J-A']},{kind:'journals',journalIds:['']},{kind:'journals',journalIds:[' J-A']},{kind:'journals',journalIds:[2]},{kind:'journals',journalIds:'J-A'},{kind:'journals',journalIds:['J-A'],extra:true}])reject([valid({journalScope})],/journal/i);
});
test('R5 policy qualification remains separate and required before rule applicability',()=>{
  const inactive=createRegisteredEscalationEvaluator(KEEPER_ESCALATION_POLICIES,[valid()]);
  assert.match(inactive.evaluateEscalationAuthorization(proposal(),inside).reason,/policy is not active/);
  assert.equal(inactive.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',{asOf:inside}).verified,true);
  const expired=createRegisteredEscalationEvaluator([{...activePolicy,effectiveUntil:'2020-01-01'}],[valid()]);
  assert.match(expired.evaluateEscalationAuthorization(proposal(),inside).reason,/policy is not active/);
  const badRule=createRegisteredEscalationEvaluator([activePolicy],[valid({effectiveFrom:'2020-01-01',effectiveUntil:'2021-01-01'})]);
  assert.match(badRule.evaluateEscalationAuthorization(proposal(),inside).reason,/Production rule could not be verified/);
  const capturedPolicy={...activePolicy},captured=createRegisteredEscalationEvaluator([capturedPolicy],[valid()]);capturedPolicy.effectiveFrom=null;assert.equal(captured.evaluateEscalationAuthorization(proposal(),inside).eligible,true);
  assert.equal(KEEPER_ESCALATION_POLICIES[0].effectiveFrom,null);assert.equal(evaluateEscalationAuthorization(proposal(),inside).policyQualified,false);
});
test('R5 evaluator snapshots registered metadata and enforces type applicability',()=>{
  const input=valid({journalScope:{kind:'journals',journalIds:['J-A']},appliesTo:new Set(['problem_task'])});
  const evaluator=createEscalationPolicyEvaluator([activePolicy],[input]);
  const context={asOf:inside,journal:{trusted:true,journalId:'J-A',source:'application-bound'}};
  input.journalScope.journalIds[0]='J-B';input.registrationProvenance.documentedSource='changed';input.effectiveUntil='2026-02-01';input.appliesTo.clear();
  const result=evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'problem_task',context);
  assert.equal(result.verified,true);assert.equal(result.rule.source,'Synthetic Production Policy Manual');assert.equal(result.rule.sourceVersion,'synthetic-1');
  assert.equal(evaluator.verifyProductionRule('SYNTH-RULE-1',valid().ruleCitation,'jm_query',context).verified,false);
  assert.equal(evaluator.getEscalationPolicy(activePolicy.id).effectiveFrom,'2000-01-01');assert.equal(KEEPER_ESCALATION_POLICIES[0].effectiveFrom,null);
  assert.equal(createEscalationPolicyEvaluator(KEEPER_ESCALATION_POLICIES,[]).evaluateEscalationAuthorization(proposal(),inside).eligible,false);
});

const evidence=await buildKeeperEvidence([{id:'synthetic',name:'synthetic.xml',kind:'xml',content:'<article><opt_COMMENT>Review ambiguous target.</opt_COMMENT></article>'}]);
const record=evidence.records[0],slices=new Map();retainKeeperQuoteSlices(slices,[record]);
const finalContext={reviewId:'synthetic-review',evidence,retrieved:new Set([record.id]),slices,inspectionReads:1};
const finalProposal=(citation=valid().ruleCitation)=>({reviewId:finalContext.reviewId,findings:[{...proposal(citation),references:[{ref:'E1',sha256:evidence.files[0].sha256,field:'text',quote:record.text}]}],uncertainty:'ambiguous_target'});
const require=createRequire(import.meta.url);
function isolatedFinalizer(evaluator){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync('utils/keeperAnswerEvidence.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(exports,name=>name.includes('keeperEscalationPolicies')?{...evaluator,evaluateEscalationAuthorization:value=>evaluator.evaluateEscalationAuthorization(value,inside)}:require(name));return (value,context=finalContext)=>exports.finalizeKeeperProposal(JSON.stringify(value),context);}
test('R6 real finalizer enforces current version, evidence and unavailable authorization',()=>{
  const finalize=isolatedFinalizer(createRegisteredEscalationEvaluator([activePolicy],[valid(),version2()]));
  assert.match(finalize(finalProposal()).text,/Escalation proposed only; not created, sent, or authorized/);assert.match(finalize(finalProposal()).text,/Authorization: UNAVAILABLE/);
  assert.throws(()=>finalize(finalProposal(version2().ruleCitation)),/could not be verified/);
  const stale=finalProposal();stale.findings[0].references[0].sha256='stale';assert.throws(()=>finalize(stale),/cross-source/);
  const staleRequest={...finalProposal(),reviewId:'other-task'};assert.throws(()=>finalize(staleRequest),/cross-request/);
  const human=finalProposal();human.findings[0].escalationType='human_review';human.findings[0].policyBasis={requiresHumanPolicyReview:true};delete human.findings[0].policyId;
  assert.match(finalizeKeeperProposal(JSON.stringify(human),finalContext).text,/Human review proposed only/);assert.match(finalizeKeeperProposal(JSON.stringify(human),finalContext).text,/Authorization: UNAVAILABLE/);
  assert.throws(()=>finalizeKeeperProposal(JSON.stringify(finalProposal()),{...finalContext,policies:[activePolicy],productionRules:[valid()]}),/policy is not active/);
  const scoped=isolatedFinalizer(createRegisteredEscalationEvaluator([activePolicy],[valid({journalScope:{kind:'journals',journalIds:['J-A']}})]));
  assert.throws(()=>scoped(finalProposal(),{...finalContext,journal:{trusted:true,journalId:'J-A',source:'application-bound'}}),/application-bound journal identity/);
  const versionForgery=finalProposal();versionForgery.findings[0].policyBasis.ruleVersion='2.0.0';assert.throws(()=>finalize(versionForgery),/production rule/);
});
test('R7 single runtime dependency direction and no execution or runtime journal plumbing',()=>{
  const source=fs.readFileSync('utils/keeperProductionPolicyRegistry.ts','utf8'),ast=ts.createSourceFile('registry.ts',source,ts.ScriptTarget.Latest,true);
  const imports=ast.statements.filter(ts.isImportDeclaration);assert.equal(imports.length,1);assert.equal(imports[0].importClause.isTypeOnly,true);assert.equal(imports[0].moduleSpecifier.text,'./keeperEscalationPolicies.js');
  assert.doesNotMatch(source,/fetch|XMLHttpRequest|supabase|localStorage|indexedDB|process\.env|new Date\(\)/);
  assert.doesNotMatch(source,/KEEPER_ESCALATION_POLICIES/);
  for(const file of ['api/chat.ts','utils/chatHandler.ts','utils/keeperToolRunner.ts','utils/keeperAnswerEvidence.ts'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/verifyProductionRule\(|journalScope|KeeperTrustedJournalContext/);
  for(const name of ['registerAtRuntime','createRegisteredEscalationEvaluator','createEscalation','sendEscalation','persistEscalation','notifyJm'])assert.equal(registry[name],undefined);
  assert.equal(KEEPER_PRODUCTION_RULES.length,0);assert.equal(KEEPER_ESCALATION_POLICIES[0].effectiveFrom,null);
});
console.log(`${cases} Keeper production-registration groups passed.`);
