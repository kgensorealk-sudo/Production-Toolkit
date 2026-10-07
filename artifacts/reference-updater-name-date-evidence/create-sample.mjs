import fs from 'node:fs';
const r=JSON.parse(fs.readFileSync('artifacts/reference-updater-name-date-evidence/results.json','utf8'))[0];
const dir='artifacts/reference-updater-name-date-sample';
fs.mkdirSync(dir,{recursive:true});
const format=x=>x.replace(/(\bid=["'])([a-z]+)(\d+)(["'])/g,(_,start,prefix,number,quote)=>start+prefix+number.padStart(4,'0')+quote).replace(/></g,'>\n<');
fs.writeFileSync(dir+'/original.xml',format(r.original));
fs.writeFileSync(dir+'/updated.xml',format(r.updated));
fs.writeFileSync(dir+'/expected-after-approval.xml',format(r.output));
