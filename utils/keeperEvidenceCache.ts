import { createHash } from 'node:crypto';
import { buildKeeperEvidence, type KeeperArtifact, type KeeperEvidence } from './keeperEvidence.js';

// Request-independent, private process cache. Never trust evidence sent by a client.
const entries = new Map<string, { expires: number; bytes: number; value: Promise<KeeperEvidence> }>();
const TTL = 15 * 60 * 1000;
const MAX_BYTES = 32 * 1024 * 1024;
export async function getKeeperEvidence(owner: string, artifacts: KeeperArtifact[], deadline: number) {
  const now = Date.now();
  for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
  const encoded = JSON.stringify(artifacts);
  const key = createHash('sha256').update(owner).update('\0').update(encoded).digest('hex');
  const existing = entries.get(key);
  if (existing) return existing.value;
  // Reserve space for extracted records as well as source content.
  const bytes = Buffer.byteLength(encoded) * 5;
  let used = [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  for (const [oldKey, entry] of entries) {
    if (used + bytes <= MAX_BYTES) break;
    entries.delete(oldKey); used -= entry.bytes;
  }
  const value = buildKeeperEvidence(artifacts, deadline);
  if (bytes <= MAX_BYTES) entries.set(key, { expires: now + TTL, bytes, value });
  try {
    const result = await value;
    if (result.files.some(file => file.inspectionStatus === 'failed')) entries.delete(key);
    return result;
  }
  catch (error) { entries.delete(key); throw error; }
}
