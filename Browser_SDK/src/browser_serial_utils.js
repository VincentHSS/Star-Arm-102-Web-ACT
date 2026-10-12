export class PendingPacketQueue {
  constructor(maxPackets = 100) {
    this.maxPackets = maxPackets;
    this.packets = [];
    this.waiters = [];
  }

  push(packet) {
    const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(packet));
    if (waiterIndex >= 0) {
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(packet);
      return;
    }

    this.packets.push(packet);
    while (this.packets.length > this.maxPackets) this.packets.shift();
  }

  /** 清空已缓冲但尚未被消费的回包（用于每轮采样前丢弃上轮残留，避免旧包被误匹配）。 */
  clear() {
    this.packets = [];
  }

  waitFor(predicate, timeoutMs = 300, timeoutMessage = '等待舵机响应超时') {
    const packetIndex = this.packets.findIndex(predicate);
    if (packetIndex >= 0) {
      const [packet] = this.packets.splice(packetIndex, 1);
      return Promise.resolve(packet);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new Error(timeoutMessage));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  rejectAll(error) {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters = [];
    this.packets = [];
  }
}

export function isDeviceLostError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('device has been lost')
    || message.includes('device lost')
    || message.includes('disconnected')
    || message.includes('串口已断开');
}

export function userMessageForSerialError(error, portName) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('device has been lost')
    || message.includes('device lost')
    || message.includes('disconnected')
    || message.includes('串口已断开')) {
    return `${portName} 串口设备已断开或被系统重置，请检查 USB 线、电源和串口权限，然后重新选择串口。`;
  }
  return `${portName} 串口错误: ${error?.message || error}`;
}
