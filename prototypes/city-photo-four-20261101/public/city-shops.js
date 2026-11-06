/*
 * Small, callback-only shop UI for the isolated city candidate.
 *
 * This module deliberately owns no network/auth/economy state.  The host must
 * provide server-verified callbacks and feed each fresh bootstrap back through
 * controller.setState().  In particular, personalGold is fail-closed unless
 * both a trusted identity and a trusted source are present.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CityShops = api;
})(typeof window === 'undefined' ? null : window, function (root) {
  'use strict';

  const SHOP_DEFINITIONS = Object.freeze([
    { id: 'fashion', title: '服飾店', categories: ['hair', 'outfit'] },
    { id: 'lifestyle', title: '生活選物', categories: ['supplies', 'furniture'] },
    { id: 'pet', title: '寵物店', categories: ['pet', 'petAccessory'] },
    { id: 'scooter', title: '機車行', categories: ['car'], vehicle: 'scooter' },
    { id: 'cars', title: '汽車展示間', categories: ['car'], vehicle: 'cars' },
    { id: 'homes', title: '房屋展示間', categories: ['home'] }
  ].map(Object.freeze));
  const SHOP_BY_ID = Object.freeze(Object.fromEntries(SHOP_DEFINITIONS.map(item => [item.id, item])));
  const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const stateFrom = value => asObject(value);
  const inventoryRows = state => Array.isArray(stateFrom(state).inventory) ? stateFrom(state).inventory : [];
  const itemIdOf = row => row?.item_id ?? row?.itemId ?? null;
  const inventoryIdOf = row => row?.id ?? row?.inventoryId ?? null;
  const owned = (state, itemId) => inventoryRows(state).some(row => itemIdOf(row) === itemId);
  const inventoryIdFor = (state, itemId) => {
    const row = inventoryRows(state).find(value => itemIdOf(value) === itemId);
    return inventoryIdOf(row);
  };
  const profileOf = state => asObject(stateFrom(state).profile);
  const petOf = state => asObject(stateFrom(state).petCompanion);
  const catalogOf = state => Array.isArray(stateFrom(state).catalog) ? stateFrom(state).catalog : [];

  // A client supplied number is never enough to enable a formal-gold purchase.
  function trustedPersonalGold(state) {
    const source = asObject(stateFrom(state).personalGold);
    const identity = source.identity ?? source.identityId ?? source.employeeId ?? source.subject;
    const sourceId = source.source ?? source.sourceId ?? source.receipt ?? source.authoritativeReceipt;
    return source.trusted === true && typeof identity === 'string' && identity.trim() !== '' &&
      typeof sourceId === 'string' && sourceId.trim() !== '';
  }

  function itemBelongsToShop(item, shop) {
    if (!item || !shop || !shop.categories.includes(item.category)) return false;
    if (shop.vehicle === 'scooter') return item.category === 'car' && (item.style === 'scooter' || /^scooter(?:-|$)/.test(item.id || ''));
    if (shop.vehicle === 'cars') return item.category === 'car' && item.style !== 'scooter' && !/^scooter(?:-|$)/.test(item.id || '');
    return true;
  }

  function itemsForShop(state, shopId) {
    const shop = SHOP_BY_ID[shopId] || SHOP_BY_ID.pet;
    return catalogOf(state).filter(item => itemBelongsToShop(item, shop));
  }

  function priceFor(item) {
    if (item?.priceStatus === 'pending') return '價格待訂';
    if (item?.currency === 'personalGold') return Number.isFinite(Number(item.gold)) && Number(item.gold) > 0 ? `${item.gold} 金牌` : '正式金牌';
    if (Number(item?.coins) > 0) return `${item.coins} 金幣`;
    if (Number(item?.gold) > 0) return `${item.gold} 金牌`;
    return '免費';
  }

  function canBuy(state, item) {
    if (item?.priceStatus === 'pending') return false;
    if (item?.currency === 'personalGold') {
      const gold = asObject(stateFrom(state).personalGold);
      const available = Number(gold.available);
      return trustedPersonalGold(state) && Number.isFinite(available) && available >= Number(item.gold || 0);
    }
    const wallet = asObject(stateFrom(state).wallet);
    return Number(wallet.coins || 0) >= Number(item?.coins || 0) && Number(wallet.gold || 0) >= Number(item?.gold || 0);
  }

  function itemView(state, item) {
    const profile = profileOf(state);
    const isOwned = owned(state, item.id);
    const equipped = item.category === 'hair' || item.category === 'outfit' || item.category === 'car' || item.category === 'home'
      ? profile[item.category] === item.id : false;
    const formalGold = item.currency === 'personalGold';
    const trusted = trustedPersonalGold(state);
    const blockedReason = item.priceStatus === 'pending' ? '價格待訂，暫不開放購買' : formalGold && !trusted ? '正式金牌來源待驗證，無法購買' : null;
    const disabled = !isOwned && (Boolean(blockedReason) || !canBuy(state, item));
    return Object.freeze({
      id: item.id,
      name: item.name || item.id,
      category: item.category,
      owned: isOwned,
      equipped,
      price: priceFor(item),
      formalGold,
      trustedPersonalGold: trusted,
      blockedReason,
      disabled,
      action: isOwned ? (equipped ? 'unequip' : item.category === 'pet' ? 'follow' : item.category === 'petAccessory' ? 'accessory' : 'equip') : 'purchase'
    });
  }

  function viewModel(state, shopId) {
    const shop = SHOP_BY_ID[shopId] || SHOP_BY_ID.pet;
    const items = itemsForShop(state, shop.id);
    const pet = petOf(state);
    const petId = pet.inventoryId || null;
    return Object.freeze({
      shop: shop.id,
      title: shop.title,
      items: Object.freeze(items.map(item => itemView(state, item))),
      pet: Object.freeze({
        inventoryId: petId,
        accessoryInventoryId: pet.accessoryInventoryId || null,
        revision: Number.isSafeInteger(pet.revision) ? pet.revision : 0,
        active: Boolean(petId)
      }),
      personalGold: Object.freeze({ trusted: trustedPersonalGold(state), available: Number(asObject(stateFrom(state).personalGold).available) || 0 })
    });
  }

  const randomRequestId = () => {
    const cryptoObject = root?.crypto;
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return cryptoObject.randomUUID();
    return `city-shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  };

  function freshStateFrom(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.bootstrap && typeof result.bootstrap === 'object') return result.bootstrap;
    if (result.state && typeof result.state === 'object') return result.state;
    if (result.catalog && (result.profile || result.wallet || result.inventory || result.petCompanion)) return result;
    return null;
  }

  function createController(options = {}) {
    const config = asObject(options);
    let latestState = config.getState && typeof config.getState === 'function' ? stateFrom(config.getState()) : stateFrom(config.getState);
    let activeShop = SHOP_BY_ID[config.shopId]?.id || 'pet';
    let panel = null;
    let body = null;
    let status = null;
    let mounted = false;
    const purchasePending = new Map();
    const purchaseRequests = new Map();
    const petPending = new Map();
    const petRequests = new Map();
    const equipPending = new Set();

    const documentObject = () => config.document || root?.document || null;
    const make = (tag, text) => {
      const documentValue = documentObject();
      if (!documentValue || typeof documentValue.createElement !== 'function') return null;
      const element = documentValue.createElement(tag);
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const message = text => {
      if (status) status.textContent = String(text || '');
      if (typeof config.onMessage === 'function' && text) config.onMessage(String(text));
    };
    const readState = () => {
      if (!latestState || Object.keys(latestState).length === 0) {
        latestState = config.getState && typeof config.getState === 'function' ? stateFrom(config.getState()) : stateFrom(config.getState);
      }
      return latestState;
    };

    function setState(next) {
      if (next !== undefined) latestState = stateFrom(next);
      else if (config.getState && typeof config.getState === 'function') latestState = stateFrom(config.getState());
      render();
      return latestState;
    }

    function render() {
      if (!mounted || !body) return;
      const oldScroll = Number(body.scrollTop) || 0;
      body.replaceChildren();
      const state = readState();
      const model = viewModel(state, activeShop);
      const shop = SHOP_BY_ID[model.shop];
      const header = make('div');
      if (header) header.className = 'city-shops__section-head';
      const heading = make('h3', shop.title);
      if (heading) header?.append(heading);
      const visit = make('button', '走到店門口');if(visit){visit.type='button';visit.dataset.action='visit';visit.onclick=()=>config.onVisit?.(activeShop);header?.append(visit);}
      if (shop.id === 'pet') {
        const pet = model.pet;
        const label = pet.active ? `目前跟隨中（第 ${pet.revision} 次設定）` : '尚未跟隨寵物';
        const petStatus = make('span', label);
        if (petStatus) { petStatus.className = 'city-shops__pet-status'; header?.append(petStatus); }
      }
      if (header) body.append(header);
      if (!model.items.length) {
        const empty = make('p', '此店尚未提供可展示的原有目錄資料。');
        if (empty) { empty.className = 'city-shops__empty'; body.append(empty); }
      }
      for (const item of model.items) {
        const source = catalogOf(state).find(value => value.id === item.id);
        const card = make('article');
        if (!card) continue;
        card.className = `city-shops__item${item.owned ? ' is-owned' : ''}${item.equipped ? ' is-equipped' : ''}`;
        card.dataset.itemId = item.id;
        const name = make('strong', item.name);
        const meta = make('small', `${({hair:'髮型',outfit:'服裝',car:'交通工具',home:'房屋',supplies:'生活用品',furniture:'家具',pet:'寵物',petAccessory:'寵物配件'})[item.category]||'收藏'} · ${item.price}`);
        if (name) card.append(name);
        if (meta) card.append(meta);
        const row = make('div');
        if (row) row.className = 'city-shops__item-actions';
        if (['home','car'].includes(item.category) && typeof config.onPreview === 'function') {
          const preview = make('button', '預覽');
          if (preview) { preview.type = 'button'; preview.dataset.action = item.category==='home'?'preview-home':'preview-item'; preview.onclick = () => config.onPreview(item.id); row?.append(preview); }
        }
        if(item.category==='home'&&item.owned&&typeof config.onEnterHome==='function'){const enter=make('button','走進我的家');enter.type='button';enter.dataset.action='enter-home';enter.onclick=()=>config.onEnterHome(item.id);row?.append(enter);}
        if (item.blockedReason) {
          const note = make('span', item.blockedReason);
          if (note) { note.className = 'city-shops__notice'; row?.append(note); }
        }
        if (!item.owned) {
          const button = make('button', item.disabled ? (item.blockedReason || '金幣不足') : `購買 ${item.price}`);
          if (button) { button.type = 'button'; button.dataset.action = 'purchase'; button.disabled = item.disabled; button.onclick = () => { const request = controller.purchase(item.id); request?.catch?.(() => {}); }; row?.append(button); }
        } else if (item.category === 'pet') {
          const invId = inventoryIdFor(state, item.id);
          const current = model.pet.inventoryId === invId;
          const button = make('button', current ? '取消跟隨' : '跟隨');
          if (button) { button.type = 'button'; button.dataset.action = current ? 'pet-cancel' : 'pet-select'; button.disabled = !item.owned; button.onclick = () => { const request = controller.selectPet(current ? null : invId); request?.catch?.(() => {}); }; row?.append(button); }
        } else if (item.category === 'petAccessory') {
          const invId = inventoryIdFor(state, item.id);
          const current = model.pet.accessoryInventoryId === invId;
          const button = make('button', current ? '取下配件' : '穿戴');
          if (button) { button.type = 'button'; button.dataset.action = current ? 'pet-accessory-clear' : 'pet-accessory-select'; button.disabled = !item.owned || !model.pet.active; button.onclick = () => { const request = controller.selectPet(model.pet.inventoryId, current ? null : invId, true); request?.catch?.(() => {}); }; row?.append(button); }
        } else if (item.owned && (item.category === 'hair' || item.category === 'outfit' || item.category === 'car' || item.category === 'home')) {
          const button = make('button', item.equipped ? '收回' : '使用');
          if (button) { button.type = 'button'; button.dataset.action = item.equipped ? 'unequip' : 'equip'; button.onclick = () => { const request = controller.equip(item.equipped ? '' : item.id, item.category); request?.catch?.(() => {}); }; row?.append(button); }
        } else if (!item.owned) {
          const button = make('button', item.disabled ? (item.blockedReason || '目前不可購買') : `購買 ${item.price}`);
          if (button) { button.type = 'button'; button.dataset.action = 'purchase'; button.disabled = item.disabled; button.onclick = () => { const request = controller.purchase(item.id); request?.catch?.(() => {}); }; row?.append(button); }
        } else {
          const ownedText = make('span', '已收藏，可從手帳背包使用／布置');
          if (ownedText) row?.append(ownedText);
        }
        if (source?.description) {
          const description = make('small', source.description);
          if (description) { description.className = 'city-shops__description'; card.append(description); }
        }
        if (row) card.append(row);
        body.append(card);
      }
      body.scrollTop = oldScroll;
    }

    function mount(parent) {
      if (mounted) return panel;
      const documentValue = documentObject();
      const host = parent || config.mount || documentValue?.body;
      if (!host) return null;
      panel = make('section');
      if (!panel) return null;
      panel.id = 'city-shops';
      panel.className = 'city-shops';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      const top = make('div');
      if (top) top.className = 'city-shops__topbar';
      const heading = make('h2', '小城商店');
      if (heading) top?.append(heading);
      const close = make('button', '關閉');
      if (close) { close.type = 'button'; close.className = 'city-shops__close'; close.dataset.action = 'close'; close.onclick = controller.close; top?.append(close); }
      if (top) panel.append(top);
      const tabs = make('nav');
      if (tabs) {
        tabs.className = 'city-shops__tabs';
        tabs.setAttribute('aria-label', '商店分類');
        for (const shop of SHOP_DEFINITIONS) {
          const tab = make('button', shop.title);
          if (!tab) continue;
          tab.type = 'button'; tab.dataset.shopId = shop.id; tab.onclick = () => controller.open(shop.id);
          tabs.append(tab);
        }
        panel.append(tabs);
      }
      body = make('div');
      if (!body) return null;
      body.className = 'city-shops__body';
      panel.append(body);
      status = make('p');
      if (status) { status.className = 'city-shops__status'; status.setAttribute('aria-live', 'polite'); panel.append(status); }
      host.append(panel);
      mounted = true;
      render();
      return panel;
    }

    function invokePurchase(itemId) {
      if (purchasePending.has(itemId)) return purchasePending.get(itemId);
      if (typeof config.purchase !== 'function') { message('目前尚未接上購買驗證。'); return null; }
      const item = catalogOf(readState()).find(value => value.id === itemId);
      if (!item || !canBuy(readState(), item) || (item.currency === 'personalGold' && !trustedPersonalGold(readState()))) {
        message(item?.priceStatus === 'pending' ? '價格待訂，暫不開放購買。' : item?.currency === 'personalGold' ? '正式金牌來源待驗證，無法購買。' : '目前餘額不足或商品不可購買。');
        return null;
      }
      const requestId = purchaseRequests.get(itemId) || randomRequestId();
      purchaseRequests.set(itemId, requestId);
      const pending = Promise.resolve().then(() => config.purchase(itemId, requestId)).then(result => {
        const fresh = freshStateFrom(result);
        if (fresh) setState(fresh);
        purchaseRequests.delete(itemId);
        message(`已更新${item?.name || itemId}的庫存。`);
        return result;
      }).catch(error => {
        message(error?.message || '購買未完成，請稍後重試。');
        throw error;
      }).finally(() => purchasePending.delete(itemId));
      purchasePending.set(itemId, pending);
      return pending;
    }

    async function invokeEquip(itemId, category) {
      const key = category || 'appearance';
      if (equipPending.has(key)) return null;
      if (typeof config.equip !== 'function') { message('目前尚未接上裝備驗證。'); return null; }
      equipPending.add(key);
      try {
        const result = await config.equip(itemId || '', category);
        const fresh = freshStateFrom(result);
        if (fresh) setState(fresh);
        message(itemId ? '已更新裝備。' : '已收回裝備。');
        return result;
      } catch (error) {
        message(error?.message || '裝備未完成，請稍後重試。');
        throw error;
      } finally { equipPending.delete(key); }
    }

    async function invokeSelectPet(inventoryId, accessoryInventoryId, accessorySpecified) {
      if (typeof config.selectPet !== 'function') { message('目前尚未接上寵物驗證。'); return null; }
      const state = readState();
      const companion = petOf(state);
      const expectedRevision = Number.isSafeInteger(companion.revision) ? companion.revision : 0;
      const bodyValue = { inventoryId: inventoryId ?? null, expectedRevision, requestId: '' };
      if (accessorySpecified) bodyValue.accessoryInventoryId = accessoryInventoryId ?? null;
      const key = JSON.stringify([bodyValue.inventoryId, bodyValue.accessoryInventoryId ?? '__keep__', expectedRevision]);
      if (petPending.has(key)) return petPending.get(key);
      const requestId = petRequests.get(key) || randomRequestId();
      petRequests.set(key, requestId);
      bodyValue.requestId = requestId;
      const pending = Promise.resolve().then(() => config.selectPet(bodyValue)).then(result => {
        const fresh = freshStateFrom(result);
        if (fresh) setState(fresh);
        petRequests.delete(key);
        message(inventoryId ? '已更新寵物跟隨設定。' : '已取消寵物跟隨。');
        return result;
      }).catch(error => {
        message(error?.message || '寵物設定未完成，請稍後重試。');
        throw error;
      }).finally(() => petPending.delete(key));
      petPending.set(key, pending);
      return pending;
    }

    const controller = {
      mount,
      open(shopId = 'pet') {
        if (!SHOP_BY_ID[shopId]) shopId = 'pet';
        activeShop = shopId;
        const element = mount();
        if (!element) return false;
        element.hidden = false;
        render();
        return element;
      },
      close() { if (panel) panel.hidden = true; },
      setState,
      purchase: invokePurchase,
      equip: invokeEquip,
      selectPet: invokeSelectPet,
      view() { return viewModel(readState(), activeShop); },
      get activeShop() { return activeShop; },
      get element() { return panel; }
    };
    return controller;
  }

  let defaultController = null;
  function init(options = {}) {
    defaultController = createController(options);
    return defaultController;
  }
  function defaultApi(method, ...args) {
    if (!defaultController) defaultController = createController({});
    return defaultController[method](...args);
  }

  return Object.freeze({
    shops: SHOP_DEFINITIONS,
    init,
    // Convenience facade for hosts that keep a single city-shops instance.
    setState: (...args) => defaultApi('setState', ...args),
    open: (...args) => defaultApi('open', ...args),
    close: (...args) => defaultApi('close', ...args),
    itemsForShop,
    viewModel,
    trustedPersonalGold
  });
});
