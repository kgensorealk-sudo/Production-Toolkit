import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = process.env.TOOLKIT_TEST_OUTPUT
  ? path.resolve(process.env.TOOLKIT_TEST_OUTPUT)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-output-'));
const relative = path.relative(repository, output);
if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
  throw new Error('Test output must be outside the repository.');
}
export function testOutputPath(name) {
  const target = path.resolve(output, name);
  const rel = path.relative(output, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Unsafe test output path.');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  return target;
}
