import ce570 from './wordScannerCe570.json';
import ce560 from './wordScannerCe560.json';

export type WordScannerDtdVersion = '5.7' | '5.6';
type Model = {type:string; occur:string; name?:string; left?:Model; right?:Model};
type AttributeRule = {type:string; required:boolean; fixed:string|null; values:string[]};
type ElementRule = {type:string; model:Model|null; allowedChildren:string[]; attributes:Record<string,AttributeRule>};
type Profile = {name:string; elements:Record<string,ElementRule>};
const profiles:Record<WordScannerDtdVersion,Profile>={'5.7':ce570,'5.6':ce560};
export const CE_NAMESPACE='http://www.elsevier.com/xml/common/dtd';
const CALS_NAMESPACE='http://www.elsevier.com/xml/common/cals/dtd';

// This validates supported fragment subtrees, not their final position in an article.
// Models and attribute constraints are generated from the real CE article DTDs.
export function validateWordScannerCeFragment(xml:string, version:WordScannerDtdVersion='5.7'):void {
    if(!xml.trim())return;
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DTD declarations are not part of a copy-ready snippet.');
    const doc=new DOMParser().parseFromString(`<scanner-root xmlns:ce="${CE_NAMESPACE}" xmlns:xlink="http://www.w3.org/1999/xlink">${xml}</scanner-root>`,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw new Error('The generated snippet is not well-formed XML.');
    const profile=profiles[version];
    if(!profile)throw new Error('Choose CE DTD version 5.7 or 5.6.');
    const ids=new Set<string>();
    const matchModel=(model:Model,tokens:string[]):boolean=>{
        const cache=new Map<Model,Map<number,Set<number>>>();
        const match=(node:Model,start:number):Set<number>=>{
            const saved=cache.get(node)?.get(start);if(saved)return saved;
            const once=(position:number):Set<number>=>{
                if(node.type==='element')return tokens[position]===node.name?new Set([position+1]):new Set();
                if(node.type==='pcdata')return tokens[position]==='#PCDATA'?new Set([position,position+1]):new Set([position]);
                if(node.type==='or')return new Set([...match(node.left!,position),...match(node.right!,position)]);
                if(node.type==='seq')return new Set([...match(node.left!,position)].flatMap(next=>[...match(node.right!,next)]));
                return new Set();
            };
            let result=once(start);
            if(node.occur==='opt')result.add(start);
            if(node.occur==='mult' || node.occur==='plus'){
                const pending=[...result];
                for(let i=0;i<pending.length;i++)for(const next of once(pending[i]))if(!result.has(next)){result.add(next);pending.push(next);}
                if(node.occur==='mult')result.add(start);
            }
            if(!cache.has(node))cache.set(node,new Map());cache.get(node)!.set(start,result);return result;
        };
        return match(model,0).has(tokens.length);
    };
    const validate=(node:Element)=>{
        const name=node.tagName,rule=profile.elements[name];
        if(!rule)throw new Error(`${name} is not supported by the CE ${version} snippet profile.`);
        const expectedNamespace=name.startsWith('ce:')?CE_NAMESPACE:name==='entry'?CE_NAMESPACE:CALS_NAMESPACE;
        if(node.namespaceURI!==expectedNamespace)throw new Error(`${name} has an incorrect XML namespace.`);
        for(const attribute of Array.from(node.attributes)){
            const constraint=rule.attributes[attribute.name];
            if(!constraint)throw new Error(`${attribute.name} is not allowed on ${name} in CE ${version}.`);
            if(constraint.fixed!==null && constraint.fixed!==attribute.value)throw new Error(`${name} requires ${attribute.name}="${constraint.fixed}".`);
            if(constraint.values.length && !constraint.values.includes(attribute.value))throw new Error(`${name} has an invalid ${attribute.name} value.`);
            if(constraint.type==='id'){
                if(!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(attribute.value))throw new Error(`${name} has an invalid XML ID.`);
                if(ids.has(attribute.value))throw new Error(`Duplicate snippet ID ${attribute.value}.`);ids.add(attribute.value);
            }
            if(constraint.type==='nmtoken' && !/^[A-Za-z0-9_.:-]+$/.test(attribute.value))throw new Error(`${name} has an invalid ${attribute.name} token.`);
        }
        for(const [attribute,constraint] of Object.entries(rule.attributes))if(constraint.required && !node.hasAttribute(attribute))throw new Error(`${name} requires ${attribute}.`);
        const tokens=Array.from(node.childNodes).flatMap(child=>child.nodeType===1?[(child as Element).tagName]:
            (child.nodeType===3 || child.nodeType===4) && (rule.type==='mixed'?!!child.textContent:!!child.textContent?.trim())?['#PCDATA']:[]);
        if(rule.type==='empty'?node.childNodes.length>0:rule.type==='mixed'?tokens.some(token=>token!=='#PCDATA' && !rule.allowedChildren.includes(token)):rule.model && !matchModel(rule.model,tokens))
            throw new Error(`${name} has invalid child content for CE ${version}. Required paragraph or section structure may be missing.`);
        Array.from(node.children).forEach(validate);
    };
    Array.from(doc.documentElement.children).forEach(validate);
}
