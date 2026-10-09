export const KEEPER_REQUEST_LIMIT = 4000000;
export function encodeKeeperRequest(payload: unknown) {
  const body=JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength>KEEPER_REQUEST_LIMIT) throw new Error('The combined XML, encoded PDF, instructions, and conversation exceed the 4 MB server limit. Use smaller files or shorten the conversation. Existing files have been kept.');
  return body;
}
