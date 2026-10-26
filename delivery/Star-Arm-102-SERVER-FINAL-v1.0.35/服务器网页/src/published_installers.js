const PUBLISHER_ORIGIN = 'https://fashionstar.com.cn';
const filenames = Object.freeze({
  lumos: 'star-arm-lumos_1.0.32_fashionstar_amd64.deb',
  act: 'star-arm-act_1.0.23_fashionstar_all.deb',
});

// Static packages are generated at release time and bound to this exact origin.
// Other websites continue to generate their own correctly bound installers.
export function getPublishedInstaller(origin, { kind = 'act' } = {}) {
  if (origin !== PUBLISHER_ORIGIN || !filenames[kind]) return null;
  return { filename: filenames[kind], origin,
    url: new URL(`../downloads/${filenames[kind]}`, import.meta.url).href };
}

export function downloadPublishedInstaller(origin, options) {
  const installer = getPublishedInstaller(origin, options);
  if (!installer) return false;
  const link = document.createElement('a');
  link.href = installer.url; link.download = installer.filename;
  document.body.append(link); link.click(); link.remove();
  return true;
}
