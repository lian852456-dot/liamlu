(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CozyPhotoMode = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const RECOMMENDED_LANDMARK_IDS = Object.freeze(['taipei101', 'ningxia-night-market', 'forest-vista']);

  function normalizeLandmarks(input) {
    if (!Array.isArray(input)) return [];
    return input
      .filter(item => item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name)
      .map(item => ({id: item.id, name: item.name, district: typeof item.district === 'string' ? item.district : ''}));
  }

  function recommendedLandmarks(input) {
    const byId = new Map(normalizeLandmarks(input).map(item => [item.id, item]));
    return RECOMMENDED_LANDMARK_IDS.map(id => byId.get(id)).filter(Boolean);
  }

  function createPhotoMode(options = {}) {
    const doc = options.document || root.document;
    const world = options.world || root.CozyWorld;
    const urlApi = options.urlApi || root.URL;
    const onVisit = typeof options.onVisit === 'function' ? options.onVisit : () => {};
    const operationRoot = typeof options.operationRoot === 'string' && doc?.querySelector
      ? doc.querySelector(options.operationRoot)
      : options.operationRoot || null;
    let blobUrl = null;
    let operationWasHidden = null;
    let mounted = false;
    let busy = false;
    let captureEpoch = 0;
    let landmarks = normalizeLandmarks(options.landmarks);

    function requireDocument() {
      if (!doc?.createElement) throw new Error('PHOTO_DOCUMENT_REQUIRED');
      return doc;
    }

    function el(tag, className, text) {
      const node = requireDocument().createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    const panel = el('section', 'photo-mode');
    panel.hidden = true;
    panel.setAttribute?.('aria-label', '城市紀念照');
    const title = el('h2', 'photo-mode__title', '城市紀念照');
    const status = el('p', 'photo-mode__status', '保留目前角色與寵物，只擷取遊戲畫布。');
    const preview = el('img', 'photo-mode__preview');
    preview.alt = '遊戲城市紀念照預覽';
    preview.hidden = true;
    const controls = el('div', 'photo-mode__controls');
    const captureButton = el('button', 'photo-mode__capture', '拍下目前畫面');
    captureButton.type = 'button';
    const downloadLink = el('a', 'photo-mode__download', '下載照片');
    downloadLink.hidden = true;
    downloadLink.download = 'city-photo.png';
    const closeButton = el('button', 'photo-mode__close', '關閉');
    closeButton.type = 'button';
    const landmarkList = el('div', 'photo-mode__landmarks');
    controls.append(captureButton, downloadLink, closeButton);
    panel.append(title, status, landmarkList, preview, controls);

    function revokeBlobUrl() {
      if (blobUrl && typeof urlApi?.revokeObjectURL === 'function') urlApi.revokeObjectURL(blobUrl);
      blobUrl = null;
      preview.removeAttribute?.('src');
      preview.hidden = true;
      downloadLink.hidden = true;
      downloadLink.removeAttribute?.('href');
    }

    function setOperationHidden(hidden) {
      if (!operationRoot) return;
      if (hidden) {
        if (operationWasHidden === null) operationWasHidden = Boolean(operationRoot.hidden);
        operationRoot.hidden = true;
      } else if (operationWasHidden !== null) {
        operationRoot.hidden = operationWasHidden;
        operationWasHidden = null;
      }
    }

    function renderLandmarks() {
      landmarkList.replaceChildren?.();
      for (const landmark of recommendedLandmarks(landmarks)) {
        const button = el('button', 'photo-mode__landmark', `前往${landmark.name}取景`);
        button.type = 'button';
        button.dataset.landmarkId = landmark.id;
        button.addEventListener?.('click', () => onVisit(landmark.id));
        landmarkList.append(button);
      }
    }

    async function capture() {
      if (busy) return {ok: false, reason: 'PHOTO_BUSY'};
      if (!world || typeof world.capturePhoto !== 'function') {
        status.textContent = '目前版本尚未提供遊戲畫布擷取。';
        return {ok: false, reason: 'CAPTURE_UNAVAILABLE'};
      }
      if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
        status.textContent = '目前裝置不支援照片預覽。';
        return {ok: false, reason: 'BLOB_URL_UNAVAILABLE'};
      }
      busy = true;
      const epoch = ++captureEpoch;
      captureButton.disabled = true;
      setOperationHidden(true);
      status.textContent = '正在擷取遊戲畫面…';
      revokeBlobUrl();
      try {
        const blob = await world.capturePhoto();
        if (epoch !== captureEpoch) return {ok:false,reason:'CAPTURE_CANCELLED'};
        if (!blob) throw new Error('PHOTO_BLOB_EMPTY');
        blobUrl = urlApi.createObjectURL(blob);
        preview.src = blobUrl;
        if(root.CozyPhotoCapture?.verifyPreview)await root.CozyPhotoCapture.verifyPreview(preview,doc);
        if(epoch!==captureEpoch){revokeBlobUrl();return{ok:false,reason:'CAPTURE_CANCELLED'};}
        preview.hidden = false;
        downloadLink.href = blobUrl;
        downloadLink.hidden = false;
        status.textContent = '照片已準備完成，只保存在你的裝置。';
        return {ok: true, blob, url: blobUrl};
      } catch (error) {
        revokeBlobUrl();
        setOperationHidden(false);
        status.textContent = error?.message==='PHOTO_BUFFER_LIMIT'?'畫面尺寸過大，請縮小視窗後再拍。':'這次照片未通過畫面檢查，請再拍一次；沒有提供黑圖下載，遊戲進度未受影響。';
        return {ok: false, reason: error?.message || 'CAPTURE_FAILED'};
      } finally {
        busy = false;
        captureButton.disabled = false;
      }
    }

    function open() {
      renderLandmarks();
      setOperationHidden(true);
      panel.hidden = false;
      options.onModeChange?.(true);
      return api;
    }

    function close() {
      captureEpoch++;
      revokeBlobUrl();
      setOperationHidden(false);
      panel.hidden = true;
      options.onModeChange?.(false);
      status.textContent = '保留目前角色與寵物，只擷取遊戲畫布。';
      return api;
    }

    function mount(parent = doc?.body) {
      if (!parent?.append) throw new Error('PHOTO_PARENT_REQUIRED');
      if (!mounted) {
        parent.append(panel);
        mounted = true;
      }
      return api;
    }

    const openButton = el('button', 'photo-mode__open', '拍城市紀念照');
    openButton.type = 'button';
    openButton.dataset.photoModeOpen = 'true';
    openButton.addEventListener?.('click', open);
    captureButton.addEventListener?.('click', capture);
    closeButton.addEventListener?.('click', close);

    const api = {
      mount,
      open,
      close,
      capture,
      setLandmarks(next) { landmarks = normalizeLandmarks(next); renderLandmarks(); return landmarks.slice(); },
      recommendedLandmarks: () => recommendedLandmarks(landmarks),
      openButton,
      captureButton,
      closeButton,
      downloadLink,
      preview,
      panel,
      get blobUrl() { return blobUrl; },
      constants: {RECOMMENDED_LANDMARK_IDS},
    };
    return api;
  }

  return {createPhotoMode, normalizeLandmarks, recommendedLandmarks, RECOMMENDED_LANDMARK_IDS};
});
