import {scanReferenceXml} from './referenceUpdaterXml';
import type {ReferenceXmlNode as Node} from './referenceUpdaterXml';

export const authorGroupLimits = Object.freeze({bytes:4_000_000,instructions:20_000,nodes:20_000,depth:64,authors:500,findings:200,evidence:2000,timeoutMs:15_000});
export interface EvaluationEvidence {source:'xml'|'instructions';start:number;end:number;line:number;column:number;quote:string;truncated:boolean}
export interface EvaluationFinding {code:string;severity:'HOLD'|'INCOMPLETE';message:string;authorId:string|null;evidence:EvaluationEvidence[]}
export interface EvaluatedAuthor {order:number;id:string;authorId:string;givenName:string;surname:string;name:string;affiliations:string[];correspondence:string[];emails:string[];evidence:EvaluationEvidence}
export interface NameCorrection {authorId:string|null;before:string|null;after:string|null;alreadyPresent:boolean;evidence:EvaluationEvidence[]}
export interface AuthorGroupEvaluation {
 schemaVersion:1;profile:'Elsevier lexical article';sourceSha256:string;instructionsSha256:string;sourceName:string;byteLength:number;
 AUTHOR_GROUP_INTEGRITY:'PASS'|'HOLD'|'INCOMPLETE';AUTHOR_NAME_CORRECTIONS_FOUND:number;AUTHOR_NAME_CHANGES_ALREADY_PRESENT:number;AUTHOR_NAME_CHANGES_APPLIED:0;
 AUTHOR_NAME_HISTORY:'VERIFIED'|'NOT_DETERMINABLE';AUTHOR_GROUP_HOLD:string[];MANUAL_AUTHOR_GROUP_REVIEW:'REQUIRED'|'NOT_REQUIRED';
 countsComplete:boolean;historyScope:string;authors:EvaluatedAuthor[];findings:EvaluationFinding[];corrections:NameCorrection[];
 checks:{name:string;status:'PASS'|'HOLD'|'INCOMPLETE'|'NOT_APPLICABLE';detail:string}[];
}
const norm=(s:string)=>s.normalize('NFC').replace(/\s+/gu,' ').trim();
const opt=(n:Node)=>n.name.toLowerCase();
export function incompleteAuthorGroup(message:string):AuthorGroupEvaluation {
 return {schemaVersion:1,profile:'Elsevier lexical article',sourceSha256:'',instructionsSha256:'',sourceName:'',byteLength:0,AUTHOR_GROUP_INTEGRITY:'INCOMPLETE',AUTHOR_NAME_CORRECTIONS_FOUND:0,AUTHOR_NAME_CHANGES_ALREADY_PRESENT:0,AUTHOR_NAME_CHANGES_APPLIED:0,AUTHOR_NAME_HISTORY:'NOT_DETERMINABLE',AUTHOR_GROUP_HOLD:[message],MANUAL_AUTHOR_GROUP_REVIEW:'REQUIRED',countsComplete:false,historyScope:'No historical completeness established.',authors:[],findings:[{code:'INPUT',severity:'INCOMPLETE',message,authorId:null,evidence:[]}],corrections:[],checks:[]};
}
/** Pure, read-only assessment. Fingerprints are supplied by the byte-owning worker, not inferred from normalized text. */
export function evaluateAuthorGroup(xml:string,instructions=''):AuthorGroupEvaluation {
 const result=incompleteAuthorGroup('');result.findings=[];result.AUTHOR_GROUP_HOLD=[];result.countsComplete=true;
 const started=Date.now();let evidenceUnits=0;
 const corrections=new Map<string,NameCorrection>();
 const guard=()=>{if(Date.now()-started>authorGroupLimits.timeoutMs)throw Error('Evaluation work budget exceeded.');};
 const lineStarts=(s:string)=>{const a=[0];for(let i=0;i<s.length;i++)if(s[i]==='\n')a.push(i+1);return a;};
 let xmlLines:number[]=[],instructionLines:number[]=[];
 const evidence=(start:number,end:number,source:'xml'|'instructions'='xml'):EvaluationEvidence=>{
  if(++evidenceUnits>authorGroupLimits.evidence)throw Error('Evidence budget exceeded.');
  const s=source==='xml'?xml:instructions,lines=source==='xml'?xmlLines:instructionLines;
  let lo=0,hi=lines.length;while(lo<hi){const m=(lo+hi)>>>1;if(lines[m]<=start)lo=m+1;else hi=m;}
  return {source,start,end,line:lo,column:start-(lines[lo-1]||0)+1,quote:s.slice(start,Math.min(end,start+1200)),truncated:end-start>1200};
 };
 const ev=(n:Node)=>evidence(n.start,n.end);
 const issue=(code:string,message:string,n?:Node,authorId:string|null=null,severity:'HOLD'|'INCOMPLETE'='HOLD',extra:EvaluationEvidence[]=[])=>{
  if(result.findings.length>=authorGroupLimits.findings)throw Error('Finding budget exceeded.');
  result.findings.push({code,severity,message,authorId,evidence:[...(n?[ev(n)]:[]),...extra]});
 };
 try {
  if(typeof xml!=='string'||typeof instructions!=='string'||xml.length>authorGroupLimits.bytes||new TextEncoder().encode(xml).length>authorGroupLimits.bytes||instructions.length>authorGroupLimits.instructions)throw Error('Input exceeds the XML or instruction limit.');
  xmlLines=lineStarts(xml);instructionLines=lineStarts(instructions);
  // Cheap preflight bounds the shared scanner, which intentionally remains unchanged.
  const markup=xml.match(/</g);if((markup?.length||0)>authorGroupLimits.nodes*3)throw Error('XML markup budget exceeded.');
  const parsed=scanReferenceXml(xml,{allowDuplicateIds:true});guard();
  const nodes=parsed.nodes;if(nodes.length>authorGroupLimits.nodes)throw Error('XML node budget exceeded.');
  const parents=new Map<Node,Node>(),children=new Map<Node,Node[]>(),stack:Node[]=[],roots:Node[]=[];
  const deleted=new Set<Node>(),commented=new Set<Node>();
  for(const n of nodes){
   while(stack.length&&stack[stack.length-1].end<=n.start)stack.pop();
   const p=stack[stack.length-1];if(p){parents.set(n,p);const c=children.get(p)||[];c.push(n);children.set(p,c);}else roots.push(n);
   if(opt(n)==='opt_del'||(p&&deleted.has(p)))deleted.add(n);
   if(opt(n)==='opt_comment'||(p&&commented.has(p)))commented.add(n);
   if(stack.length>authorGroupLimits.depth)throw Error('XML depth budget exceeded.');
   if(n.end>n.openEnd)stack.push(n);
  }
  if(roots.length!==1||roots[0].name!=='article')throw Error('Expected one Elsevier article root.');
  const root=roots[0];
  const declaration=xml.match(/^\uFEFF?\s*<\?xml[^?]*encoding\s*=\s*['"]([^'"]+)/i);
  if(declaration&&!/^utf-8$/i.test(declaration[1]))throw Error('Only UTF-8 XML is supported.');
  for(const n of nodes){if(n.attributes['xmlns:ce']&&n.attributes['xmlns:ce']!=='http://www.elsevier.com/xml/common/dtd')throw Error('Conflicting ce namespace mapping; unsupported profile.');if(n.attributes.xmlns)throw Error('Default namespaces are outside the supported lexical article profile.');}
  const gapText=(value:string)=>value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|([^<]+)/g,(_all,cdata:string|undefined,plain:string|undefined)=>cdata!==undefined?cdata:plain!==undefined?parsed.textValue(plain):'');
  const textCache=new Map<Node,string>(),beforeCache=new Map<Node,string>();
  const text=(n:Node,before=false):string=>{
   const cache=before?beforeCache:textCache;if(cache.has(n))return cache.get(n)!;
   if(opt(n)==='opt_comment'||opt(n)===(before?'opt_ins':'opt_del'))return '';
   let value='',at=n.openEnd;
   for(const c of children.get(n)||[]){value+=gapText(xml.slice(at,c.start));value+=text(c,before);at=c.end;}
   value+=gapText(xml.slice(at,n.closeStart));cache.set(n,value);return value;
  };
  const active=(n:Node)=>!deleted.has(n)&&!commented.has(n);
  const ancestor=(n:Node,name:string):Node|undefined=>{for(let p=parents.get(n);p;p=parents.get(p))if(p.name===name)return p;return undefined;};
  const nearestGroup=(n:Node)=>ancestor(n,'ce:author-group');
  const groups=nodes.filter(n=>n.name==='ce:author-group'&&active(n)&&!ancestor(n,'ce:bibliography')&&!ancestor(n,'ce:bib-reference')&&!ancestor(n,'body')&&!ancestor(n,'tail')&&!ancestor(n,'ce:section'));
  if(!groups.length)throw Error('No supported front-matter author group found.');
  for(const g of groups){const p=parents.get(g);if(p!==root&&p?.name!=='head'&&p?.name!=='ce:author-group')issue('PROFILE','Unsupported front-matter group container.',g,null,'INCOMPLETE');}
  for(const n of nodes)if(active(n)&&['ce:collaboration','ce:anonymous-author'].includes(n.name)&&groups.includes(nearestGroup(n)!))issue('PROFILE','Collective/anonymous authors require a separately supported identity rule.',n,null,'INCOMPLETE');
  const authorNodes=nodes.filter(n=>n.name==='ce:author'&&active(n)&&groups.includes(nearestGroup(n)!));
  if(!authorNodes.length)issue('AUTHORS','Author group contains no current authors.',groups[0]);
  if(authorNodes.length>authorGroupLimits.authors)throw Error('Author limit exceeded.');
  const idOwners=new Map<string,Node[]>(),identityOwners=new Map<string,Node>(),nameOwners=new Map<string,Node>();
  for(const n of nodes)if(active(n)&&n.attributes.id){const list=idOwners.get(n.attributes.id)||[];list.push(n);idOwners.set(n.attributes.id,list);}
  const owned=new Map<Node,Node[]>();for(const n of nodes){const a=ancestor(n,'ce:author');if(a&&active(n)){const list=owned.get(a)||[];list.push(n);owned.set(a,list);}}
  const fieldNodes=(a:Node,name:string)=>(children.get(a)||[]).flatMap(n=>opt(n)==='opt_ins'?(children.get(n)||[]):[n]).filter(n=>n.name===name&&active(n));
  const correction=(key:string,c:NameCorrection)=>{const prior=corrections.get(key);if(prior)prior.evidence.push(...c.evidence);else corrections.set(key,c);};
  const authorById=new Map<string,EvaluatedAuthor>();
  for(const [i,a] of authorNodes.entries()){
   guard();const id=a.attributes.id||'',aid=a.attributes['author-id']||'';
   const given=fieldNodes(a,'ce:given-name'),surnames=fieldNodes(a,'ce:surname');
   const g=given.map(n=>norm(text(n))).join(' '),s=surnames.map(n=>norm(text(n))).join(' ');
   const record:EvaluatedAuthor={order:i+1,id,authorId:aid,givenName:g,surname:s,name:norm(g+' '+s),affiliations:[],correspondence:[],emails:[],evidence:ev(a)};result.authors.push(record);
   if(id)authorById.set(id,record);
   if(!id)issue('IDENTITY','Author id is missing.',a);
   else if(idOwners.get(id)?.length!==1)issue('IDENTITY',`Author id ${id} is duplicated.`,a,id);
   if(id&&!/^[\p{L}_][\p{L}\p{N}_.:-]*$/u.test(id))issue('IDENTITY','Author id has an invalid lexical form.',a,id);
   if(!aid)issue('IDENTITY','Author author-id is missing.',a,id);
   else if(identityOwners.has(aid))issue('IDENTITY',`Duplicate author-id ${aid}.`,a,id);else identityOwners.set(aid,a);
   if(aid&&/\s/u.test(aid))issue('IDENTITY','Author author-id contains whitespace.',a,id);
   if(given.length!==1||surnames.length!==1||!g||!s)issue('NAME','Expected one nonempty current given-name and surname; unsupported or conflicting name structure.',a,id);
   for(const n of [...given,...surnames])if((children.get(n)||[]).some(c=>['ce:given-name','ce:surname','ce:author'].includes(c.name)))issue('PROFILE','Nested identity fields inside a name are unsupported.',n,id,'INCOMPLETE');
   if(record.name&&nameOwners.has(record.name))issue('IDENTITY',`Shared author name ${record.name} requires identity disambiguation.`,a,id);else nameOwners.set(record.name,a);
   const indexed=fieldNodes(a,'ce:indexed-name');if(indexed.length>1)issue('INDEXED_NAME','Multiple indexed-name fields are ambiguous.',a,id);
   for(const n of indexed){const actual=norm(text(n));const initials=g.split(/[\s-]+/u).filter(Boolean).map(v=>Array.from(v)[0]).join('');
    const suffix=actual.startsWith(s+',')?actual.slice(s.length+1):actual.startsWith(s+' ')?actual.slice(s.length+1):null;
    if(suffix===null||suffix.replace(/[.\s-]/g,'')!==initials)issue('INDEXED_NAME',`Indexed name does not match surname and given-name initials (${s}, ${initials}).`,n,id);
   }
   const all=owned.get(a)||[];
   for(const n of all)if(/^opt_/i.test(n.name)&&!['opt_ins','opt_del','opt_comment'].includes(opt(n)))issue('PROFILE',`Unsupported author OPT markup ${n.name}.`,n,id,'INCOMPLETE');
   const links=all.filter(n=>['ce:cross-ref','ce:cross-refs'].includes(n.name));
   for(const link of links){const refs=(link.attributes.refid||'').trim().split(/\s+/).filter(Boolean);const href=link.attributes['xlink:href'];if(href){if(!href.startsWith('#'))issue('LINK','Unsupported nonlocal author link.',link,id,'INCOMPLETE');else try{refs.push(decodeURIComponent(href.slice(1)));}catch{issue('LINK','Invalid local link encoding.',link,id);}}
    if(!refs.length)issue('LINK','Author reference has no target.',link,id);
    for(const ref of new Set(refs)){const targets=idOwners.get(ref)||[];if(targets.length!==1){issue('LINK',`Reference ${ref} resolves to ${targets.length} targets.`,link,id);continue;}const target=targets[0];
     if(['ce:affiliation','ce:correspondence'].includes(target.name)){
      const group=nearestGroup(a),targetGroup=nearestGroup(target);let scoped=group===targetGroup;
      for(let p=group;p&&!scoped;p=nearestGroup(p))if(p===targetGroup)scoped=true;
      if(!scoped){issue('LINK',`Reference ${ref} is outside the author's group scope.`,link,id);continue;}
      const labelText=norm((children.get(target)||[]).filter(n=>n.name==='ce:label').map(n=>text(n)).join(' '));
      if(!norm(text(target))||(labelText&&norm(text(target))===labelText))issue('LINK',`Target ${ref} has no content beyond its label.`,target,id);
      (target.name==='ce:affiliation'?record.affiliations:record.correspondence).push(ref);
     }else if(!['ce:footnote','ce:biography'].includes(target.name))issue('LINK',`Reference ${ref} has unsupported target type ${target.name}.`,link,id);
    }
   }
   if(!record.affiliations.length)issue('AFFILIATION','No supported affiliation reference is linked to this author.',a,id);
   const ownEmails=all.filter(n=>n.name==='ce:e-address'&&n.attributes.type==='email');
   // An email in a shared correspondence note has ambiguous ownership; only a uniquely linked note can supply it.
   const noteEmails:Node[]=[];
   for(const ref of record.correspondence){const note=idOwners.get(ref)![0];const users=authorNodes.filter(other=>(owned.get(other)||[]).some(n=>(n.attributes.refid||'').split(/\s+/).includes(ref)||n.attributes['xlink:href']==='#'+ref));
    const emails=nodes.filter(n=>active(n)&&n.name==='ce:e-address'&&ancestor(n,'ce:correspondence')===note&&n.attributes.type==='email');if(users.length===1)noteEmails.push(...emails);else if(emails.length&&!ownEmails.length)issue('EMAIL','Shared correspondence email ownership is ambiguous.',note,id);
   }
   for(const email of [...ownEmails,...noteEmails]){const value=norm(text(email)),href=email.attributes['xlink:href'];record.emails.push(value);
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)|| (href!==undefined&&href!==`mailto:${value}`))issue('EMAIL','Email is empty, malformed, or differs from its mailto link.',email,id);
   }
   if(record.correspondence.length&&!record.emails.length)issue('EMAIL','Corresponding author has no independently owned email.',a,id);
   if(ownEmails.length&&!record.correspondence.length)issue('CORRESPONDENCE','Author email is present without a supported correspondence link.',a,id);
   if(Object.entries(a.attributes).some(([k,v])=>/corresp/i.test(k)||(/role|type|class/i.test(k)&&/corresp/i.test(v)))&&!record.correspondence.length)issue('CORRESPONDENCE','Corresponding-author marker lacks a supported correspondence link.',a,id);
   for(const name of ['ce:given-name','ce:surname','ce:indexed-name']){
    const wrappers=(children.get(a)||[]).filter(n=>['opt_ins','opt_del'].includes(opt(n))&&(children.get(n)||[]).some(c=>c.name===name));
    if(!wrappers.length)continue;
    const oldNodes=wrappers.filter(n=>opt(n)==='opt_del').flatMap(n=>(children.get(n)||[]).filter(c=>c.name===name));
    const newNodes=wrappers.filter(n=>opt(n)==='opt_ins').flatMap(n=>(children.get(n)||[]).filter(c=>c.name===name));
    const old=norm(oldNodes.map(n=>text(n,true)).join(' ')),next=norm(newNodes.map(n=>text(n)).join(' '));
    const verified=!!id&&idOwners.get(id)?.length===1&&wrappers.length===2&&oldNodes.length===1&&newNodes.length===1&&!!old&&!!next&&old!==next&&!wrappers.some(w=>(children.get(w)||[]).length!==1)&&!nodes.some(n=>wrappers.some(w=>n.start>w.start&&n.end<w.end)&&/^opt_/i.test(n.name));
    correction(`${id}:${name}:${old}:${next}`,{authorId:id||null,before:old||null,after:next||null,alreadyPresent:verified,evidence:wrappers.map(ev)});
    if(!verified)issue('HISTORY','Whole name-field OPT replacement lacks an unambiguous before/after pair.',wrappers[0],id);
   }
   for(const n of [...given,...surnames,...indexed]){
    const relevant=nodes.filter(c=>c.start>=n.openEnd&&c.end<=n.closeStart&&!commented.has(c)&&['opt_ins','opt_del'].includes(opt(c)));
    if(!relevant.length)continue;
    const old=norm(text(n,true)),current=norm(text(n));const hasIns=relevant.some(c=>opt(c)==='opt_ins'),hasDel=relevant.some(c=>opt(c)==='opt_del');
    const verified=!!id&&idOwners.get(id)?.length===1&&hasIns&&hasDel&&relevant.length===2&&!!old&&!!current&&old!==current&&!relevant.some(c=>ancestor(c,'opt_INS')||ancestor(c,'opt_DEL')||ancestor(c,'opt_ins')||ancestor(c,'opt_del'));
    correction(`${id}:${n.name}:${old}:${current}`,{authorId:id||null,before:old||null,after:current||null,alreadyPresent:verified,evidence:[ev(n)]});
    if(!verified)issue('HISTORY','Name OPT markup does not independently establish a before/after correction.',n,id);
   }
   if((children.get(a)||[]).some(n=>['opt_ins','opt_del'].includes(opt(n))&&(children.get(n)||[]).some(c=>c.name==='ce:author')))issue('HISTORY','Unsupported nested author replacement.',a,id,'INCOMPLETE');
  }
  // Structural author additions/removals/order edits cannot be treated as ordinary name substitutions.
  const structuralAuthorEdits=new Set<Node>();
  for(const n of nodes)if(n.name==='ce:author'&&!commented.has(n)){
   let group=nearestGroup(n);while(group&&!groups.includes(group))group=nearestGroup(group);if(!group)continue;
   for(let p=parents.get(n);p&&p!==group;p=parents.get(p))if(['opt_ins','opt_del'].includes(opt(p)))structuralAuthorEdits.add(p);
  }
  for(const n of structuralAuthorEdits)issue('HISTORY','Whole-author addition/removal requires independently bound order and identity evidence.',n,null,'INCOMPLETE');
  // Separate CRediT name references: bold Name: segments and structured ce:author names.
  const creditSections=nodes.filter(n=>n.name==='ce:section'&&active(n)&&(children.get(n)||[]).some(c=>c.name==='ce:section-title'&&/CRediT|authorship contribution/i.test(text(c))));
  for(const section of creditSections){
   const bold=nodes.filter(n=>n.name==='ce:bold'&&active(n)&&ancestor(n,'ce:section')===section&&/:\s*$/.test(text(n)));
   const structured=nodes.filter(n=>n.name==='ce:author'&&active(n)&&ancestor(n,'ce:section')===section);
   if((!bold.length&&!structured.length)||(bold.length&&structured.length)){issue('CREDIT','Present CRediT statement uses an unsupported or mixed name-reference structure.',section,null,'INCOMPLETE');continue;}
   const seen=new Set<string>();for(const n of [...bold,...structured]){const gs=fieldNodes(n,'ce:given-name'),ss=fieldNodes(n,'ce:surname');const name=n.name==='ce:author'?norm(gs.map(g=>text(g)).join(' ')+' '+ss.map(s=>text(s)).join(' ')):norm(text(n).replace(/:\s*$/,''));
    if(n.name==='ce:author'&&(gs.length!==1||ss.length!==1))issue('CREDIT','Ambiguous structured CRediT name.',n,null,'INCOMPLETE');
    if(!nameOwners.has(name)||seen.has(name))issue('CREDIT',`CRediT name ${name} is unmatched or duplicated.`,n);seen.add(name);}
   if(bold.length){let residual='';let at=section.openEnd;for(const n of bold){residual+=gapText(xml.slice(at,n.start).replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g,''));at=n.end;}residual+=gapText(xml.slice(at,section.closeStart).replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g,''));if(residual.includes(':'))issue('CREDIT','Unparsed CRediT name boundaries remain outside supported bold names.',section,null,'INCOMPLETE');}
   for(const a of result.authors)if(!seen.has(a.name))issue('CREDIT',`Author ${a.name} is missing from the CRediT name references.`,section,a.id);
  }
  // Explicit instructions use a deliberately closed, source-bound form. All other potentially relevant prose holds.
  const relevantInstruction=(value:string)=>/surname|given.name|indexed.name|author[^.\n]{0,60}(?:name|order|add|remov|replac|correct)|(?:change|correct|replac|reorder)[^.\n]{0,60}author|name\s+(?:change|correction)|^Author\s+[\w.:-]+:/i.test(value)||(/chang|correct|replac|spell|rename/i.test(value)&&result.authors.some(a=>[a.name,a.surname].some(name=>name.length>2&&norm(value).includes(name))));
  const inspectInstruction=(value:string,e:EvaluationEvidence)=>{
   if(!relevantInstruction(value))return;
   const m=value.trim().match(/^Author\s+([A-Za-z_][\w.:-]*):\s*replace\s+"([^"\n]+)"\s+with\s+"([^"\n]+)"\.?$/i);
   if(m){const [,id,old,next]=m;const record=authorById.get(id);const existing=[...corrections.entries()].find(([,c])=>c.authorId===id&&c.before===norm(old)&&c.after===norm(next));
    if(existing){existing[1].evidence.push(e);return;}
    const key=`instruction:${id}:${norm(old)}:${norm(next)}`;correction(key,{authorId:id,before:norm(old),after:norm(next),alreadyPresent:false,evidence:[e]});
    issue('HISTORY',record?`Requested name correction for ${id} has no independently verified before/after application.`:`Correction instruction references unknown author ${id}.`,undefined,id,'HOLD',[e]);
   }else{correction(`unresolved:${e.source}:${e.start}`,{authorId:null,before:null,after:null,alreadyPresent:false,evidence:[e]});issue('HISTORY','Potential author correction requires explicit identity and before/after evidence.',undefined,null,'HOLD',[e]);}
  };
  for(const n of nodes)if(opt(n)==='opt_comment'&&!ancestor(n,'ce:bibliography')&&!ancestor(n,'ce:bib-reference')){
   const value=parsed.textContent(n);if(relevantInstruction(value))inspectInstruction(value,ev(n));
  }
  let offset=0;for(const line of instructions.split('\n')){if(line.trim())inspectInstruction(line,evidence(offset,offset+line.length,'instructions'));offset+=line.length+1;}
  if(instructions.trim()&&!relevantInstruction(instructions))issue('INSTRUCTIONS','Supplied correction instructions cannot be bound to a supported author correction.',undefined,null,'INCOMPLETE',[evidence(0,instructions.length,'instructions')]);
  result.corrections=[...corrections.values()];
  const indexedPresent=authorNodes.some(a=>fieldNodes(a,'ce:indexed-name').length);
  const checks:[string,string[],boolean][]=[['Current names and order',['NAME','AUTHORS'],true],['Author identities',['IDENTITY'],true],['Indexed names',['INDEXED_NAME'],indexedPresent],['Affiliation and correspondence links',['LINK','AFFILIATION','CORRESPONDENCE','EMAIL'],true],['CRediT name references',['CREDIT'],creditSections.length>0],['Supplied correction evidence',['HISTORY','INSTRUCTIONS'],result.corrections.length>0]];
  result.checks=checks.map(([name,codes,applicable])=>{const issues=result.findings.filter(f=>codes.includes(f.code));return {name,status:issues.some(f=>f.severity==='INCOMPLETE')?'INCOMPLETE':issues.length?'HOLD':applicable?'PASS':'NOT_APPLICABLE',detail:issues.length?issues.map(f=>f.message).join(' '):applicable?'Applicable supported checks completed.':'No applicable material in the supplied input.'};});
  guard();
 }catch(error){result.countsComplete=false;result.findings.push({code:'INPUT',severity:'INCOMPLETE',message:error instanceof Error?error.message:'Evaluation could not finish.',authorId:null,evidence:[]});}
 result.corrections=[...corrections.values()];
 result.AUTHOR_NAME_CORRECTIONS_FOUND=result.corrections.length;
 result.AUTHOR_NAME_CHANGES_ALREADY_PRESENT=result.corrections.filter(c=>c.alreadyPresent).length;
 result.AUTHOR_GROUP_INTEGRITY=result.findings.some(f=>f.severity==='INCOMPLETE')?'INCOMPLETE':result.findings.length?'HOLD':'PASS';
 result.AUTHOR_GROUP_HOLD=[...new Set(result.findings.map(f=>f.message))];
 result.MANUAL_AUTHOR_GROUP_REVIEW=result.AUTHOR_GROUP_INTEGRITY==='PASS'?'NOT_REQUIRED':'REQUIRED';
 result.AUTHOR_NAME_HISTORY=result.countsComplete&&result.corrections.length>0&&result.corrections.every(c=>c.alreadyPresent)&&!result.findings.some(f=>f.code==='HISTORY'||f.code==='INSTRUCTIONS')?'VERIFIED':'NOT_DETERMINABLE';
 result.historyScope=result.AUTHOR_NAME_HISTORY==='VERIFIED'?'Only the uniquely bound before/after name changes visible in supplied OPT markup; no exhaustive publication history or Keeper execution is established.':'Current XML and supplied instructions do not establish a complete author-name history. Zero means zero verified observations, not proof that no prior changes occurred.';
 return result;
}
