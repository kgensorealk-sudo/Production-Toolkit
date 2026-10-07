import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = fs.readFileSync('utils/xmlRenumberProfile.ts', 'utf8');
const code = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {renumberWithProfile, ELSEVIER_PROFILE} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const original = fs.readFileSync('C:/Users/Kevin/Desktop/Mastercopy AI/Sample File/Older files/12-31-2025/CEJ_172259/CEJ_172259.xml','utf8');
const references = [...original.matchAll(/<ce:bib-reference\b[^>]*>[\s\S]*?<\/ce:bib-reference>/g)];
const ids = references.slice(0,2).map(m => /\bid="([^"]+)"/.exec(m[0])[1]);
const article = original.replace(references[0][0], makeReference(ids[0], 'World Health Organization', '2020', 990005))
    .replace(references[1][0], makeReference(ids[1], 'Smith', '2021', 990020));
function makeReference(id, name, year, seed) {
    const authors = name === 'World Health Organization'
        ? `<sb:collaboration>${name}</sb:collaboration><sb:author><ce:surname>Researcher</ce:surname></sb:author><sb:et-al/>`
        : `<sb:author><ce:surname>${name}</ce:surname></sb:author><sb:et-al/>`;
    return `<ce:bib-reference id="${id}"><ce:label>${name} et al., ${year}</ce:label><sb:reference id="rf${seed}"><sb:contribution><sb:authors>${authors}</sb:authors></sb:contribution><sb:host><sb:book><sb:title><sb:maintitle>Health guidance</sb:maintitle></sb:title><sb:date>${year}</sb:date></sb:book></sb:host></sb:reference><ce:source-text id="se${seed+5}">${name} et al., ${year}. Health guidance.</ce:source-text></ce:bib-reference>`;
}
const cases = [
    ['who-external-parentheses', `(<ce:cross-ref id="cf990005" refid="${ids[0]}">WHO et al., 2020</ce:cross-ref>)`, `<ce:cross-ref id="cf990005" refid="${ids[0]}">[1]</ce:cross-ref>`],
    ['who-internal-parentheses', `<ce:cross-ref id="cf990005" refid="${ids[0]}">(WHO et al., 2020)</ce:cross-ref>`, `<ce:cross-ref id="cf990005" refid="${ids[0]}">[1]</ce:cross-ref>`],
    ['who-formatted-locator', `<ce:cross-ref id="cf990005" refid="${ids[0]}"><ce:italic>WHO et al., 2020, pp. 25–27</ce:italic></ce:cross-ref>`, `<ce:cross-ref id="cf990005" refid="${ids[0]}"><ce:italic>[1, pp. 25–27]</ce:italic></ce:cross-ref>`],
    ['who-smith-group', `<ce:cross-refs id="cf990005" refid="${ids.join(' ')}">WHO et al., 2020; Smith et al., 2021</ce:cross-refs>`, `<ce:cross-refs id="cf990005" refid="${ids.join(' ')}">[1,2]</ce:cross-refs>`]
];
if (process.argv.includes('--verify-existing')) {
    const jobs=JSON.parse(fs.readFileSync('artifacts/xml-renumber-author-date-validation/validation-jobs.json','utf8'));
    for (const job of jobs.filter(j=>j.name.endsWith('-input'))) {
        const outputJob=jobs.find(j=>j.name===job.name.replace(/-input$/,'-output'));
        const result=renumberWithProfile(fs.readFileSync(job.file,'utf8'),ELSEVIER_PROFILE,'[',']');
        assert.equal(result.output,fs.readFileSync(outputJob.file,'utf8'),job.name);
        assert.equal(result.issues.length,0);
        assert.equal(renumberWithProfile(result.output,ELSEVIER_PROFILE,'[',']').output,result.output);
    }
    console.log('Current engine produces exactly the four DTD/VTool-validated article outputs.');
    process.exit(0);
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xml-renumber-author-date-'));
const saved='artifacts/xml-renumber-author-date-validation';
fs.cpSync('C:/Users/Kevin/AppData/Local/Temp/source-text-edge-native-j956r5fu/dtd',path.join(dir,'dtd'),{recursive:true});
for (const file of fs.readdirSync(path.join(dir,'dtd'))) fs.cpSync(path.join(dir,'dtd',file),path.join(dir,file),{recursive:true});
const jobs=[]; const results=[];
fs.writeFileSync(path.join(dir,'baseline.xml'),original);
jobs.push({name:'baseline',file:path.join(dir,'baseline.xml')});
for (const [name,citation,expected] of cases) {
    const sections=article.indexOf('<ce:sections');
    const paragraph=/<ce:para\b[^>]*>/.exec(article.slice(sections));
    assert.ok(sections>=0 && paragraph);
    const point=sections+paragraph.index+paragraph[0].length;
    const input=article.slice(0,point)+citation+' '+article.slice(point);
    const result=renumberWithProfile(input,ELSEVIER_PROFILE,'[',']');
    assert.ok(result.output.includes(expected),name);
    assert.ok(result.output.includes(`<ce:bib-reference id="${ids[0]}"><ce:label>[1]</ce:label>`));
    assert.equal(renumberWithProfile(result.output,ELSEVIER_PROFILE,'[',']').output,result.output);
    for (const [phase,xml] of [['input',input],['output',result.output]]) {
        const file=path.join(dir,`${name}-${phase}.xml`);fs.writeFileSync(file,xml);jobs.push({name:name+'-'+phase,file});
    }
    results.push({name,citation,expected,processed:result.processed,issues:result.issues});
}
fs.writeFileSync(path.join(saved,'validation-jobs.json'),JSON.stringify(jobs,null,2));
fs.writeFileSync(path.join(saved,'case-results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({directory:dir,cases:results.length,jobs:jobs.length,issues:results.map(r=>({name:r.name,count:r.issues.length}))}));
