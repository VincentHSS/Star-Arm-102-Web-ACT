// Keep the workspace picker accessible without replacing the guarded switch flow.
for (const picker of document.querySelectorAll('.workspace-nav details')) {
  const summary = picker.querySelector('summary');
  picker.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker.open) return;
    event.preventDefault();
    picker.open = false;
    summary.focus();
  });
  document.addEventListener('click', event => {
    if (!picker.contains(event.target)) picker.open = false;
  });
  picker.addEventListener('focusout', event => {
    if (event.relatedTarget && !picker.contains(event.relatedTarget)) picker.open = false;
  });
}

// Account for the console's wrapped function tabs when a narrower window is used.
const header = document.querySelector('.console-header');
if (header) {
  const syncHeight = () => document.documentElement.style.setProperty('--workspace-header-height', `${header.getBoundingClientRect().height}px`);
  syncHeight();
  new ResizeObserver(syncHeight).observe(header);
}
