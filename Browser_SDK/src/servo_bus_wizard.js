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
