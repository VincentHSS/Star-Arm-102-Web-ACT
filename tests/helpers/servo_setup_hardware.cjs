// Stateful protocol simulator shared by unit and browser tests. It never opens a device.
function installServoHardware() {
  const state = { baud: null, requested: 0, writes: [], motors: [], dropReads: 0,
    applyWrite: true, dropAfterWrite: false, mutateProtection: false, opens: [], closed: 0 };
  state.addFactory = () => {
    const params = new Uint8Array(33), n = state.motors.length;
    params[0] = 0; params[2] = 1; params[5] = 5; params[6] = 1;
    const view = new DataView(params.buffer);
    for (const offset of [7, 9, 11, 13, 15, 17, 25, 27]) view.setUint16(offset, 100 + n + offset, true);
    view.setInt16(29, -300 - n, true);
    for (const offset of [19, 20, 21, 22, 23, 24]) params[offset] = offset % 2;
    const motor = { number: n, id: 0, baud: 115200, params };
    state.motors.push(motor); return motor;
  };
  state.snapshot = () => state.motors.map(m => ({ number: m.number, id: m.id, baud: m.baud, params: [...m.params] }));
  let incoming;
  const port = {
    async open({ baudRate }) {
      state.baud = baudRate; state.opens.push(baudRate);
      this.readable = new ReadableStream({ start(controller) { incoming = controller; } });
      this.writable = new WritableStream({ write(frame) {
        state.writes.push({ frame: [...frame], baud: state.baud });
        if ((frame.slice(0, -1).reduce((sum, byte) => sum + byte, 0) & 255) !== frame.at(-1)) throw new Error('bad request checksum');
        const hits = state.motors.filter(m => m.id === frame[4] && m.baud === state.baud);
        if (hits.length !== 1) return; // An address collision cannot produce a trustworthy readback.
        const motor = hits[0];
        if (frame[2] === 0x06) {
          if (state.applyWrite) {
            motor.params = Uint8Array.from(frame.slice(4, -1));
            motor.id = frame[7]; motor.baud = frame[9] === 5 ? 115200 : 1000000; motor.params[0] = motor.id;
            if (state.mutateProtection) motor.params[6] ^= 1;
          }
          if (state.dropAfterWrite) state.dropReads = 1;
          return;
        }
        if (frame[2] !== 0x05 || state.dropReads-- > 0) return;
        state.dropReads = Math.max(state.dropReads, 0);
        const response = new Uint8Array(38); response.set([5, 28, 5, 33]); response.set(motor.params, 4);
        response[37] = response.slice(0, 37).reduce((sum, byte) => sum + byte, 0) & 255;
        for (const part of [response.slice(0, 3), response.slice(3, 12), response.slice(12)]) incoming.enqueue(part);
      } });
    },
    async close() { state.closed++; },
  };
  const serial = { async requestPort() { state.requested++; return port; }, addEventListener() {}, removeEventListener() {} };
  if (typeof window !== 'undefined') {
    window.__servoHardware = state;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: serial });
  }
  return { state, serial, port };
}
module.exports = installServoHardware;
