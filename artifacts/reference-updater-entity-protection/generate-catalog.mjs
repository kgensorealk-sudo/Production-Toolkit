// Reproduce the character catalog from the locally installed article DTD dependencies.
import fs from 'node:fs';
const root='C:/Users/Kevin/AppData/Local/Temp/source-text-edge-native-j956r5fu/dtd/';
const table={};
for(const file of ['htmlmathml-f.ent','ESextra.ent']) {
    const source=fs.readFileSync(root+file,'utf8').replace(/<!--[\s\S]*?-->/g,'');
    for(const match of source.matchAll(/<!ENTITY\s+([\w.:-]+)\s+"((?:&#x[\da-fA-F]+;|&#\d+;)+)"\s*>/g))
        table[match[1]]=match[2].replace(/&#(x[\da-fA-F]+|\d+);/g,(_,number)=>
            String.fromCodePoint(number.startsWith('x')?parseInt(number.slice(1),16):Number(number)));
}
fs.writeFileSync('utils/referenceUpdaterEntities.json',JSON.stringify(table,null,2)+'\n');
console.log(`${Object.keys(table).length} character mappings written.`);
