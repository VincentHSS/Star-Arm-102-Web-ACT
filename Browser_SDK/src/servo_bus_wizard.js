import { ServoSetupError } from './servo_setup_flow.js';

export const SERVO_WIZARD_TEMP_ID = 253;
export const SERVO_WIZARD_COUNT = 7;

export class ServoBusWizard {
  constructor({ readAt, changeConfig, reconcile, onChange = () => {}, checkpoint = null }) {
    this.readAt = readAt; this.changeConfig = changeConfig; this.reconcile = reconcile; this.onChange = onChange;
    this.busy = false; this.pauseRequested = false;
    this.state = { schema: 1, phase: 'adding', assigned: 0,
      slots: Array.from({ length: 7 }, (_, index) => ({ index, id: null, baud: 115200 })), pending: null, error: null };
    if (checkpoint) this.restore(checkpoint);
  }

  restore(value) {
    if (value.schema !== 1 || !['adding', 'restore', 'baud', 'complete'].includes(value.phase)
      || !Number.isInteger(value.assigned) || value.assigned < 0 || value.assigned > 7
      || !Array.isArray(value.slots) || value.slots.length !== 7) throw new ServoSetupError('bad-record');
    const ids = new Set();
    for (const [index, slot] of value.slots.entries()) {
      if (!slot || slot.index !== index || ![115200, 1000000].includes(slot.baud)
        || (slot.id !== null && (!Number.isInteger(slot.id) || slot.id < 0 || slot.id > 253 || ids.has(slot.id)))) throw new ServoSetupError('bad-record');
      if (slot.id !== null) ids.add(slot.id);
      if ((index < value.assigned) !== (slot.id !== null)) throw new ServoSetupError('bad-record');
    }
    if (value.phase === 'adding' && value.assigned === 7) throw new ServoSetupError('bad-record');
    if (value.phase !== 'adding' && value.assigned !== 7) throw new ServoSetupError('bad-record');
    if (value.pending) {
      const p = value.pending;
      if (!['assign', 'restore', 'baud'].includes(p.kind) || !Number.isInteger(p.slot) || p.slot < 0 || p.slot > 6
        || p.initialId !== (p.kind === 'assign' ? 0 : value.slots[p.slot].id)
        || p.targetId !== (p.kind === 'assign' ? (p.slot === 0 ? 253 : p.slot) : value.slots[p.slot].index)
        || p.initialBaudRate !== 115200 || p.targetBaudRate !== (p.kind === 'baud' ? 1000000 : 115200)
        || (p.kind === 'assign' && (p.slot !== value.assigned || value.phase !== 'adding'))
        || (p.kind === 'restore' && (p.slot !== 0 || value.phase !== 'restore'))
        || (p.kind === 'baud' && value.phase !== 'baud')) throw new ServoSetupError('bad-record');
    }
    this.state = structuredClone(value);
  }

  snapshot() { return structuredClone({ ...this.state, busy: this.busy, pauseRequested: this.pauseRequested }); }
  checkpoint() { return structuredClone(this.state); }
  emit() { this.onChange(this.snapshot()); }
  requestPause() { this.pauseRequested = true; this.emit(); }

  async verifyKnown() {
    for (const slot of this.state.slots) if (slot.id !== null) {
      const config = await this.readAt(slot.id, slot.baud);
      if (config.id !== slot.id || config.baudrate !== (slot.baud === 115200 ? 5 : 8)) throw new ServoSetupError('known-missing', { id: slot.id });
    }
  }

  commit(pending) {
    const slot = this.state.slots[pending.slot];
    slot.id = pending.targetId; slot.baud = pending.targetBaudRate;
    if (pending.kind === 'assign') {
      this.state.assigned += 1;
      if (this.state.assigned === 7) this.state.phase = 'restore';
    } else if (pending.kind === 'restore') this.state.phase = 'baud';
    this.state.pending = null; this.state.error = null; this.emit();
  }

  async change(kind, slot, initialId, targetId, targetBaudRate) {
    const operation = { kind, slot, initialId, targetId, initialBaudRate: 115200, targetBaudRate };
    const values = await this.readAt(initialId, 115200);
    await this.changeConfig({ ...operation, values, onMutation: mutation => {
      this.state.pending = { ...operation, expected: mutation.expected }; this.emit();
    } });
    this.commit(operation);
  }

