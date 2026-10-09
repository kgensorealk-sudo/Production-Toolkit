import type {KeeperArtifact} from './keeperEvidenceCore';
export function validateKeeperLocalSources(artifacts:KeeperArtifact[]){
  if(artifacts.length>2)throw new Error('Local inspection accepts one XML and one PDF.');
  let total=0;const kinds=new Set<string>();
  for(const artifact of artifacts){
    if(kinds.has(artifact.kind))throw new Error('Local inspection accepts one file of each type.');
    kinds.add(artifact.kind);
    const bytes=artifact.kind==='xml'?new TextEncoder().encode(artifact.content).length:Math.floor(artifact.content.length/4)*3-(artifact.content.endsWith('==')?2:artifact.content.endsWith('=')?1:0);
    if(bytes>4_000_000)throw new Error('Each local XML/PDF source must be no larger than 4 MB.');
    total+=bytes;
  }
  if(total>8_000_000)throw new Error('Local sources exceed the 8 MB combined limit.');
}
