const clonePosition = (position) => {
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
    throw new TypeError('TCP 拖拽目标必须是包含 3 个有限数值的数组');
  }
  return [...position];
};

export function freezeTcpDragForExecution({ coordinator, cancelModelDrag, setHandleEnabled }) {
  cancelModelDrag('目标确认已开始');
  coordinator.setEnabled(false, '目标确认已开始');
  setHandleEnabled(false);
}

export class TcpDragPreviewCoordinator {
  constructor({
    enabled = false,
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
    evaluate,
    onValid = () => {},
    onInvalid = () => {},
    onEnd = () => {},
    onCancel = () => {},
  } = {}) {
    if (typeof evaluate !== 'function') throw new TypeError('必须注入 evaluate(position)');
    this.enabled = Boolean(enabled);
    this.dragging = false;
    this.lastValid = null;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.evaluate = evaluate;
    this.onValid = onValid;
    this.onInvalid = onInvalid;
    this.onEnd = onEnd;
    this.onCancel = onCancel;
    this.queuedPosition = null;
    this.frameHandle = null;
  }

  begin({ hitHandle = false } = {}) {
    if (!this.enabled || !hitHandle || this.dragging) return false;
    this.dragging = true;
    return true;
  }

  move(position) {
    if (!this.enabled || !this.dragging) return false;
    this.queuedPosition = clonePosition(position);
    if (this.frameHandle === null) {
      this.frameHandle = this.requestFrame(() => {
        this.frameHandle = null;
        const queued = this.queuedPosition;
        this.queuedPosition = null;
        if (this.dragging && queued) this.process(queued);
      });
    }
    return true;
  }

  process(position) {
    const targetPosition = clonePosition(position);
    const result = this.evaluate(targetPosition);
    if (result?.valid) {
      const valid = { ...result.value, position: targetPosition };
      this.lastValid = valid;
      this.onValid(valid);
      return valid;
    }
    this.onInvalid({
      error: result?.error ?? 'TCP 拖拽目标不可达',
      position: targetPosition,
      lastValid: this.lastValid,
    });
    return null;
  }

  end(position = null) {
    if (!this.dragging) return false;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    const finalPosition = position ? clonePosition(position) : this.queuedPosition;
    this.queuedPosition = null;
    if (finalPosition) this.process(finalPosition);
    this.dragging = false;
    this.onEnd(this.lastValid);
    return true;
  }

  cancel(reason = 'cancelled') {
    const hadState = this.dragging || this.lastValid !== null || this.queuedPosition !== null;
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    this.queuedPosition = null;
    this.dragging = false;
    this.lastValid = null;
    if (hadState) this.onCancel(reason);
    return hadState;
  }

  setEnabled(enabled, reason = 'disabled') {
    const next = Boolean(enabled);
    if (!next) this.cancel(reason);
    this.enabled = next;
  }
}
