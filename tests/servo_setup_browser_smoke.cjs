// Entire setup flow uses synthetic Web Serial. No physical ports, cameras or runtime API.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const installHardware = require('./helpers/servo_setup_hardware.cjs');
const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'Browser_SDK'), OUTPUT = path.join(ROOT, 'dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
(async () => {
  const server = http.createServer((request, response) => {
    const file = path.resolve(WEB, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(WEB + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, content) => { if (error) response.writeHead(404).end(); else { response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); response.end(content); } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const site = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(OUTPUT, { recursive: true }); let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    const errors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    await page.route('http://127.0.0.1:18765/**', route => route.abort());
    await page.addInitScript(installHardware);
    await page.goto(site + '/index.html');
    const consoleColor = await page.locator('#teleopView').evaluate(node => getComputedStyle(node).backgroundColor);
    await page.click('[data-tab="servo-setup"]');
    await page.waitForFunction(() => document.querySelector('#servoSetupView').classList.contains('active') && document.querySelector('#ssModelState').textContent === '');
    await page.screenshot({ path: path.join(OUTPUT, 'servo-studio-start.png'), fullPage: true, animations: 'disabled' });
    assert.equal(await page.locator('#servoSetupView').evaluate(node => getComputedStyle(node).colorScheme), 'light');
    assert.equal(await page.locator('#ssMotorList button').count(), 7);
    const labels = await page.locator('#ssModelLabels button').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }));
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) assert(Math.hypot(labels[i].x - labels[j].x, labels[i].y - labels[j].y) >= 34, 'all seven motor labels remain separately clickable');
    await page.click('#ssModelLabels button[data-slot="6"]');
    await page.waitForFunction(() => document.querySelector('#ssSelectedJoint').textContent === 'J7');
    assert.equal(await page.locator('#ssSelectedJoint').textContent(), 'J7');
    await page.waitForFunction(() => !document.documentElement.dataset.ssTransition);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const baseLabel = await page.locator('#ssModelLabels button[data-slot="0"]').boundingBox();
    const overlayRule = await page.addStyleTag({ content: '#ssModelLabels,#ssModelLabels button { pointer-events:none!important; }' });
    await page.mouse.click(baseLabel.x + baseLabel.width / 2, baseLabel.y + baseLabel.height / 2 + 20);
    await page.waitForFunction(() => document.querySelector('#ssSelectedJoint').textContent === 'J1');
    await overlayRule.evaluate(node => node.remove());
    assert.equal(await page.evaluate(() => window.__servoHardware.writes.length), 0, 'model picking is visual and cannot configure or move a motor');
    await page.click('#ssModeAssembly');
    assert.equal(await page.locator('#ssNext').isDisabled(), true);
    await page.click('#btnConnect');
    await page.waitForFunction(() => !document.querySelector('#btnDisconnect').disabled);
    for (let slot = 0; slot < 7; slot++) {
      await page.evaluate(() => window.__servoHardware.addFactory());
      await page.check('#ssNewServoCheck'); await page.click('#ssNext');
      await page.waitForFunction(({ slot }) => !document.querySelector('#ssNewServoCheck').checked
        && document.querySelectorAll('#ssMotorList .ss-motor-card')[slot].querySelector('strong').textContent === `ID ${slot === 0 ? 253 : slot}`
        && !document.querySelector('#btnDisconnect').disabled, { slot });
      const motors = await page.evaluate(() => window.__servoHardware.snapshot());
      assert.equal(motors.length, slot + 1); assert(motors.every(m => m.baud === 115200));
      if (slot === 0) {
        await page.click('#ssModeSingle');
        assert((await page.locator('#ssIssueText').textContent()).includes('先完成向导'));
      }
    }
    assert((await page.locator('#ssStageTitle').textContent()).includes('恢复'));
    await page.click('#ssNext'); await page.click('#btnConfirm');
    await page.waitForFunction(() => !document.querySelector('#ssNext').disabled && document.querySelector('#ssStageTitle').textContent.includes('统一切换'));
    await page.click('#ssNext'); await page.click('#btnConfirm');
    await page.waitForFunction(() => document.querySelector('#workState').textContent === '配置完成' && !document.querySelector('#btnDisconnect').disabled);
    const writes = () => page.evaluate(() => window.__servoHardware.writes.filter(w => w.frame[2] === 6));
    assert.equal((await writes()).length, 15);
    assert.deepEqual(await page.evaluate(() => window.__servoHardware.snapshot().map(m => [m.id, m.baud])), Array.from({ length: 7 }, (_, id) => [id, 1000000]));
    await page.screenshot({ path: path.join(OUTPUT, 'servo-studio-complete.png'), fullPage: true, animations: 'disabled' });

    // Clicking a model label opens its individual editor; cancellation never writes.
    await page.click('#ssModelLabels button[data-slot="4"]');
    await page.waitForFunction(() => !document.querySelector('#ssManualPanel').hidden);
    assert.equal(await page.locator('#ssSelectedJoint').textContent(), 'J5');
    assert.equal(await page.inputValue('#initialId'), '4');
    await page.click('#btnConnect');
    await page.waitForFunction(() => document.querySelector('#workState').textContent.includes('参数已读取'));
    await page.fill('#targetId', '42'); await page.selectOption('#targetBaudRate', '115200'); await page.check('#singleCheck');
    await page.click('#btnWrite'); assert.equal(await page.locator('#confirmId').textContent(), '42');
    await page.click('#btnCancel'); await page.waitForFunction(() => !document.querySelector('#confirmDialog').open);
    assert.equal((await writes()).length, 15);
    await page.click('#btnWrite'); await page.click('#btnConfirm');
    await page.waitForFunction(() => document.querySelector('#initialId').value === '42' && !document.querySelector('#btnDisconnect').disabled);
    const motors = await page.evaluate(() => window.__servoHardware.snapshot());
    assert.deepEqual(motors.map(m => [m.id, m.baud]), Array.from({ length: 7 }, (_, id) => id === 4 ? [42, 115200] : [id, 1000000]));

    // Conflicts at a different baud rate must not mutate the selected motor.
    await page.fill('#targetId', '2'); await page.selectOption('#targetBaudRate', '115200'); await page.check('#singleCheck');
    await page.click('#btnWrite'); await page.click('#btnConfirm');
    await page.waitForFunction(() => document.querySelector('#ssIssueText').textContent.includes('已被占用'));
    assert.equal((await writes()).length, 16);
    await page.click('#langEn');
    assert((await page.locator('#ssIssueText').textContent()).includes('occupied'));
    assert.equal(await page.locator('#ssModeSingle').innerText(), 'Edit one motor');
    assert.equal(await page.inputValue('#initialId'), '42'); assert.equal(await page.inputValue('#targetId'), '2');
    assert(!/[\u4e00-\u9fff]/u.test(await page.locator('#servoSetupView').innerText()), 'the new page is fully English, including errors');
    await page.screenshot({ path: path.join(OUTPUT, 'servo-studio-single-en.png'), fullPage: true, animations: 'disabled' });

    // A successful write whose verification reply is lost must recover by reading.
    await page.click('#btnConnect'); await page.waitForFunction(() => document.querySelector('#workState').textContent.includes('Ready to write'));
    await page.fill('#targetId', '43'); await page.check('#singleCheck');
    await page.evaluate(() => { window.__servoHardware.dropAfterWrite = true; });
    await page.click('#btnWrite'); await page.click('#btnConfirm');
    await page.waitForFunction(() => !document.querySelector('#btnDisconnect').disabled && document.querySelector('#ssIssueText').textContent.includes('timed out'));
    assert.equal((await writes()).length, 17);
    await page.click('#btnConnect');
    await page.waitForFunction(() => document.querySelector('#initialId').value === '43' && !document.querySelector('#btnDisconnect').disabled);
    assert.equal((await writes()).length, 17, 'recovery never repeats an unconfirmed write');
    await page.waitForFunction(() => document.querySelector('#ssIssue').hidden);

    // Responsive layout and motion preferences retain all actions.
    await page.setViewportSize({ width: 430, height: 940 });
    await page.screenshot({ path: path.join(OUTPUT, 'servo-studio-mobile.png'), fullPage: true, animations: 'disabled' });
    assert(await page.locator('#servoSetupView').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'no horizontal clipping on a narrow screen');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert(await page.locator('.ss-enter').first().evaluate(node => parseFloat(getComputedStyle(node).animationDuration) <= 0.001));
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.click('[data-tab="teleop"]');
    await page.waitForFunction(() => !document.querySelector('#servoSetupView').classList.contains('active'));
    assert.equal(await page.locator('#teleopView').evaluate(node => getComputedStyle(node).backgroundColor), consoleColor);
    assert.equal(await page.evaluate(() => window.__servoHardware.writes.filter(w => ![5, 6].includes(w.frame[2])).length), 0);
    assert.equal(await page.evaluate(() => window.__servoHardware.requested), 1, 'baud changes reuse the authorized synthetic port');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log('Servo studio: seven-motor bus, per-motor edit, collision guard, uncertain-write recovery, EN, motion and responsive checks passed (synthetic hardware only)');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
