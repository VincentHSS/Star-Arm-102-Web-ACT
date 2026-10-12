// Navigation commits only after current control has stopped and ports are released.
export function createSingleFlight(operation) {
  let pending = null;
  return (...args) => {
    if (!pending) pending = Promise.resolve().then(() => operation(...args)).finally(() => { pending = null; });
    return pending;
  };
}

export function setInteractionStatus(message, kind = 'pending') {
  let status = document.getElementById('interaction-status');
  if (!status) {
    status = document.createElement('div'); status.id = 'interaction-status';
    status.className = 'interaction-status'; status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite'); document.body.append(status);
  }
  clearTimeout(setInteractionStatus.timer);
  status.textContent = message; status.dataset.kind = kind; status.hidden = !message;
  if (message && kind !== 'pending') setInteractionStatus.timer = setTimeout(() => { status.hidden = true; }, 7000);
}

const buttonActions = new WeakMap();
export function withButtonFeedback(button, action, { label, restore } = {}) {
  if (buttonActions.has(button)) return buttonActions.get(button);
  const text = button.textContent, disabled = button.disabled;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  if (label) button.textContent = label;
  // Invoke immediately: browser serial/file dialogs must retain the click's user activation.
  let operation;
  try { operation = action(); } catch (error) { operation = Promise.reject(error); }
  const pending = Promise.resolve(operation).catch(error => { setInteractionStatus(error.message, 'error'); })
    .finally(() => {
      buttonActions.delete(button); button.removeAttribute('aria-busy');
      if (label) button.textContent = text;
      if (restore) restore(); else button.disabled = disabled;
    });
  buttonActions.set(button, pending);
  return pending;
}

export function createPageNavigator({ release, activate, onPending = () => {}, onError = () => {} }) {
  let pending = null;
  return function navigate(target) {
    if (pending) return pending;
    // Keep release in a microtask so repeated clicks see the same pending operation.
    pending = Promise.resolve().then(async () => {
      onPending(target, true);
      try {
        await release(target);
        await activate(target);
        return true;
      } catch (error) {
        onError(error);
        return false;
      } finally {
        onPending(target, false);
        pending = null;
      }
    });
    return pending;
  };
}

export async function releaseWorkbenchConnections(expectedListeners) {
  const waits = [];
  window.dispatchEvent(new CustomEvent('workbench:before-switch', { detail: { waits } }));
  if (waits.length < expectedListeners) throw new Error('页面还在初始化，请稍后再切换。');
  const results = await Promise.allSettled(waits);
  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new Error(failures.map(error => error.message).join('；'));
}
