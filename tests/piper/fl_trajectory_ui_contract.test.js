import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../Browser_SDK/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('data collection tab is open and FL trajectory screen exposes visible device controls', async () => {
  const html = await read('index.html');
  const tab = html.match(/<button[^>]+data-tab="trajectory"[^>]*>/)?.[0] ?? '';
  assert.ok(tab, 'trajectory tab must exist');
  assert.doesNotMatch(tab, /disabled|aria-disabled="true"/);
  for (const id of ['flTrajectoryConnect', 'flTrajectoryDisconnect', 'flTrajectoryEmergency', 'flTrajectoryStart', 'flTrajectoryStopRecord', 'flTrajectoryPreparePlayback', 'flTrajectoryReleaseTorque']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Star Arm 102-FL/);
  assert.match(html, /data-fl-joint="6"/);
});

test('trajectory screen is single physical FL workflow without Leader or multi-source controls', async () => {
  const html = await read('index.html');
  const section = html.match(/<div id="trajectoryView"[\s\S]*?<div id="resetOriginView"/)?.[0] ?? '';
  assert.ok(section);
  assert.doesNotMatch(section, /trajectoryNewGroup|trajectorySource|LD \/ HD|虚拟 FL|world_tcp|joint_slider/);
  for (const id of ['flTrajectoryName', 'flTrajectoryImport', 'flTrajectoryExport', 'flTrajectoryPlaybackDialog']) {
    assert.match(section, new RegExp(`id="${id}"`));
  }
});

test('all static interface translation keys exist in both language dictionaries', async () => {
  const [html, source] = await Promise.all([read('index.html'), read('src/i18n.js')]);
  const enStart = source.indexOf('\n  en: {');
  const dictionaries = [source.slice(source.indexOf('\n  zh: {'), enStart), source.slice(enStart, source.indexOf('\n};', enStart))];
  const keys = new Set([...html.matchAll(/data-i18n(?:-aria|-title|-value)?="([^"]+)"/g)].map((match) => match[1]));
  assert.ok(enStart > 0);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const dictionary of dictionaries) assert.match(dictionary, new RegExp(`['"]${escaped}['"]\\s*:`));
  }
});

