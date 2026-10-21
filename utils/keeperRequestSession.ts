/** Never pair evidence captured in one workspace with another account's token. */
export async function keeperRequestSession(
  readSession: () => Promise<{data: {session: {access_token: string; user: {id: string}} | null}}>,
  owner: string,
  isCurrent: () => boolean,
  signal: AbortSignal,
) {
  const {data: {session}} = await readSession();
  if (signal.aborted || !isCurrent()) return null;
  if (!session || session.user.id !== owner) throw new Error('Your account changed or sign-in expired. Sign in again before sending this task.');
  return session.access_token;
}
