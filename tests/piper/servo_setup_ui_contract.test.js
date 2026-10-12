import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../Browser_SDK/', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('servo setup derives the target ID from the live input instead of a hard-coded 3', async () => {
  const [html, app] = await Promise.all([
    source('index.html'),
    source('src/servo_setup.js'),
  ]);

  assert.doesNotMatch(app, /let\s+targetId\s*=\s*3\s*;/);
  assert.match(app, /targetId\s*=\s*Number\(ui\.idInput\.value\)/);
  assert.match(
    app,
    /ui\.btnWrite\.onclick\s*=\s*\(\)\s*=>\s*\{\s*targetId\s*=\s*Number\(ui\.idInput\.value\);/s,
  );
  assert.match(html, /<input type="number" id="targetId" min="0" max="6" value="">/);
  assert.doesNotMatch(html, /id="targetId"[^>]*value="3"/);
  assert.match(html, /<strong id="confirmId">—<\/strong>/);
  assert.doesNotMatch(html, /<strong id="confirmId">3<\/strong>/);
});

// Use the arguments actually supplied by the UI, so a placeholder-name regression
// cannot hide the underlying serial exception again.
test('servo setup connection and write failures display the actual serial error', async () => {
  const { tWithVars } = await import('../../Browser_SDK/src/i18n.js');
  const app = await source('src/servo_setup.js');
  const serialError = 'ServoSetup 等待舵机响应超时';
  for (const key of ['error.connection-failed-detail', 'error.write-failed-detail']) {
    const escaped = key.replaceAll('.', '\\.');
    const match = app.match(new RegExp(`tWithVars\\('${escaped}', \\{ (\\w+): e\\.message \\}\\)`));
    assert.ok(match, `${key} should receive the caught error`);
    const rendered = tWithVars(key, { [match[1]]: serialError });
    assert.ok(rendered.includes(serialError), rendered);
    assert.doesNotMatch(rendered, /\{\w+\}/);
  }
});
