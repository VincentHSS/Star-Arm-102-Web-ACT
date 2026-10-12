// Motion affects presentation only. Device state changes and emergency actions stay synchronous.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const exits = new Map();
const entrances = new Map();
const savedStyles = new Map();
const ease = 'cubic-bezier(.2,.75,.25,1)';
function clearExit(view) {
  const animation = exits.get(view);
  exits.delete(view);
  if (animation) animation.cancel();
  if (savedStyles.has(view)) {
    const previous = savedStyles.get(view);
    if (previous === null) view.removeAttribute('style'); else view.setAttribute('style', previous);
    savedStyles.delete(view);
  }
  view.classList.remove('motion-leaving');
  view.inert = false;
}
function clearEntrance(view) {
  for (const animation of entrances.get(view) || []) animation.cancel();
  entrances.delete(view);
}
function enter(view) {
  clearEntrance(view);
  if (reducedMotion() || !view.animate) return;
  // Animate the main sections once, rather than on every live data refresh.
  const items = view.id === 'collect'
    ? [...view.children]
    : view.id === 'infer'
      ? [...view.querySelector('.inference-shell').children]
      : [...view.querySelector('.workspace-panel').children].filter(item => item.tagName !== 'INPUT');
  entrances.set(view, items.slice(0, 6).map((item, index) => item.animate(
    [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 200, delay: Math.min(index * 20, 80), easing: ease, fill: 'backwards' }
  )));
}
export function switchWorkbenchView(id) {
  const next = document.getElementById(id);
  if (!next?.classList.contains('view')) return;
  const previous = document.querySelector('.view.active');
  if (previous === next) return;
  for (const view of [...exits.keys()]) clearExit(view);
  if (previous) {
    clearEntrance(previous);
    const rect = previous.getBoundingClientRect();
    if (!reducedMotion() && previous.animate) {
      savedStyles.set(previous, previous.getAttribute('style'));
      previous.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;min-height:0;z-index:8;pointer-events:none;`;
      previous.classList.add('motion-leaving');
      previous.inert = true;
      const animation = previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: ease });
      exits.set(previous, animation);
      animation.finished.then(() => { if (exits.get(previous) === animation) clearExit(previous); }).catch(() => {});
    }
  }
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view === next));
  document.querySelectorAll('.workflow [data-view]').forEach(button => {
    const active = button.dataset.view === id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  clearExit(next);
  enter(next);
}
export function installWorkbenchMotion() {
  const icons = {
    refresh: ['refresh'],
    upload: ['model-import','inference-model-import','dataset-import','inference-calibration-import'],
    download: ['dataset-export','calibration-download'],
    camera: ['detect-cameras','connect-cameras','inference-camera-settings'],
    link: ['connect-leader','connect-follower','bind-devices','calibration-reconnect'],
    unlink: ['disconnect-leader','disconnect-follower','disconnect-cameras'],
    play: ['training-start','inference-start','calibration-start','calibration-resume'],
    stop: ['emergency-stop','inference-stop','training-stop','calibration-cancel'],
    check: ['inference-validate','calibration-save','calibration-apply'],
    sliders: ['open-follower-calibration','open-inference-calibration'],
    close: ['calibration-close'],
  };
  for (const [icon, ids] of Object.entries(icons)) for (const id of ids) {
    const button = document.getElementById(id);
    if (button) button.dataset.uiIcon = icon;
  }
  for (const id of ['episode-review','training-job','training-ready-controls','training-environment-progress','training-failure-panel','training-resume','training-retry','data-dir-setup']) {
    document.getElementById(id)?.classList.add('motion-region');
  }
  document.querySelector('.workflow [data-view].active')?.setAttribute('aria-current', 'step');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', () => {
    if (!media.matches) return;
    for (const view of [...exits.keys()]) clearExit(view);
    for (const view of [...entrances.keys()]) clearEntrance(view);
  });
  const view = document.querySelector('.view.active');
  if (view) enter(view);
}
