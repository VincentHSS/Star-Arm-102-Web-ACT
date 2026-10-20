import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as i18n from '../Browser_SDK/src/i18n.js';

// Keep this regression list in the repository; CI has no local work directory.
const newKeys = [
  "label.physical-model",
  "lumos.actual-gripper",
  "lumos.aria.gripper",
  "lumos.aria.panel",
  "lumos.aria.preview",
  "lumos.aria.steps",
  "lumos.badge.calibrating",
  "lumos.badge.connected",
  "lumos.badge.connecting",
  "lumos.badge.fault",
  "lumos.badge.idle",
  "lumos.badge.preview",
  "lumos.badge.running",
  "lumos.badge.stopping",
  "lumos.calibrate-pair",
  "lumos.can-interface",
  "lumos.can-required",
  "lumos.can-running",
  "lumos.capture-closed",
  "lumos.capture-only",
  "lumos.capture-open",
  "lumos.capture-reference",
  "lumos.changed-connection",
  "lumos.check-service",
  "lumos.closed-position",
  "lumos.configured-gripper",
  "lumos.confirm-preview",
  "lumos.confirm-sdk",
  "lumos.connect",
  "lumos.connect-follower",
  "lumos.connect-leader-first",
  "lumos.connected-calibrate",
  "lumos.connected-calibrate-axes",
  "lumos.connection.connected",
  "lumos.connection.connecting",
  "lumos.connection.idle",
  "lumos.control-unavailable",
  "lumos.directions",
  "lumos.emergency-reconnect",
  "lumos.enable-confirmation",
  "lumos.error.already-connected",
  "lumos.error.cancelled",
  "lumos.error.connection-cancelled",
  "lumos.error.enable-confirmation",
  "lumos.error.gripper-configuration-changed",
  "lumos.error.invalid-can-interface",
  "lumos.error.invalid-session",
  "lumos.error.leader-identity",
  "lumos.error.mapping-directions",
  "lumos.error.mapping-gain",
  "lumos.error.mapping-permutation",
  "lumos.error.missing-gripper",
  "lumos.error.missing-gripper-type",
  "lumos.error.missing-service",
  "lumos.error.missing-service-page",
  "lumos.error.missing-six-axes",
  "lumos.error.request-failed",
  "lumos.error.service-timeout",
  "lumos.error.session-ended",
  "lumos.error.session-ended-reconnect",
  "lumos.error.shutdown-unconfirmed",
  "lumos.error.stopped-reconnect",
  "lumos.error.ubuntu-required",
  "lumos.error.wait-for-connection",
  "lumos.expand-check",
  "lumos.factory-unavailable",
  "lumos.finish-calibration",
  "lumos.following-leader",
  "lumos.gain",
  "lumos.gripper-values",
  "lumos.invert-gripper",
  "lumos.joint-map",
  "lumos.leader-connected",
  "lumos.leader-disconnected",
  "lumos.local-console",
  "lumos.local-help-prefix",
  "lumos.local-help-suffix",
  "lumos.lost-leader",
  "lumos.manual-session-unavailable",
  "lumos.mapping",
  "lumos.mapping-confirmation",
  "lumos.mapping-hint",
  "lumos.missing-readback",
  "lumos.mode.preview",
  "lumos.mode.teleoperation",
  "lumos.mode.waiting",
  "lumos.navigation-stopped",
  "lumos.not-captured",
  "lumos.open-position",
  "lumos.origin-unavailable",
  "lumos.paired-teleoperation",
  "lumos.permission",
  "lumos.phase.calibrating",
  "lumos.phase.connected",
  "lumos.phase.connecting",
  "lumos.phase.disconnected",
  "lumos.phase.fault",
  "lumos.phase.idle",
  "lumos.phase.preview",
  "lumos.phase.running",
  "lumos.phase.stopped",
  "lumos.phase.stopping",
  "lumos.preview-values",
  "lumos.ranges",
  "lumos.readbacks",
  "lumos.reconnect-hint",
  "lumos.reference-hint",
  "lumos.sample-hint",
  "lumos.service-check-hint",
  "lumos.six-axes-gripper",
  "lumos.step.calibrate",
  "lumos.step.connect",
  "lumos.step.run",
  "lumos.stop-reconnect",
  "lumos.target-gripper",
  "model.status.failed",
  "model.status.failed-detail",
  "model.status.loading-parts",
  "model.status.ready",
  "pairing.incompatible",
  "pairing.leader-not-connected",
  "pairing.unknown-follower-target",
  "pairing.unknown-leader",
  "pairing.unknown-physical-follower",
  "workspace.act",
  "workspace.act-detail",
  "workspace.caption",
  "workspace.console",
  "workspace.console-detail",
  "workspace.current",
  "workspace.execution",
  "workspace.execution-detail",
  "workspace.label",
  "workspace.title",
];

