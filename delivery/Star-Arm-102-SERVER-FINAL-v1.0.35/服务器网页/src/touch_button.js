import { ServoProtocol } from './fashionstar_serial.js?v=server-1.0.35';
import { tWithVars } from './i18n.js?v=server-1.0.35';

// This opt-in exception to Touch R1's read-only profile permits only the
// vendor's six-axis hold/release commands, never position or broadcast writes.
export class TouchButtonController {
  constructor({ enabled = false, buttonId = 7 } = {}) {
    if (typeof enabled !== 'boolean' || !Number.isInteger(buttonId) || buttonId < 7 || buttonId > 253) {
      throw new Error(tWithVars('lumos.button-invalid-id', { id: buttonId }));
    }
    this.enabled = enabled;
    this.buttonId = buttonId;
    this.locked = null;
    this.error = null;
  }
  get monitorIds() { return this.enabled ? [this.buttonId] : []; }
  readState(monitors) {
    if (!this.enabled) return null;
    const angle = monitors[this.buttonId]?.angle;
    if (!Number.isFinite(angle)) {
      this.error = tWithVars('lumos.button-missing', { id: this.buttonId });
      throw new Error(this.error);
    }
    this.error = null;
    return Math.round(angle) === 180;
  }
  async update(monitors, { write, assertCurrent }) {
    if (!this.enabled) return false;
    const locked = this.readState(monitors);
    assertCurrent();
    if (locked === this.locked) return false;
    for (let id = 0; id < 6; id++) {
      assertCurrent();
      await write(ServoProtocol.stopOnControlMode(id, locked ? 0x11 : 0x10, 0));
      assertCurrent();
    }
    this.locked = locked;
    return true;
  }
}
