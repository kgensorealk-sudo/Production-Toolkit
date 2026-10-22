import assert from 'node:assert/strict';
import {ZipWriter,BlobWriter,TextReader} from '@zip.js/zip.js';
import {unpackKeeperZip} from '../utils/keeperLocalZip.ts';
async function zip(entries){const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false});for(const [name,text,options] of entries)await writer.add(name,new TextReader(text),options);return writer.close();}
const complete=await zip([['folder/ABC_123456.xml','<article/>'],['folder/ABC_123456.order','<orders/>'],['folder/ABC_123456_edit_report.pdf','%PDF-']]);
const result=await unpackKeeperZip(complete);assert.equal(result.artifacts.length,2);assert.equal(result.issues.length,0);assert.equal(result.orderPresent,true);
const output=await unpackKeeperZip(await zip([['nested/CARP_125905_out.xml','<article/>'],['nested/CARP_125905_edit_report.pdf','%PDF-']]));
assert.deepEqual(output.artifacts.map(a=>a.kind),['xml','pdf']);assert.equal(output.issues.length,0);assert.equal(output.orderPresent,false);
assert.equal(output.artifacts[0].name,'nested/CARP_125905_out.xml');
const duplicateVersions=await unpackKeeperZip(await zip([['CARP_125905.xml','<article/>'],['CARP_125905_out.xml','<article/>'],['CARP_125905_edit_report.pdf','%PDF-']]));
assert.equal(duplicateVersions.artifacts.length,0);assert.deepEqual(duplicateVersions.issues,['Multiple article XML candidates; attach the intended XML manually.']);
const unrelated=await unpackKeeperZip(await zip([['CARP_125905_out.xml','<article/>'],['CARP_999999_edit_report.pdf','%PDF-']]));
assert.deepEqual(unrelated.artifacts.map(a=>a.kind),['xml']);assert.ok(unrelated.issues[0].includes('No matching edit-report PDF'));
const upper=await unpackKeeperZip(await zip([['CARP_125905_OUT.XML','<article/>'],['CARP_125905_EDIT_REPORT.PDF','%PDF-']]));
assert.equal(upper.artifacts.length,2);assert.equal(upper.issues.length,0);
const incomplete=await unpackKeeperZip(await zip([['ABC_123456-AU.xml','<article/>']]));assert.equal(incomplete.artifacts.length,0);assert.ok(incomplete.issues.some(x=>x.includes('production article')));
const ambiguous=await unpackKeeperZip(await zip([['one/ABC_123456.xml','<article/>'],['two/ABC_123456.xml','<article/>']]));assert.equal(ambiguous.artifacts.length,0);assert.ok(ambiguous.issues.some(x=>x.includes('Multiple')));
await assert.rejects(()=>unpackKeeperZip(awaitableBad()),/format|ZIP/i);
function awaitableBad(){return new Blob(['not a zip']);}
await assert.rejects(()=>unpackKeeperZip(new Blob([new Uint8Array(25*1024*1024+1)])),/25 MiB/);
const mismatch=await unpackKeeperZip(await zip([['ABC_123456.xml','<article/>'],['ABC_999999_edit_report.pdf','%PDF-']]));assert.equal(mismatch.artifacts.length,1);assert.ok(mismatch.issues.length);
const zipUnsafe=await zip([['../ABC_123456.xml','<article/>']]);
await assert.rejects(()=>unpackKeeperZip(zipUnsafe),/Unsafe/);
console.log('PASS local ZIP role selection, nested folder, six-digit articles, missing/ambiguous files, mismatched PDF, invalid archive and size limit');
