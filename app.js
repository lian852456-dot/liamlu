const views = [...document.querySelectorAll('[data-view]')];
const navButtons = [...document.querySelectorAll('[data-nav]')];
const appStatus = document.querySelector('#connectionStatus');
const supervisorToggle = document.querySelector('#supervisorPreview');
const supervisorOnly = [...document.querySelectorAll('[data-supervisor-only]')];

function setView(viewName) {
  views.forEach(view => view.hidden = view.dataset.view !== viewName);
  navButtons.forEach(button => {
    const active = button.dataset.nav === viewName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  history.replaceState(null, '', `#${viewName}`);
  document.querySelector('.app-main').scrollTo({ top: 0, behavior: 'auto' });
}

function updateConnectionState() {
  const online = navigator.onLine;
  appStatus.className = `connection-pill ${online ? 'online' : 'offline'}`;
  appStatus.textContent = online ? '入口已就緒' : '離線：只保留 App 空殼';
}

function setSupervisorPreview(enabled) {
  supervisorOnly.forEach(element => element.hidden = !enabled);
  supervisorToggle.checked = enabled;
}

navButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.nav)));
supervisorToggle.addEventListener('change', event => setSupervisorPreview(event.target.checked));
window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);
window.addEventListener('hashchange', () => {
  const viewName = location.hash.slice(1);
  if (views.some(view => view.dataset.view === viewName)) setView(viewName);
});

const hashView = location.hash.slice(1);
setView(views.some(view => view.dataset.view === hashView) ? hashView : 'home');
setSupervisorPreview(false);
updateConnectionState();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => {
    console.warn('Liam 情報站 Service Worker 註冊失敗', error);
  }));
}
