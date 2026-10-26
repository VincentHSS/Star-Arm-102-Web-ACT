import { getLanguage } from './i18n.js?v=server-1.0.38';
function translate() {
  const language = getLanguage() === 'en' ? 'en' : 'zh';
  for (const node of document.querySelectorAll('[data-delivery-zh]')) node.textContent = node.dataset[language === 'en' ? 'deliveryEn' : 'deliveryZh'];
}
translate();
window.addEventListener('language-change', translate);
document.addEventListener('DOMContentLoaded', translate);