test('application integrates the FL-only workspace and versioned modules', async () => {
  const [app, workspace, controller, html, version] = await Promise.all([
    read('src/app.js'),
    read('src/fl_trajectory_workspace.js'),
    read('src/fl_trajectory_controller.js'),
    read('index.html'),
    read('src/version.js'),
  ]);
  assert.match(app, /createFlTrajectoryWorkspace/);
  assert.match(app, /acceptReadback/);
  assert.match(app, /trajectoryWorkspace\.revokePreview\('navigation'\)/);
  assert.match(app, /connectionSnapshot: \(\) => \(\{[\s\S]*connectionId: controller\.followerConnectionId,[\s\S]*connectionToken: controller\.follower/);
  assert.match(app, /releaseTorque: async \(expectedConnectionId, expectedConnectionToken\)[\s\S]*const follower = controller\.follower[\s\S]*expectedConnectionToken !== follower[\s\S]*controller\.followerConnectionId !== expectedConnectionId[\s\S]*controller\.follower !== follower[\s\S]*await follower\.write\(ServoProtocol\.releaseTorque\(id\)\)/);
  assert.match(workspace, /writeFrame: \(jointsRad, durationMs, connectionId, connectionToken\) => adapter\.writeFrame\(jointsRad, durationMs, connectionId, connectionToken\)/);
  assert.match(workspace, /playbackUpdateIntervalMs:\s*20/);
  assert.match(workspace, /releaseTorque: \(connectionId, connectionToken\) => adapter\.releaseTorque\(connectionId, connectionToken\)/);
  assert.match(app, /writeFrame: async \(jointsRad, durationMs, expectedConnectionId, expectedConnectionToken\)[\s\S]*const follower = controller\.follower[\s\S]*expectedConnectionToken !== follower[\s\S]*controller\.followerConnectionId !== expectedConnectionId[\s\S]*controller\.follower !== follower[\s\S]*await follower\.write\(frame\)/);
  assert.match(app, /async handleBusLost\(role, bus, error\)[\s\S]*const isCurrent = \(\) =>[\s\S]*if \(!isCurrent\(\)\)[\s\S]*await Promise\.allSettled\(\[session\?\.disconnect\(\), bus\.disconnect\(\)\]\)[\s\S]*return;[\s\S]*trajectoryWorkspace\.handleDisconnect\(connectionId\)/);
  assert.match(app, /const reportLostError = \(cause, bus, errorLogger\) => \{[\s\S]*try \{ errorLogger\(userMessageForSerialError\(cause, bus\?\.name \?\? 'Serial'\)\); \}[\s\S]*catch \(_\) \{\}/);
  assert.match(app, /onLost: \(error, bus\) => void this\.handleBusLost\(role, bus, error\)\s*\.catch\(\(cause\) => reportLostError\(cause, bus, errorLogger\)\)/);
  assert.match(app, /beforeunload[\s\S]*void trajectoryWorkspace\.stop\(\)\s*\.catch\(\(error\) => \{[\s\S]*try \{ log\(tWithVars\('error\.generic', \{ message: error\.message \}\)\); \}[\s\S]*catch \(_\) \{\}/);
  assert.equal((app.match(/onError: \(error\) => void this\.handleLoopError\([^\n]+\)\s*\.catch\(\(\) => \{\}\)/g) ?? []).length, 2);
  assert.match(app, /async handleLoopError\(error, role, bus\)[\s\S]*try \{ log\(tWithVars\('error\.loop-error', \{ message: error\.message \}\)\); \}[\s\S]*catch \(_\) \{\}[\s\S]*isDeviceLostError\(error\)[\s\S]*bus\.markLost\(error, \{ force: true \}\)/);
  assert.match(workspace, /async function run\(action\)[\s\S]*try \{ return await action\(\); \}[\s\S]*catch \(error\)[\s\S]*try \{ showStatus[\s\S]*catch \(_\) \{\}[\s\S]*finally[\s\S]*try \{ renderControls\(\); \}[\s\S]*catch \(_\) \{\}/);
  assert.match(workspace, /void run\(initialize\)/);
  assert.match(controller, /result\.limitReached \|\| elapsed >= FL_TRAJECTORY_MAX_DURATION_MS[\s\S]*void this\.stopRecording[\s\S]*\.catch\(\(error\) => \{[\s\S]*try \{ this\.setState\('fault', error\); \}[\s\S]*catch \(_\) \{\}/);
  assert.match(app, /async performDisconnectAll\(\)[\s\S]*const connectionId = this\.followerConnectionId[\s\S]*trajectoryWorkspace\.handleDisconnect\(\{ connectionId \}\)[\s\S]*Promise\.allSettled[\s\S]*throw new AggregateError/);
  assert.match(app, /async function activateTab\(name\)[\s\S]*if \(name !== 'trajectory' && document\.querySelector\('#trajectoryView'\)\.classList\.contains\('active'\)\)[\s\S]*await trajectoryWorkspace\.stop\(\)[\s\S]*applyTab\(name\)/);
  assert.match(app, /for \(const tab of els\.tabs\) tab\.addEventListener\('click',[\s\S]*navigateConsoleTab\(tab\.dataset\.tab\)/);
  assert.doesNotMatch(html, /DIGITAL TWIN WORKSPACE · v\d+\.\d+\.\d+/);
  assert.equal((html.match(/>v1\.1\.2</g) ?? []).length, 1);
  assert.match(version, /APP_VERSION = 'v1\.1\.2'/);
  assert.match(html, /src\/app\.js\?v=1\.1\.2/);
  assert.match(html, /src\/styles\.css\?v=1\.1\.2/);
  assert.match(html, /src\/fl_trajectory_styles\.css\?v=1\.1\.2/);
});

test('FL type uses the approved two-option segmented switch while preserving the existing value contract', async () => {
  const [html, css, app] = await Promise.all([read('index.html'), read('src/styles.css'), read('src/app.js')]);
  const field = html.match(/<div class="follower-target-field"[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(field, /id="followerType"[^>]+type="hidden"[^>]+value="physical"/);
  assert.match(field, /id="followerTypeSwitch"[^>]+data-follower-type="physical"[^>]+role="group"/);
  assert.match(field, /id="followerTypePhysical"[^>]+data-follower-type-option="physical"[^>]+aria-pressed="true"/);
  assert.match(field, /id="followerTypeVirtual"[^>]+data-follower-type-option="virtual"[^>]+aria-pressed="false"/);
  assert.match(field, /data-i18n="device\.physical-fl"/);
  assert.match(field, /data-i18n="device\.virtual-fl-short"/);
  assert.match(css, /\.follower-type-switch::before/);
  assert.match(css, /\.follower-type-switch\[data-follower-type="virtual"\]::before/);
  assert.match(css, /\.follower-type-option:focus-visible/);
  assert.match(app, /function syncFollowerTypeSwitch\(\)/);
  assert.match(app, /followerTypePhysical\.addEventListener\('click'/);
  assert.match(app, /followerTypeVirtual\.addEventListener\('click'/);
  assert.match(app, /els\.followerType\.dispatchEvent\(new Event\('change'/);
  assert.match(app, /els\.followerType\.value = FOLLOWER_TARGET_PHYSICAL;\s*syncFollowerTypeSwitch\(\);\s*controller\.followerTarget\.setType\(FOLLOWER_TARGET_PHYSICAL\)/);
});

test('language switch matches the approved segmented white globe control and remains visible on narrow screens', async () => {
  const [html, css, app] = await Promise.all([read('index.html'), read('src/styles.css'), read('src/app.js')]);
  const control = html.match(/<div id="langSwitch"[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(control, /class="language-icon"/);
  assert.match(control, /<svg[^>]+viewBox="0 0 24 24"/);
  assert.match(control, /id="langZh"[^>]+aria-pressed="true"/);
  assert.match(control, /id="langEn"[^>]+aria-pressed="false"/);
  assert.match(css, /\.language-icon[^}]*color:\s*#fff/i);
  assert.match(css, /\.language-switch::before/);
  assert.match(css, /\.language-switch\[data-language="en"\]::before/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.top-state[^}]*display:\s*flex/);
  assert.match(app, /langZh\.addEventListener/);
  assert.match(app, /langEn\.addEventListener/);
});

test('embedded FL workflow gates hardware playback behind an explicit virtual preview approval', async () => {
  const [html, workspace, app, css] = await Promise.all([
    read('index.html'), read('src/fl_trajectory_workspace.js'), read('src/app.js'), read('src/fl_trajectory_styles.css'),
  ]);
  const section = html.match(/<div id="trajectoryView"[\s\S]*?<div id="resetOriginView"/)?.[0] ?? '';
  for (const id of ['flTrajectoryStartPreview', 'flTrajectoryApprovePreview', 'flTrajectoryStopPreview', 'flTrajectoryPreparePlayback']) {
    assert.match(section, new RegExp(`id="${id}"`));
  }
  assert.match(workspace, /new FlTrajectoryPreview/);
  assert.match(workspace, /preview\.isApproved/);
  assert.match(workspace, /adapter\.previewPose/);
  assert.match(workspace, /adapter\.restoreReadbackPose/);
  assert.match(app, /previewPose:/);
  assert.match(app, /restoreReadbackPose:/);
  assert.match(css, /data-preview-state="playing"/);
});

test('physical playback exposes an explicit torque release action only for the holding state', async () => {
  const [html, workspace, i18n] = await Promise.all([
    read('index.html'), read('src/fl_trajectory_workspace.js'), read('src/i18n.js'),
  ]);
  assert.match(html, /id="flTrajectoryReleaseTorque"[^>]+disabled[^>]+data-i18n="fltraj\.release-torque"/);
  assert.match(workspace, /releaseTorque: query\(root, '#flTrajectoryReleaseTorque'\)/);
  assert.match(workspace, /const isHolding = controller\.state === 'holding'/);
  assert.match(workspace, /const canRetryRelease = controller\.canRetryTorqueRelease\(\)/);
  assert.match(workspace, /els\.releaseTorque\.disabled = !\(isHolding \|\| canRetryRelease\)/);
  assert.match(workspace, /els\.disconnect\.disabled\s*=\s*!isConnected\s*\|\|\s*isRecording\s*\|\|\s*isPlaying\s*\|\|\s*isReleasing/);
  assert.match(workspace, /els\.disconnect\.addEventListener\('click',[\s\S]*let safetyError = null[\s\S]*await controller\.handleDisconnect\(\{ connectionId \}\)[\s\S]*await adapter\.disconnect\(\)[\s\S]*if \(safetyError\) throw safetyError/);
  assert.match(workspace, /async stop\(\)[\s\S]*await controller\.stopPlayback\(\)[\s\S]*controller\.state === 'holding' \|\| controller\.canRetryTorqueRelease\(\)[\s\S]*await controller\.releasePlaybackTorque\(\)[\s\S]*showStatus\('error', t\('fltraj\.failed'\), error\.message\)[\s\S]*throw error/);
  assert.match(workspace, /els\.releaseTorque\.addEventListener\('click',[\s\S]*controller\.releasePlaybackTorque\(\)/);
  assert.match(workspace, /case 'holding': showStatus\('warning', t\('fltraj\.holding'\), t\('fltraj\.holding-detail'\)\)/);
  for (const value of ['卸力', '保持力矩 · 请点击“卸力”', 'Release Torque', 'Holding torque · Select “Release Torque”']) {
    assert.match(i18n, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('trajectory event handlers render failures without leaving rejected promises unhandled', async () => {
  const workspace = await read('src/fl_trajectory_workspace.js');
  const runBody = workspace.match(/async function run\(action\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(runBody, /catch \(error\)[\s\S]*try \{ showStatus\('error', t\('fltraj\.failed'\), error\.message\); \}[\s\S]*catch \(_\) \{\}/);
  assert.match(runBody, /finally[\s\S]*try \{ renderControls\(\); \}[\s\S]*catch \(_\) \{\}/);
  assert.doesNotMatch(runBody, /throw error/);
  assert.match(workspace, /cancelPlayback\.addEventListener\('click', \(\) => \{[^}]*void run\(\(\) => controller\.stopPlayback\(\)\)/);
  assert.doesNotMatch(workspace, /void controller\.stopPlayback\(\)/);
});

test('global emergency stop routes trajectory playback through its emergency path', async () => {
  const app = await read('src/app.js');
  const body = app.match(/async function runEmergencyStop\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(body, /await trajectoryWorkspace\.handleEmergency\(\)/);
  assert.doesNotMatch(body, /trajectoryWorkspace\.stop\(\)/);
  assert.match(body, /const emergencyErrors = \[\]/);
  assert.match(body, /catch \(error\) \{ emergencyErrors\.push\(error\); \}/);
  assert.match(body, /let busCount = 0/);
  assert.match(body, /try \{ busCount = await controller\.emergencyStop\(\); \}/);
  assert.match(body, /if \(emergencyErrors\.length\) throw new AggregateError/);
  assert.ok(body.indexOf('trajectoryWorkspace.handleEmergency()') < body.indexOf('controller.emergencyStop()'));

  const controllerBody = app.match(/  async emergencyStop\(\) \{[\s\S]*?\n  \}\n\n  async handleBusLost/)?.[0] ?? '';
  assert.match(controllerBody, /const failures = \[\]/);
  assert.match(controllerBody, /try \{ await this\.teleopLifecycle\.stop\(\{ resume: false \}\); \}/);
  assert.match(controllerBody, /catch \(error\) \{ failures\.push\(error\); \}/);
  assert.match(controllerBody, /Promise\.allSettled\(sessions\.map\(\(session\) => session\.emergencyStop\(\)\)\)/);
  assert.ok(controllerBody.indexOf('teleopLifecycle.stop') < controllerBody.indexOf('Promise.allSettled'));
});
