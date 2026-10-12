const VALID_VIEWS = new Set(['joint', 'sync']);
const JOINT_COUNT = 7;
const CHANNELS = Array.from({ length: JOINT_COUNT }, (_, index) => index).flatMap(index => [
  { key: `action-j${index + 1}`, kind: 'action', joint: index, label: `Leader action · J${index + 1}`, color: `hsl(${276 - index * 8} 58% ${62 - index * 2}%)` },
  { key: `state-j${index + 1}`, kind: 'state', joint: index, label: `Follower state · J${index + 1}`, color: `hsl(${184 - index * 7} 63% ${58 - index * 2}%)` },
]);

function joints(values) {
  if (!Array.isArray(values) || values.length !== JOINT_COUNT) throw new TypeError('sample must contain J1-J7 values');
  return values.map(Number);
}

function normalizeSample(sample) {
  const timestampMs = Number(sample?.timestamp_ms);
  const stateOffsetMs = Number(sample?.state_offset_ms);
  const actionOffsetMs = Number(sample?.action_offset_ms);
  if (![timestampMs, stateOffsetMs, actionOffsetMs].every(Number.isFinite)) throw new TypeError('sample timestamps and offsets must be finite numbers');
  return { timestampMs, state: joints(sample.observation_state), action: joints(sample.action), stateOffsetMs, actionOffsetMs };
}

export class WaveformBuffer {
  constructor({ limit = 600, toleranceMs = 16 } = {}) {
    this.limit = Math.max(1, Math.floor(limit));
    this.toleranceMs = Number(toleranceMs);
    this.samples = [];
    this.view = 'joint';
    this.joint = null;
    this.visibleChannels = new Set(CHANNELS.map(channel => channel.key));
  }

  append(sample) {
    const normalized = normalizeSample(sample);
    this.samples.push(normalized);
    if (this.samples.length > this.limit) this.samples.splice(0, this.samples.length - this.limit);
    return normalized;
  }

  selectJoint(index) {
    if (!Number.isInteger(index) || index < 0 || index >= JOINT_COUNT) throw new RangeError('joint index must be 0-6');
    this.joint = index;
  }

  selectAllJoints() { this.joint = null; }

  setChannelVisible(key, visible) {
    if (!CHANNELS.some(channel => channel.key === key)) throw new RangeError('unknown waveform channel');
    if (visible) this.visibleChannels.add(key); else this.visibleChannels.delete(key);
  }

  setView(view) {
    if (!VALID_VIEWS.has(view)) throw new RangeError('view must be joint or sync');
    this.view = view;
  }

  channels() {
    const selected = this.joint === null ? CHANNELS : CHANNELS.filter(channel => channel.joint === this.joint);
    return selected.filter(channel => this.visibleChannels.has(channel.key)).map(channel => ({
      ...channel,
      points: this.samples.map(sample => ({ timestampMs: sample.timestampMs, value: sample[channel.kind][channel.joint] })),
    }));
  }

  series() {
    if (this.view === 'sync') return {
      view: 'sync', toleranceMs: this.toleranceMs,
      actionOffset: this.samples.map(sample => ({ timestampMs: sample.timestampMs, value: sample.actionOffsetMs })),
      stateOffset: this.samples.map(sample => ({ timestampMs: sample.timestampMs, value: sample.stateOffsetMs })),
    };
    return { view: 'joint', joint: this.joint, channels: this.channels() };
  }

  stats() { return { samples: this.samples.length, latest: this.samples.at(-1) || null }; }
  clear() { this.samples.length = 0; }
}

function extent(series, fallback = 1) {
  const values = series.flatMap(items => items.map(point => point.value));
  if (!values.length) return [-fallback, fallback];
  const low = Math.min(...values); const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.15, fallback);
  return [low - padding, high + padding];
}

export class WaveformChart {
  constructor(canvas, buffer, { maxDrawHz = 20 } = {}) {
    this.canvas = canvas;
    this.buffer = buffer;
    this.frame = null;
    this.drawTimer = null;
    this.cursorTimestampMs = null;
    this.lastDrawAt = 0;
    this.minDrawIntervalMs = 1000 / Math.max(1, Number(maxDrawHz) || 20);
  }
  schedule() {
    if (this.frame !== null || this.drawTimer !== null) return;
    const wait = Math.max(0, this.minDrawIntervalMs - (performance.now() - this.lastDrawAt));
    if (wait > 0) {
      this.drawTimer = globalThis.setTimeout(() => {
        this.drawTimer = null;
        this.schedule();
      }, wait);
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.lastDrawAt = performance.now();
      this.draw();
    });
  }
  setCursor(timestampMs) { this.cursorTimestampMs = Number.isFinite(timestampMs) ? timestampMs : null; this.schedule(); }
  destroy() {
    if (this.drawTimer !== null) globalThis.clearTimeout(this.drawTimer);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.drawTimer = null;
    this.frame = null;
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect(); const ratio = globalThis.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio)); const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    const context = this.canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cssWidth = width / ratio; const cssHeight = height / ratio;
    context.clearRect(0, 0, cssWidth, cssHeight); this.#grid(context, cssWidth, cssHeight);
    const series = this.buffer.series();
    if (series.view === 'sync') this.#sync(context, series, cssWidth, cssHeight); else this.#joint(context, series, cssWidth, cssHeight);
  }

  #grid(context, width, height) {
    context.strokeStyle = '#283336'; context.lineWidth = 1;
    for (let row = 1; row < 5; row += 1) { const y = (height / 5) * row; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    for (let column = 1; column < 10; column += 1) { const x = (width / 10) * column; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  }

  #line(context, points, color, width, height, range) {
    if (!points.length) return;
    const firstTime = points[0].timestampMs; const lastTime = points.at(-1).timestampMs; const span = Math.max(1, lastTime - firstTime);
    const [low, high] = range; context.strokeStyle = color; context.lineWidth = 1.25; context.beginPath();
    points.forEach((point, index) => { const x = ((point.timestampMs - firstTime) / span) * width; const y = height - ((point.value - low) / Math.max(1, high - low)) * height; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
    context.stroke();
  }

  #joint(context, series, width, height) {
    const range = extent(series.channels.map(channel => channel.points), 5);
    for (const channel of series.channels) this.#line(context, channel.points, channel.color, width, height, range);
    if (this.cursorTimestampMs !== null && series.channels[0]?.points.length) {
      const first = series.channels[0].points[0].timestampMs; const last = series.channels[0].points.at(-1).timestampMs;
      const x = ((this.cursorTimestampMs - first) / Math.max(1, last - first)) * width;
      if (x >= 0 && x <= width) { context.strokeStyle = '#f0c451'; context.lineWidth = 1; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    }
  }

  #sync(context, series, width, height) {
    const range = [-24, 24]; context.strokeStyle = '#e1a64a'; context.lineWidth = 1; context.setLineDash([4, 4]);
    for (const value of [-series.toleranceMs, series.toleranceMs]) { const y = height - ((value - range[0]) / (range[1] - range[0])) * height; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.setLineDash([]); this.#line(context, series.actionOffset, '#a65bc7', width, height, range); this.#line(context, series.stateOffset, '#46d1d8', width, height, range);
  }
}
