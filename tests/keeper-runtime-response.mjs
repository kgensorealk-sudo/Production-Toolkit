import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { readKeeperApiResponse } from '../utils/keeperApiResponse.ts';

// A separate native Node process is essential: tsx/bundlers hide JSON import-attribute failures.
const folder = await mkdtemp(join(tmpdir(), 'keeper-runtime-'));
try {
  const source = await readFile(new URL('../utils/referenceUpdaterXml.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText;
  await writeFile(join(folder,'scanner.mjs'),compiled);
  await copyFile(new URL('../utils/referenceUpdaterEntities.json',import.meta.url),join(folder,'referenceUpdaterEntities.json'));
  const result = spawnSync(process.execPath,['--input-type=module','-e',"import {scanReferenceXml} from './scanner.mjs'; if(scanReferenceXml('<article/>').nodes.length!==1) process.exit(2);"],{cwd:folder,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  console.log('PASS native Node ESM loads XML scanner and JSON entity data without a loader');
} finally { await rm(folder,{recursive:true,force:true}); }

assert.deepEqual(await readKeeperApiResponse(Response.json({evidence:{errors:0}})),{evidence:{errors:0}});
for (const body of ['A server error has occurred','<html>Server error</html>','', 'null','[]']) {
  await assert.rejects(readKeeperApiResponse(new Response(body,{status:500})),/unexpected response \(HTTP 500\)/);
}
await assert.rejects(readKeeperApiResponse(new Response('Payload too large',{status:413})),/request limit/);
await assert.rejects(readKeeperApiResponse(new Response('Timeout',{status:504})),/timed out/);
console.log('PASS plain-text, HTML, empty, invalid JSON shapes, oversized request, and timeout responses handled clearly');
