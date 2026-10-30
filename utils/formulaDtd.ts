import data from './formulaDtdProfiles.json';
import {formulaEntityReferences, parseFormula} from './formulaStudio';

export type FormulaDtdVersion = '5.6' | '5.7';
type Model = [string, string, string | null, number | null, number | null];
type Attribute = [string, string, string | null, string[]];
type Profile = {entry:string; models:Model[]; attributes:Record<string,Attribute>[]; elements:Record<string,[string,number|null,number]>; entities:Record<string,string>};
const profiles = data.profiles as unknown as Record<FormulaDtdVersion,Profile>;
const namespaces:Record<string,string> = {
    ce:'http://www.elsevier.com/xml/common/dtd', mml:'http://www.w3.org/1998/Math/MathML',
    sa:'http://www.elsevier.com/xml/common/struct-aff/dtd', sb:'http://www.elsevier.com/xml/common/struct-bib/dtd',
    tb:'http://www.elsevier.com/xml/common/table/dtd', xlink:'http://www.w3.org/1999/xlink', xml:'http://www.w3.org/XML/1998/namespace'
};
const prefixes = new Map(Object.entries(namespaces).map(([prefix,uri])=>[uri,prefix]));
const xmlns = 'http://www.w3.org/2000/xmlns/';
const start = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const chars = start + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const xmlName = new RegExp(`^[${start}][${chars}]*$`,'u');
const nmToken = new RegExp(`^[${chars}]+$`,'u');

export function formulaDtdAttributes(version:FormulaDtdVersion, name:string):Record<string,Attribute> {
    const profile=profiles[version], rule=profile?.elements[name];
    return rule ? profile.attributes[rule[2]] : {};
}

export function formulaAttributeIssues(version:FormulaDtdVersion, name:string, values:Record<string,string>):string[] {
    const rules=formulaDtdAttributes(version,name), errors:string[]=[];
    for(const [key,raw] of Object.entries(values)) {
        const rule=rules[key];
        if(!rule) {errors.push(`${name}: attribute ${key} is not declared in CE ${version}.`);continue;}
        const [type,requirement,fixed,choices]=rule;
        const value=type==='cdata' ? raw : raw.trim().replace(/\s+/g,' ');
        if(requirement==='fixed' && value!==fixed) errors.push(`${name}: ${key} must be ${JSON.stringify(fixed)}.`);
        if(choices.length && !choices.includes(value)) errors.push(`${name}: ${key} must be one of ${choices.join(', ')}.`);
        if(['id','idref','entity'].includes(type) && !xmlName.test(value)) errors.push(`${name}: ${key} must be a valid XML name.`);
        if(['idrefs','entities'].includes(type) && (!value || value.split(' ').some(item=>!xmlName.test(item)))) errors.push(`${name}: ${key} must contain XML names separated by spaces.`);
        if(type==='nmtoken' && !nmToken.test(value)) errors.push(`${name}: ${key} must be an XML name token.`);
        if(type==='nmtokens' && (!value || value.split(' ').some(item=>!nmToken.test(item)))) errors.push(`${name}: ${key} must contain XML name tokens.`);
    }
    for(const [key,rule] of Object.entries(rules)) if(rule[1]==='required' && !Object.hasOwn(values,key)) errors.push(`${name}: required attribute ${key} is missing.`);
    return errors;
}

// Normalize equivalent input prefixes for the lexical names used by the Elsevier
// DTD. This changes serialization only; namespaces and text retain their meaning.
export function canonicalFormulaXml(xml:string):string {
    if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Document-level DTD/entity declarations are not allowed in a formula fragment.');
    const input=parseFormula(xml);
    if(input.documentElement.children.length!==1 || Array.from(input.documentElement.childNodes).some(node=>node.nodeType===3 && !!node.textContent?.trim())) throw new Error('Provide one formula root element.');
    const output=document.implementation.createDocument(null,'formula-root',null);
    let count=0;
    const copy=(el:Element):Element=>{
        if(++count>5000) throw new Error('This formula exceeds the browser validation limit of 5,000 elements.');
        const prefix=el.namespaceURI ? prefixes.get(el.namespaceURI) : undefined;
        if(el.namespaceURI && !prefix) throw new Error(`Unsupported element namespace on ${el.tagName}.`);
        const inferred=!el.namespaceURI && (profiles['5.7'].elements['mml:'+el.localName] || profiles['5.6'].elements['mml:'+el.localName]) ? 'mml' : prefix;
        const name=inferred ? inferred+':'+el.localName : el.localName;
        const result=output.createElementNS(inferred ? namespaces[inferred] : null,name);
        for(const attr of Array.from(el.attributes)) {
            if(attr.namespaceURI===xmlns) continue;
            const ap=attr.namespaceURI ? prefixes.get(attr.namespaceURI) : undefined;
            if(attr.namespaceURI && !ap) throw new Error(`Unsupported attribute namespace on ${el.tagName}: ${attr.name}.`);
            result.setAttributeNS(attr.namespaceURI,ap ? ap+':'+attr.localName : attr.name,attr.value);
        }
        for(const child of Array.from(el.childNodes)) result.appendChild(child.nodeType===1 ? copy(child as Element) : output.importNode(child,true));
        return result;
    };
    output.documentElement.appendChild(copy(input.documentElement.firstElementChild!));
    return new XMLSerializer().serializeToString(output.documentElement.firstElementChild!);
}

