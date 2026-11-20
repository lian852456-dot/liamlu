/* Lightweight social interaction UI.  Network validation and animation live
 * in the world layer; this file only presents choices and emits intents. */
(function(root, factory){
  'use strict';
  const api = factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.CozySocialUI = api;
})(typeof window === 'undefined' ? globalThis : window, function(root){
  'use strict';

  let panel = null;
  let actor = null;
  let toastTimer = 0;
  let signedIn = false;

  const text = value => String(value == null ? '' : value);
  const el = (tag, className, label) => {
    if(typeof document === 'undefined') return null;
    const node = document.createElement(tag);
    if(className) node.className = className;
    if(label != null) node.textContent = text(label);
    return node;
  };
  const dispatch = (name, detail) => {
    if(!root || typeof root.dispatchEvent !== 'function') return;
    let event;
    try { event = new CustomEvent(name, {detail}); }
    catch { event = document.createEvent('CustomEvent'); event.initCustomEvent(name, false, false, detail); }
    root.dispatchEvent(event);
  };
  const clear = node => { if(node) while(node.firstChild) node.removeChild(node.firstChild); };

  function ensurePanel(){
    if(panel || typeof document === 'undefined') return panel;
    panel = el('aside', 'cozy-social-panel');
    panel.id = 'cozy-social-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', '附近互動');
    const header = el('div', 'cozy-social-header');
    const title = el('strong', 'cozy-social-title');
    const close = el('button', 'cozy-social-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉附近互動');
    close.addEventListener('click', closePanel);
    header.append(title, close);
    const subtitle = el('p', 'cozy-social-subtitle');
    const body = el('div', 'cozy-social-body');
    const status = el('p', 'cozy-social-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(header, subtitle, body, status);
    document.body.append(panel);
    panel._title = title; panel._subtitle = subtitle; panel._body = body; panel._status = status;
    return panel;
  }

  function closePanel(){
    if(panel) panel.hidden = true;
    actor = null;
  }

  function setStatus(value){
    if(ensurePanel()) panel._status.textContent = text(value);
  }

  function actionButton(label, kind, disabled, peer, id){
    const button = el('button', 'cozy-social-action', label);
    button.type = 'button';
    button.dataset.kind = kind;
    button.disabled = !!disabled;
    button.addEventListener('click', () => {
      if(button.disabled) return;
      const detail = {targetId:id, kind, peer:!!peer};
      closePanel();
      dispatch('cozy-social-action', detail);
    });
    return button;
  }

  function openActor(options){
    const opts = options && typeof options === 'object' ? options : {};
    const host = ensurePanel();
    if(!host) return false;
    actor = {id:opts.id == null ? '' : opts.id, label:text(opts.label || (opts.peer ? '附近同伴' : '街區鄰居')), peer:!!opts.peer};
    host._title.textContent = actor.label;
    host._subtitle.textContent = actor.peer ? '附近同伴 · 選一個互動' : '示範鄰居 · 選一個互動';
    clear(host._body);
    const note = el('p', 'cozy-social-note', '點選後立即驗證並同步播放。');
    host._body.append(note);
    const disabled = actor.peer && !signedIn;
    host._body.append(
      actionButton('揮手問好', 'greet', disabled, actor.peer, actor.id),
      actionButton('擊掌慶祝', 'highfive', disabled, actor.peer, actor.id),
      actionButton('輕推鬧一下', 'stumble', disabled, actor.peer, actor.id)
    );
    if(!signedIn && actor.peer) setStatus('準備街區連線後就能互動。');
    else setStatus('');
    host.hidden = false;
    return true;
  }

  function setSignedIn(value){
    signedIn = !!value;
    if(!signedIn){
      closePanel();
    }
    return signedIn;
  }

  function resetConnection(){
    closePanel();
  }

  function message(value){
    const host = ensurePanel();
    if(!host) return;
    if(!actor){
      host._title.textContent = '互動提示';
      host._subtitle.textContent = '';
      clear(host._body);
      host.hidden = false;
    }
    host._status.textContent = text(value);
    host.classList.add('cozy-social-message');
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if(panel) panel.classList.remove('cozy-social-message'); }, 2200);
  }

  return Object.freeze({openActor, close:closePanel, setSignedIn, resetConnection, showRequest:() => false, message});
});