const variables = {
  type: 'TypeLJ',
  values: '-10.5° / +20.0° / 0.0°',
  actual: '0.0123 m',
  target: '0.0345 m',
  leader: 'Touch R1 (USB-CAN)',
  closed: '-15.0°',
  open: '+35.0°',
  ids: '0, 2, 6',
  status: 503,
  follower: 'LumosTouch',
  allowed: 'Touch R1',
  name: 'Touch R1 / LD',
  count: 17,
  message: 'STL HTTP 404 (mesh_6.stl)',
};

// Static labels use their data-i18n keys directly. Session snapshots retain
// these complete status/error messages, including their expanded variables.
const savedMessageKeys = newKeys.filter(key =>
  /^(lumos\.(error|phase|connection|badge)\.|pairing\.)/.test(key)
  || [
    'lumos.configured-gripper', 'lumos.ranges', 'lumos.preview-values',
    'lumos.gripper-values', 'lumos.can-running', 'lumos.mode.teleoperation',
    'lumos.mode.preview', 'lumos.mode.waiting', 'lumos.permission',
    'lumos.control-unavailable', 'lumos.changed-connection',
    'lumos.leader-disconnected', 'lumos.stop-reconnect',
    'lumos.leader-connected', 'lumos.confirm-sdk', 'lumos.connect-leader-first',
    'lumos.connected-calibrate', 'lumos.connected-calibrate-axes',
    'lumos.origin-unavailable', 'lumos.factory-unavailable',
    'lumos.can-required', 'lumos.emergency-reconnect', 'lumos.lost-leader',
    'lumos.manual-session-unavailable', 'lumos.navigation-stopped',
    'lumos.missing-readback',
  ].includes(key));

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();

before(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: { lang: 'zh' }, querySelectorAll: () => [] },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  });
});

after(() => {
  i18n.setLanguage('zh');
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else delete globalThis.document;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else delete globalThis.localStorage;
});

function rendered(key, language) {
  i18n.setLanguage(language);
  return i18n.tWithVars(key, variables);
}

for (const language of ['zh', 'en']) {
  test('new workspace, Lumos and model messages are localized in ' + language, () => {
    i18n.setLanguage(language);
    assert.equal(document.documentElement.lang, language);
    assert.equal(localStorage.getItem('language'), language);
    for (const key of newKeys) {
      const message = i18n.t(key);
      assert.equal(typeof message, 'string', key);
      assert.ok(message.trim(), key + ' must not be empty');
      assert.notEqual(message, key, key + ' must not fall back to its key');
      if (language === 'en') {
        assert.doesNotMatch(message, /\p{Script=Han}/u, key + ' must not fall back to Chinese');
      }
    }
  });
}

