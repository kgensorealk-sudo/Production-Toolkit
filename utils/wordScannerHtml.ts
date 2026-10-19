// Keep pasted editorial formatting and Word list metadata, but do not activate
// executable HTML when switching from source to the rich-text editor.
export function sanitizeWordScannerHtml(html:string):string {
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,link,meta,base').forEach(node=>node.remove());
    for(const element of Array.from(doc.body.querySelectorAll('*'))){
        for(const attribute of Array.from(element.attributes)){
            const name=attribute.name.toLowerCase(),value=attribute.value.replace(/[\u0000-\u0020]/g,'');
            if(name.startsWith('on') || name==='srcdoc' || name==='srcset' ||
                (['href','xlink:href','src','action','formaction'].includes(name) && /^(?:javascript|vbscript|data):/i.test(value)))element.removeAttribute(attribute.name);
            // Images are intentionally unsupported in generated text snippets.
            // Retain an inert placeholder/alt text so the converter can report it.
            if(element.tagName.toLowerCase()==='img' && name==='src')element.removeAttribute(attribute.name);
            if(name==='style'){
                const declarations=attribute.value.split(';').filter(declaration=>!/url\s*\(|expression\s*\(|(?:^|:)\s*(?:behavior|-moz-binding)\b/i.test(declaration));
                element.setAttribute('style',declarations.join(';'));
            }
        }
    }
    return doc.body.innerHTML;
}