export type FormulaDtdReport = {valid:boolean; errors:string[]; warnings:string[]; canonicalXml:string; version:FormulaDtdVersion};
export function validateFormulaDtd(xml:string,version:FormulaDtdVersion):FormulaDtdReport {
    const errors:string[]=[],warnings:string[]=[],profile=profiles[version];
    let canonicalXml='';
    try {
        if(!profile) throw new Error('Select CE article DTD 5.6 or 5.7.');
        if(!xml.trim()) throw new Error('Enter a formula before validation.');
        for(const name of formulaEntityReferences(xml)) if(!Object.hasOwn(profile.entities,name)) throw new Error(`Entity &${name}; is not a declared character entity in CE ${version}.`);
        canonicalXml=canonicalFormulaXml(xml);
        const doc=new DOMParser().parseFromString(canonicalXml,'application/xml');
        const root=doc.documentElement;
        if(!['ce:display','ce:formula','mml:math'].includes(root.tagName)) errors.push('The formula root must be ce:display, ce:formula, or mml:math.');
        if(!Array.from(doc.querySelectorAll('*')).some(el=>el.tagName==='mml:math')) errors.push('No MathML math element was found.');
        const ids=new Set<string>(),refs:{name:string; value:string}[]=[];
        const matches=(model:number,tokens:string[]):boolean=>{
            const cache=new Map<string,Set<number>>();
            const match=(id:number,position:number):Set<number>=>{
                const key=id+':'+position,saved=cache.get(key);if(saved)return saved;
                const [type,occur,name,left,right]=profile.models[id];
                const once=(p:number):Set<number>=>{
                    if(type==='element')return tokens[p]===name?new Set([p+1]):new Set();
                    if(type==='pcdata')return tokens[p]==='#PCDATA'?new Set([p+1]):new Set();
                    if(type==='or')return new Set([...match(left!,p),...match(right!,p)]);
                    if(type==='seq')return new Set([...match(left!,p)].flatMap(next=>[...match(right!,next)]));
                    return new Set();
                };
                const result=once(position);
                if(occur==='opt'||occur==='mult')result.add(position);
                if(occur==='plus'||occur==='mult') {
                    const pending=[...result];
                    for(let i=0;i<pending.length;i++) for(const next of once(pending[i])) if(!result.has(next)){result.add(next);pending.push(next);}
                }
                cache.set(key,result);return result;
            };
            return match(model,0).has(tokens.length);
        };
        const allowedCache=new Map<number,Set<string>>();
        const allowed=(id:number):Set<string>=>{
            const saved=allowedCache.get(id);if(saved)return saved;
            const node=profile.models[id],result=new Set<string>();
            if(node[0]==='element')result.add(node[2]!);
            for(const child of [node[3],node[4]]) if(child!==null) for(const name of allowed(child))result.add(name);
            allowedCache.set(id,result);return result;
        };
        const visit=(el:Element,path:string)=>{
            if(errors.length>=30)return;
            const name=el.tagName,rule=profile.elements[name];
            if(!rule){errors.push(`${path}: ${name} is not declared in CE ${version}.`);return;}
            const attrs=Object.fromEntries(Array.from(el.attributes).filter(attr=>attr.namespaceURI!==xmlns).map(attr=>[attr.name,attr.value]));
            errors.push(...formulaAttributeIssues(version,name,attrs).map(error=>`${path}: ${error}`));
            for(const [key,value] of Object.entries(attrs)) {
                const type=profile.attributes[rule[2]][key]?.[0];
                if(type==='id') {if(ids.has(value))errors.push(`${path}: duplicate ID ${value}.`);ids.add(value);}
                if(type==='idref'||type==='idrefs') refs.push({name:key,value});
                if(type==='entity'||type==='entities')warnings.push(`${path}: ${key} requires entity declarations from the destination article.`);
            }
            const tokens=Array.from(el.childNodes).flatMap(node=>node.nodeType===1?[(node as Element).tagName]:
                (node.nodeType===3||node.nodeType===4) && (rule[0]==='mixed'?!!node.textContent:!!node.textContent?.trim())?['#PCDATA']:[]);
            if(rule[0]==='empty' ? el.childNodes.length>0 : rule[0]==='mixed' ? tokens.some(token=>token!=='#PCDATA'&&!allowed(rule[1]!).has(token)) : rule[0]==='element'&&rule[1]!==null&&!matches(rule[1],tokens)) errors.push(`${path}: invalid child content/order for ${name} in CE ${version}.`);
            Array.from(el.children).forEach((child,i)=>visit(child,`${path}/*[${i+1}] (${child.tagName})`));
        };
        visit(root,root.tagName);
        for(const ref of refs) for(const id of ref.value.trim().split(/\s+/)) if(!ids.has(id))warnings.push(`${ref.name}="${id}" must be resolved in the destination article.`);
    } catch(error) {errors.push(error instanceof Error?error.message:'Formula validation failed.');}
    return {valid:!errors.length,errors:errors.slice(0,30),warnings:[...new Set(warnings)],canonicalXml,version};
}

export function validatedFormulaXml(xml:string,version:FormulaDtdVersion|''):string {
    if(!version)throw new Error('Select the destination article DTD version before copying or downloading.');
    const report=validateFormulaDtd(xml,version);
    if(!report.valid)throw new Error(report.errors[0]);
    return report.canonicalXml;
}
