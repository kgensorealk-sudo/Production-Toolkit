import { createHash } from 'node:crypto';
import { loadKeeperPdfRuntime } from './keeperPdfRuntime.js';
import { buildKeeperEvidence as buildCore, type KeeperArtifact } from './keeperEvidenceCore.js';
export * from './keeperEvidenceCore.js';
export function buildKeeperEvidence(artifacts: KeeperArtifact[], deadline = Date.now() + 25000) {
  return buildCore(artifacts, deadline, {
    hash: async bytes => createHash('sha256').update(bytes).digest('hex'),
    pdf: loadKeeperPdfRuntime,
  });
}
