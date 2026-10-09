/** Platform errors can be plain text/HTML, including failures before our handler loads. */
export async function readKeeperApiResponse(response: Response): Promise<any> {
  const body = await response.text();
  try {
    const data = JSON.parse(body);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response shape');
    return data;
  } catch {
    if (response.status === 413) throw new Error('The uploaded files exceed the server request limit. Use smaller files.');
    if (response.status === 504) throw new Error('Keeper’s server timed out. Please retry the inspection.');
    throw new Error(`Keeper’s server returned an unexpected response (HTTP ${response.status}). Please retry. If this continues, contact the administrator.`);
  }
}
