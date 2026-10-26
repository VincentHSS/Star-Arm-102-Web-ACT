import { PendingPacketQueue, isDeviceLostError } from './browser_serial_utils.js?v=server-1.0.38';
import { PacketParser } from './fashionstar_serial.js?v=server-1.0.38';

function streamEndedError(name) {
  return new Error(`${name} 串口数据流已结束，设备已断开`);
}

export class SerialServoBus {
  constructor(name, options = {}) {
    this.name = name;
    this.errorLogger = options.errorLogger ?? (() => {});
    this.onStateChange = options.onStateChange ?? (() => {});
    this.onLost = options.onLost ?? (() => {});
    this.serial = options.serial ?? globalThis.navigator?.serial;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.parser = new PacketParser();
    this.packetQueue = new PendingPacketQueue();
    this.rawQueue = [];
    this.rawWaiters = [];
    this.reading = false;
    this.lost = false;
    this.disconnecting = false;
    this.connectionEpoch = 0;
    this.connectionTiming = null;
    this.disconnectListener = (event) => {
      if (event.target === this.port) this.markLost(new Error(`${this.name} 串口设备已断开`), { force: true });
    };
  }

  get connected() { return Boolean(this.port && this.writer && !this.lost); }

  async connect(port = null, openOptions = {}) {
    if (this.port) throw new Error(`${this.name} 串口已连接`);
    if (!this.serial && !port) throw new Error('当前浏览器不支持 Web Serial，请使用新版 Chrome 或 Edge');
    const epoch = ++this.connectionEpoch;
    const parser = new PacketParser();
    this.parser = parser;
    this.port = port ?? await this.serial.requestPort();
    this.lost = false;
    this.disconnecting = false;
    const openStarted = performance.now();
    try {
      await this.port.open({ baudRate: 1000000, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', ...openOptions });
      this.connectionTiming = { openMs: performance.now() - openStarted };
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.reading = true;
      this.serial?.addEventListener?.('disconnect', this.disconnectListener);
      void this.readLoop({ epoch, reader: this.reader, parser });
      this.onStateChange();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect() {
    ++this.connectionEpoch;
    this.disconnecting = true;
    this.reading = false;
    this.serial?.removeEventListener?.('disconnect', this.disconnectListener);
    this.rejectPending(new Error(`${this.name} 串口已断开`));
    const reader = this.reader;
    const writer = this.writer;
    const port = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.connectionTiming = null;
    if (reader) {
      try { await reader.cancel(); } catch (_) {}
      try { reader.releaseLock(); } catch (_) {}
    }
    if (writer) try { writer.releaseLock(); } catch (_) {}
    if (port) try { await port.close(); } catch (_) {}
    this.lost = false;
    this.disconnecting = false;
    this.onStateChange();
  }

  async write(frame) {
    if (!this.writer || this.lost) throw new Error(`${this.name} 串口未连接`);
    try { await this.writer.write(frame); }
    catch (error) {
      this.markLost(error);
      throw error;
    }
  }

  async readLoop({ epoch, reader, parser }) {
    const isCurrent = () => epoch === this.connectionEpoch && reader === this.reader && parser === this.parser;
    try {
      while (isCurrent() && this.reading) {
        const { value, done } = await reader.read();
        if (!isCurrent()) break;
        if (done) {
          if (this.reading && !this.disconnecting) this.markLost(streamEndedError(this.name), { force: true });
          break;
        }
        if (!value) continue;
        if (!isCurrent()) break;
        this.pushRaw(value);
        for (const packet of parser.push(value)) this.packetQueue.push(packet);
      }
    } catch (error) {
      if (isCurrent() && this.reading && !this.disconnecting) {
        this.markLost(error, { force: true });
        this.errorLogger(error);
      }
    }
  }

  pushRaw(value) {
    const bytes = Uint8Array.from(value);
    const waiter = this.rawWaiters.shift();
    if (waiter) waiter.resolve(bytes);
    else this.rawQueue.push(bytes);
  }

  clearRaw() { this.rawQueue = []; }

  waitForRaw(timeoutMs = 3000) {
    const queued = this.rawQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      this.rawWaiters.push(waiter);
      waiter.timer = setTimeout(() => {
        const index = this.rawWaiters.indexOf(waiter);
        if (index >= 0) this.rawWaiters.splice(index, 1);
        reject(new Error(`${this.name} 等待舵机响应超时`));
      }, timeoutMs);
      waiter.resolve = (bytes) => { clearTimeout(waiter.timer); resolve(bytes); };
    });
  }

  waitForPacket(predicate, timeoutMs = 300, options) {
    return this.packetQueue.waitFor(predicate, timeoutMs, `${this.name} 等待舵机响应超时`, options);
  }

  /** 丢弃尚未被消费的残留回包（每轮采样开始前调用，避免旧包误匹配当前轮）。 */
  clearPackets({ discardPartial = false } = {}) {
    this.packetQueue.clear();
    // Configuration queries are sequential. Discard a truncated frame from
    // the preceding query, keeping the parser captured by the read loop.
    if (discardPartial) this.parser.buffer = [];
  }

  rejectPending(error) {
    this.packetQueue.rejectAll(error);
    for (const waiter of this.rawWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.rawQueue = [];
  }

  markLost(error, { force = false } = {}) {
    if (this.disconnecting || this.lost || (!force && !isDeviceLostError(error))) return false;
    this.lost = true;
    this.reading = false;
    this.serial?.removeEventListener?.('disconnect', this.disconnectListener);
    this.rejectPending(error);
    this.onStateChange();
    this.onLost(error, this);
    return true;
  }
}
