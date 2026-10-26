// This standalone package runs its API in the same local origin.
export function chooseCan(devices, preferred) {
  if (devices.some(item => item.name === preferred)) return preferred;
  const saved = devices.filter(item => item.saved);
  return saved.length === 1 ? saved[0].name : devices.length === 1 ? devices[0].name : '';
}

export function initLumosSetup({ locked, onChange, onCheck }) {
  const el = id => document.getElementById(id);
  const status = el('lumosSetupStatus');
  for (const id of ['lumosInstall', 'lumosConfigureCan', 'lumosRetrySetup', 'lumosCanDevices']) el(id).hidden = true;
  let checking = false, error = '';
  function render() {
    status.textContent = error; status.hidden = !error;
    status.classList.toggle('is-error', Boolean(error));
  }
  async function check({ explicit = false } = {}) {
    if (checking || locked()) return;
    checking = true;
    try { await onCheck(); error = ''; }
    catch (problem) { error = problem.message; if (explicit) throw problem; }
    finally { checking = false; render(); onChange(); }
  }
  render();
  return { check, render, get busy() { return checking; }, get canReady() { return true; } };
}
