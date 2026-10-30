// Game-only capabilities. A demo card is not a production employee identity.
export const GUEST_WELCOME_COINS = 100;
export const INTERNAL_BUILDINGS = Object.freeze(['operations', 'report', 'kpi', 'awards', 'tradein', 'price']);

const guestGet = new Set(['/api/home','/api/session', '/api/stores', '/api/space', '/api/location', '/api/ledger', '/api/travel', '/api/supervisor']);
const guestPost = new Set(['/api/forest/enter','/api/forest/leave','/api/home/enter','/api/home/leave','/api/guest/card','/api/device/remember','/api/device/forget','/api/logout', '/api/profile', '/api/purchase','/api/pet/follow', '/api/exchange-gold', '/api/travel', '/api/travel/arrive', '/api/decorate', '/api/building/enter', '/api/supervisor/start', '/api/supervisor/ask', '/api/supervisor/complete', '/api/supervisor/end']);

export function guestRouteAllowed(method, path) {
  return method === 'GET' ? guestGet.has(path) : method === 'POST' && guestPost.has(path);
}

export function gameAccess(accountKind) {
  const internalDemo = accountKind === 'demo';
  return {accountKind, businessBuildings: internalDemo, businessTasks: internalDemo, editStores: internalDemo};
}