  async advance({ newServoConfirmed = false } = {}) {
    if (this.busy) throw new ServoSetupError('busy');
    if (this.state.phase === 'complete') return this.snapshot();
    this.busy = true; this.pauseRequested = false; this.state.error = null; this.emit();
    try {
      // A timed-out write may already have succeeded. A retry first performs
      // read-only reconciliation and never sends that mutation a second time.
      if (this.state.pending) {
        const pending = this.state.pending;
        const result = await this.reconcile(pending);
        if (result.applied) this.commit(pending);
        else { this.state.pending = null; this.emit(); }
        return { ...this.snapshot(), recovered: result.applied };
      }
      await this.verifyKnown();
      if (this.pauseRequested) return this.snapshot();
      if (this.state.phase === 'adding') {
        if (!newServoConfirmed) throw new ServoSetupError('confirm-new');
        const slot = this.state.assigned;
        await this.change('assign', slot, 0, slot === 0 ? 253 : slot, 115200);
      } else if (this.state.phase === 'restore') {
        await this.change('restore', 0, 253, 0, 115200);
      } else if (this.state.phase === 'baud') {
        for (const slot of this.state.slots) {
          if (this.pauseRequested) return this.snapshot();
          if (slot.baud === 1000000) continue;
          await this.change('baud', slot.index, slot.id, slot.id, 1000000);
        }
        await this.verifyKnown();
        this.state.phase = 'complete'; this.emit();
      }
      return this.snapshot();
    } catch (error) {
      this.state.error = { code: error.code || '', message: error.message, details: error.details || {} };
      this.emit(); throw error;
    } finally { this.busy = false; this.emit(); }
  }
}

function waitForNextProbe(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const done = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(done, ms);
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** One explicit start drives discovery, numbering, restore and the final speed pass.
 * Polling is read-only. Only a twice-read factory ID 0 can advance an adding
 * step, after the prior motor was verified at its new ID. Errors end this run.
 */
export class ServoBusAutoRunner {
  constructor({ wizard, probeFactory, onStatus = () => {}, wait = waitForNextProbe, pollMs = 350, stableMs = 180 }) {
    this.wizard = wizard; this.probeFactory = probeFactory; this.onStatus = onStatus;
    this.wait = wait; this.pollMs = pollMs; this.stableMs = stableMs;
    this.running = false; this.status = 'idle'; this.stopRequested = false; this.controller = null;
  }
  report(status) { this.status = status; this.onStatus({ status, running: this.running, slot: this.wizard.state.assigned }); }
  stop() {
    if (!this.running) return;
    this.stopRequested = true; this.wizard.requestPause(); this.controller.abort(new DOMException('Paused', 'AbortError')); this.report('pausing');
  }
  async start() {
    if (this.running) throw new ServoSetupError('busy');
    this.running = true; this.stopRequested = false; this.controller = new AbortController();
    this.wizard.state.error = null;
    try {
      if (this.wizard.state.pending) {
        this.report('recovering');
        const result = await this.wizard.advance();
        // An unchanged source is an observed result, never permission to resend.
        if (!result.recovered) { this.report('unchanged'); return this.wizard.snapshot(); }
      }
      while (!this.stopRequested && this.wizard.state.phase !== 'complete') {
        if (this.wizard.state.phase === 'adding') {
          this.report('waiting');
          const first = await this.probeFactory();
          if (this.stopRequested) break;
          if (!first) { await this.wait(this.pollMs, this.controller.signal); continue; }
          if (first.id !== 0 || first.baudrate !== 5) throw new ServoSetupError('baud-mismatch', { id: 0 });
          this.report('detecting'); await this.wait(this.stableMs, this.controller.signal);
          const second = await this.probeFactory();
          if (this.stopRequested) break;
          if (!second) continue;
          if (JSON.stringify(first) !== JSON.stringify(second)) throw new ServoSetupError('source-changed');
          this.report('writing');
          if (this.stopRequested) break;
          await this.wizard.advance({ newServoConfirmed: true });
        } else {
          this.report(this.wizard.state.phase);
          if (this.stopRequested) break;
          await this.wizard.advance();
        }
      }
      this.report(this.wizard.state.phase === 'complete' ? 'complete' : 'paused');
      return this.wizard.snapshot();
    } catch (error) {
      if (this.stopRequested && error.name === 'AbortError') { this.report('paused'); return this.wizard.snapshot(); }
      this.report('error'); throw error;
    } finally { this.running = false; this.report(this.status); }
  }
}
