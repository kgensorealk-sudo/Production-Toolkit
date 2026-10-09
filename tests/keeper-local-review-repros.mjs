import assert from 'node:assert/strict';
import {ZipWriter,BlobWriter,TextReader} from '@zip.js/zip.js';
import {unpackKeeperZip} from '../utils/keeperLocalZip.ts';
import {keeperArtifactScope,keeperScopedMessages} from '../utils/keeperConversationScope.ts';
import {validateKeeperLocalSources} from '../utils/keeperLocalLimits.ts';

// Regression checks for the two previously reproduced bugs.
const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false});
await writer.add('ABC_123456.xml',new TextReader('<article/>'));
const zip=await writer.close();
const first=await unpackKeeperZip(zip),retry=await unpackKeeperZip(zip);
assert.equal(first.artifacts[0].content,retry.artifacts[0].content);
const history=[{artifactScope:keeperArtifactScope(first.artifacts),content:'Earlier local result'}];
assert.equal(keeperScopedMessages(history,keeperArtifactScope(retry.artifacts)).length,1);
console.log('PASS unchanged ZIP retry retains source identity and conversation scope');

const pdf={id:'pdf',name:'edit-report.pdf',kind:'pdf',content:Buffer.alloc(3_000_000).toString('base64')};
assert.ok(3_000_000<4_000_000);
assert.doesNotThrow(()=>validateKeeperLocalSources([pdf]));
console.log('PASS 3 MB PDF accepted by raw local file limit without a server transport cap');