test('new translated templates keep every supplied variable in either language', () => {
  let templateCount = 0;
  for (const language of ['zh', 'en']) {
    i18n.setLanguage(language);
    for (const key of newKeys) {
      const template = i18n.t(key);
      const names = [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
      if (!names.length) continue;
      templateCount += 1;
      const message = i18n.tWithVars(key, variables);
      for (const name of names) {
        assert.ok(Object.hasOwn(variables, name), 'add a sample value for ' + name);
        assert.ok(message.includes(String(variables[name])), key + ' must keep ' + name);
      }
      assert.doesNotMatch(message, /\{\w+\}/, key + ' has an unexpanded placeholder');
    }
  }
  assert.ok(templateCount >= 20, 'both languages must exercise all new variable templates');
});

for (const [from, to] of [['zh', 'en'], ['en', 'zh']]) {
  test('saved Lumos and pairing messages switch from ' + from + ' to ' + to, () => {
    assert.equal(typeof i18n.translateMessage, 'function');
    for (const key of savedMessageKeys) {
      const savedMessage = rendered(key, from);
      const expectedMessage = rendered(key, to);
      assert.equal(i18n.translateMessage(savedMessage), expectedMessage, key);
      assert.equal(i18n.translateMessage(expectedMessage), expectedMessage,
        key + ' already in the selected language');
    }
  });
}

test('saved template values survive repeated language switching', () => {
  const keys = [
    'lumos.configured-gripper', 'lumos.ranges', 'lumos.preview-values',
    'lumos.gripper-values', 'lumos.missing-readback',
    'lumos.error.request-failed', 'pairing.incompatible',
  ];
  for (const key of keys) {
    const original = rendered(key, 'zh');
    let message = original;
    for (const language of ['en', 'zh', 'en', 'zh']) {
      const expected = rendered(key, language);
      message = i18n.translateMessage(message);
      assert.equal(message, expected, key + ' in ' + language);
    }
    assert.equal(message, original, key + ' must round-trip without losing variables');
  }
});

test('template values remain literal across substitution and saved-message translation', () => {
  const literal = "$& $` $' {status}";
  const cases = [
    {
      key: 'lumos.configured-gripper',
      vars: { type: literal, status: 503 },
      zh: '夹爪配置 ' + literal + ' · 请核对实体型号',
      en: 'Gripper: ' + literal + ' · Verify the physical type',
    },
    {
      key: 'pairing.incompatible',
      vars: {
        follower: 'LumosTouch {leader} ' + literal,
        allowed: 'Touch R1',
        leader: 'Star Arm 102-LD',
        status: 503,
      },
      zh: 'LumosTouch {leader} ' + literal
        + ' 仅允许 Touch R1 遥操作，当前连接的是 Star Arm 102-LD。',
      en: 'LumosTouch {leader} ' + literal
        + ' can only be teleoperated by Touch R1. The connected Leader is Star Arm 102-LD.',
    },
  ];
  for (const sample of cases) {
    for (const initialLanguage of ['zh', 'en']) {
      i18n.setLanguage(initialLanguage);
      let message = i18n.tWithVars(sample.key, sample.vars);
      assert.equal(message, sample[initialLanguage], sample.key);
      const otherLanguage = initialLanguage === 'zh' ? 'en' : 'zh';
      for (const language of [otherLanguage, initialLanguage, otherLanguage, initialLanguage]) {
        i18n.setLanguage(language);
        message = i18n.translateMessage(message);
        assert.equal(message, sample[language], sample.key + ' in ' + language);
      }
    }
  }
});

test('initial placeholders translate while live diagnostics keep their contents', () => {
  const key = 'debug.waiting';
  i18n.setLanguage('zh');
  const initialZh = i18n.t(key);
  i18n.setLanguage('en');
  const initialEn = i18n.t(key);
  const diagnostic = '[14:20:12] SDK 原始诊断: CAN bus-off (0x80)\nJ4 timeout';
  const element = text => ({
    tagName: 'PRE',
    childNodes: [{ nodeType: 3, textContent: text }],
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); },
    getAttribute: name => name === 'data-i18n' ? key : null,
    hasAttribute: name => name === 'data-i18n-initial',
  });
  const placeholders = [element(initialZh), element(initialEn)];
  const liveLog = element(diagnostic);
  const querySelectorAll = document.querySelectorAll;
  const originalNode = Object.getOwnPropertyDescriptor(globalThis, 'Node');
  Object.defineProperty(globalThis, 'Node', {
    configurable: true,
    value: { TEXT_NODE: 3 },
  });
  document.querySelectorAll = selector => selector === '[data-i18n]'
    ? [...placeholders, liveLog] : [];
  try {
    for (const [language, expected] of [['en', initialEn], ['zh', initialZh]]) {
      i18n.setLanguage(language);
      for (const placeholder of placeholders) assert.equal(placeholder.textContent, expected);
      assert.equal(liveLog.textContent, diagnostic);
    }
    placeholders[0].childNodes[0].textContent = diagnostic;
    i18n.setLanguage('en');
    assert.equal(placeholders[0].textContent, diagnostic,
      'a placeholder replaced by a live log must no longer be reset');
    assert.equal(placeholders[1].textContent, initialEn);
    assert.equal(liveLog.textContent, diagnostic);
  } finally {
    document.querySelectorAll = querySelectorAll;
    if (originalNode) Object.defineProperty(globalThis, 'Node', originalNode);
    else delete globalThis.Node;
  }
});

test('unknown backend diagnostics remain unchanged in either language', () => {
  const messages = [
    'SDK 未知诊断：总线忙，错误码 0xDEAD。',
    'backend: CAN bus-off (0x80); motor 4 [TypeLJ]',
    'LumosTouch 请求失败（503） trailing server detail',
    'LumosTouch request failed (503) trailing server detail',
    '  raw backend diagnostic\nsecond line  ',
    '',
  ];
  for (const language of ['en', 'zh']) {
    i18n.setLanguage(language);
    for (const message of messages) {
      assert.equal(i18n.translateMessage(message), message);
    }
  }
});
