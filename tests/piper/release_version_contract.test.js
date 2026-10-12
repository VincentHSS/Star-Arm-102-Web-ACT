import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('both platform launchers start the integrated website and API', async () => {
  const root = new URL('../../', import.meta.url);
  const ubuntu = await readFile(new URL('start_ubuntu.sh', root), 'utf8');
  const windows = await readFile(new URL('start_windows.bat', root), 'utf8');
  assert.match(ubuntu, /tools\/serve_local\.py/);
  assert.match(windows, /tools\\serve_local\.py/);
  assert.ok(!ubuntu.includes('\r'));
  const service = await readFile(new URL('tools/serve_local.py', root), 'utf8');
  assert.match(service, /ROOT\/'Browser_SDK'/);
});
