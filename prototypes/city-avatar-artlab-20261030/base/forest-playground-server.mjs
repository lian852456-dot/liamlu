/**
 * In-memory, server-authoritative state for the forest playground.
 *
 * The host supplies `getPresence(uid)`.  That callback is the integration
 * boundary for already-authenticated multiplayer presence; it must return
 * `{ connected: boolean, position: { scene, x, z } }` from the host's
 * authoritative presence state.  Client seat, client coordinates, cookies,
 * tokens, and game/economic data are deliberately not accepted here.
 *
 * Integration keeps the server's numeric seat 1-based and passes the emitted
 * `seatKey` to the visual module, for example:
 * `visual.seatPose(joined.station, joined.seatKey, serverNow, snapshot.players)`.
 */

const FOREST_SCENE = 'forest';
const STAND_DISTANCE = 1.1;

const STATION_DEFINITIONS = Object.freeze([
  Object.freeze({
    station: 'swing',
    center: Object.freeze({ x: -4.8, z: 2 }),
    stand: Object.freeze({ x: -6.5, z: 2 }),
    capacity: 1,
    ttlMs: 15_000
  }),
  Object.freeze({
    station: 'seesaw',
    center: Object.freeze({ x: -4.8, z: 15 }),
    stand: Object.freeze({ x: -6.5, z: 15 }),
    capacity: 2,
    ttlMs: 20_000
  }),
  Object.freeze({
    station: 'bench',
    center: Object.freeze({ x: -4.8, z: 21 }),
    stand: Object.freeze({ x: -6.5, z: 21 }),
    capacity: 2,
    ttlMs: 120_000
  }),
  Object.freeze({station:'slide',center:Object.freeze({x:-4.8,z:-3}),stand:Object.freeze({x:-6.5,z:-3}),capacity:1,ttlMs:45_000}),
  Object.freeze({station:'balance',center:Object.freeze({x:6.4,z:39.2}),stand:Object.freeze({x:5.7,z:33.6}),capacity:1,ttlMs:45_000}),
  Object.freeze({station:'stumps',center:Object.freeze({x:10.4,z:39.2}),stand:Object.freeze({x:9,z:33.4}),capacity:1,ttlMs:45_000})
]);
const ADVENTURES=new Set(['slide','balance','stumps']);

const ERROR_MESSAGES_ZH = Object.freeze({
  PRESENCE_PROVIDER_REQUIRED: '缺少伺服器位置提供者',
  CLOCK_INVALID: '伺服器時間無效',
  MESSAGE_FIELDS_INVALID: '遊具訊息含有不允許的欄位',
  UID_INVALID: '身份識別無效',
  STATION_INVALID: '森林遊具不存在',
  PRESENCE_INVALID: '伺服器位置資料無效',
  DISCONNECTED: '玩家目前未連線',
  NOT_IN_FOREST: '玩家不在森林場景',
  TOO_FAR: '玩家距離遊具站位太遠',
  STATION_FULL: '遊具座位已滿',
  ALREADY_AT_OTHER_STATION: '玩家已在其他遊具',
  NOT_JOINED: '玩家目前沒有遊具座位',
  ACTION_INVALID: '這個遊具沒有這項操作',
  INPUT_SEQUENCE_INVALID: '遊具操作序號無效',
  INPUT_REPLAY: '這個操作已經處理過',
  INPUT_RATE: '稍等一下再操作',
  GAME_BUSY: '等角色站穩再操作'
});

const STATION_BY_ID = new Map(STATION_DEFINITIONS.map(definition => [definition.station, definition]));

function fail(code) {
  throw new ForestPlaygroundError(code);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeUid(uid) {
  if (typeof uid !== 'string') fail('UID_INVALID');
  const value = uid.trim();
  if (!value || value.length > 160) fail('UID_INVALID');
  return value;
}

function checkedMessage(message, allowedKeys) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) fail('MESSAGE_FIELDS_INVALID');
  if (Object.keys(message).some(key => !allowedKeys.includes(key))) fail('MESSAGE_FIELDS_INVALID');
  return message;
}

function normalizeNow(value) {
  if (!isFiniteNumber(value) || value < 0) fail('CLOCK_INVALID');
  return value;
}

/** Map the server's 1-based seat number to the visual module's anchor key. */
export function visualSeatKey(station, seat) {
  if (ADVENTURES.has(station) && seat === 1) return 'single';
  if (station === 'swing' && seat === 1) return 'single';
  if ((station === 'seesaw' || station === 'bench') && seat === 1) return 'left';
  if ((station === 'seesaw' || station === 'bench') && seat === 2) return 'right';
  fail('STATION_INVALID');
}

function cloneRecord(record) {
  return {
    uid: record.uid,
    station: record.station,
    seat: record.seat,
    seatKey: visualSeatKey(record.station, record.seat),
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    started: true,
    ...(record.game ? {game:{phase:record.game.phase,phaseAt:record.game.phaseAt,at:record.game.at,round:record.game.round,progress:record.game.progress,balance:record.game.balance,step:record.game.step,fallSide:record.game.fallSide}} : {})
  };
}

function distanceToStand(position, definition) {
  return Math.hypot(position.x - definition.stand.x, position.z - definition.stand.z);
}

export class ForestPlaygroundError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES_ZH[code] || '森林遊具操作失敗');
    this.name = 'ForestPlaygroundError';
    this.code = code;
  }
}

export class ForestPlaygroundServer {
  /**
   * @param {{getPresence: (uid: string) => ({connected?: boolean, position?: {scene?: string, x?: number, z?: number}}|undefined|null), clock?: () => number}} options
   */
  constructor({ getPresence, clock = () => Date.now() } = {}) {
    if (typeof getPresence !== 'function') fail('PRESENCE_PROVIDER_REQUIRED');
    if (typeof clock !== 'function') fail('CLOCK_INVALID');
    this._getPresence = getPresence;
    this._clock = clock;
    this._byUid = new Map();
    this._stations = new Map(STATION_DEFINITIONS.map(definition => [
      definition.station,
      { definition, slots: Array(definition.capacity).fill(null), startedAt: null }
    ]));
  }

  /**
   * Join a station using only the server's injected presence position.
   * Extra request fields such as `seat`, `position`, or `connected` are
   * rejected; the caller must update its presence provider. `uid` must be
   * copied from the already-verified connection by the integration boundary.
   */
  join(message = {}) {
    const { uid, station } = checkedMessage(message, ['uid', 'station']);
    const playerUid = normalizeUid(uid);
    const definition = this._definition(station);
    const now = this._now();

    // Every mutation starts by removing expired, disconnected, moved, or
    // out-of-scene occupants. This keeps capacity checks atomic in one call.
    this._prune(now);
    this._requirePresence(playerUid, definition);

    const existing = this._byUid.get(playerUid);
    if (existing) {
      if (existing.station !== definition.station) fail('ALREADY_AT_OTHER_STATION');
      return { ...cloneRecord(existing), idempotent: true };
    }

    const state = this._stations.get(definition.station);
    const seatIndex = state.slots.findIndex(slot => slot === null);
    if (seatIndex < 0) fail('STATION_FULL');

    if (state.startedAt === null) state.startedAt = now;
    const record = Object.freeze({
      uid: playerUid,
      station: definition.station,
      seat: seatIndex + 1,
      startedAt: ADVENTURES.has(station) ? now : state.startedAt,
      expiresAt: now + definition.ttlMs,
      ...(ADVENTURES.has(station) ? {game:{phase:station==='slide'?'climbing':'approaching',phaseAt:now,at:now,lastAt:now,round:0,progress:0,balance:0,step:0,fallSide:1,lastSeq:0,lastInputAt:-Infinity}} : {})
    });
    state.slots[seatIndex] = record;
    this._byUid.set(playerUid, record);
    return { ...cloneRecord(record), idempotent: false };
  }

  // Only bounded intentions enter this state machine. Render-only pool poses
  // never reach presence.persist(), the wallet, inventory or saved position.
  input(message={}) {
    const {uid,station,action,seq}=checkedMessage(message,['uid','station','action','seq']);
    const playerUid=normalizeUid(uid),definition=this._definition(station),now=this._now();
    this._prune(now);
    const record=this._byUid.get(playerUid);
    if(!record||record.station!==station)fail('NOT_JOINED');
    this._requirePresence(playerUid,definition);
    const g=record.game;
    if(!g||!(station==='balance'?['start','retry','left','right']:station==='stumps'?['jump','retry']:[]).includes(action))fail('ACTION_INVALID');
    if(!Number.isSafeInteger(seq)||seq<1||seq>2147483647)fail('INPUT_SEQUENCE_INVALID');
    if(seq<=g.lastSeq)fail('INPUT_REPLAY');
    if(now-g.lastInputAt<180)fail('INPUT_RATE');
    if(station==='balance'){
      if(action==='start'||action==='retry'){
        if(!['ready','complete'].includes(g.phase))fail('GAME_BUSY');
        g.round++;g.progress=0;g.balance=0;g.phase='playing';g.phaseAt=now;g.lastAt=now;
      }else{
        if(g.phase!=='playing')fail('GAME_BUSY');
        g.balance+=(action==='left'?-.28:.28);
        if(Math.abs(g.balance)>=1)this._fall(g,now);
      }
    }else if(action==='retry'){
      if(!['ready','complete'].includes(g.phase))fail('GAME_BUSY');
      g.round++;g.step=0;g.progress=0;g.phase='approaching';g.phaseAt=now;
    }else{
      if(g.phase!=='ready'||g.step>=5)fail('GAME_BUSY');
      if(g.step===0)g.round++;
      g.phase='playing';g.phaseAt=now;
    }
    g.lastSeq=seq;g.lastInputAt=now;g.at=now;
    return cloneRecord(record);
  }

  _fall(g,now){g.phase='falling';g.phaseAt=now;g.lastAt=now;g.fallSide=g.balance<0?-1:1;g.balance=g.fallSide;}

  _advance(record,now){
    const g=record.game;if(!g)return;
    g.at=now;
    if(record.station==='slide'){
      if(g.phase==='climbing'&&now-g.phaseAt>=2400){g.phase='sliding';g.phaseAt+=2400;}
      if(g.phase==='sliding'&&now-g.phaseAt>=1800){g.phase='complete';g.phaseAt+=1800;}
      g.progress=g.phase==='complete'?1:Math.min(1,Math.max(0,(now-g.phaseAt)/(g.phase==='climbing'?2400:1800)));
      if(g.phase==='complete'&&now-g.phaseAt>=1500)this._release(record);
      return;
    }
    if(g.phase==='approaching'&&now-g.phaseAt>=900){g.phase='ready';g.phaseAt+=900;g.progress=0;}
    if(record.station==='stumps'){
      if(g.phase==='playing'){
        const t=Math.min(1,Math.max(0,(now-g.phaseAt)/650));g.progress=(g.step+t)/5;
        if(t>=1){g.step++;g.phase=g.step>=5?'complete':'ready';g.phaseAt+=650;g.progress=g.step/5;}
      }
      return;
    }
    if(g.phase==='playing'){
      let steps=0;
      while(g.lastAt<now&&g.phase==='playing'&&steps++<400){
        const t=Math.min(now,g.lastAt+50),dt=(t-g.lastAt)/1000,elapsed=(t-g.phaseAt)/1000;
        g.balance+=(.15+.34*Math.sin(elapsed*1.45+g.round*.81))*dt;
        g.progress=Math.min(1,g.progress+.075*dt);g.lastAt=t;
        if(Math.abs(g.balance)>=1)this._fall(g,t);
        else if(g.progress>=1){g.phase='complete';g.phaseAt=t;}
      }
    }
    if(g.phase==='falling'&&now-g.phaseAt>=900){g.phase='recovering';g.phaseAt+=900;}
    if(g.phase==='recovering'&&now-g.phaseAt>=1600){g.phase='ready';g.phaseAt+=1600;g.progress=0;g.balance=0;g.lastAt=now;}
  }

  /**
   * Explicitly release one player's seat. Explicit leave does not require a
   * current presence record, so a disconnect can still cleanly release.
   */
  leave(message = {}) {
    const { uid } = checkedMessage(message, ['uid']);
    const playerUid = normalizeUid(uid);
    const now = this._now();
    this._pruneExpired(now);
    const record = this._byUid.get(playerUid);
    if (!record) fail('NOT_JOINED');
    const released = cloneRecord(record);
    this._release(record);
    return { ...released, releasedAt: now };
  }

  /**
   * Remove expired, disconnected, moved, and out-of-forest occupants.
   * The returned snapshot is taken after all releases.
   */
  prune() {
    const now = this._now();
    const released = this._prune(now);
    return { now, released, snapshot: this._snapshot(now) };
  }

  /**
   * Return a current view. Snapshot is self-cleaning, so callers never see a
   * seat that has expired or no longer passes the injected presence check.
   */
  snapshot() {
    const now = this._now();
    this._prune(now);
    return this._snapshot(now);
  }

  _now() {
    return normalizeNow(this._clock());
  }

  _definition(station) {
    if (typeof station !== 'string' || !STATION_BY_ID.has(station)) fail('STATION_INVALID');
    return STATION_BY_ID.get(station);
  }

  _readPresence(uid) {
    try {
      return this._getPresence(uid) || { connected: false };
    } catch {
      // A failing presence dependency fails closed and releases the seat.
      return { connected: false };
    }
  }

  _presenceError(definition, presence) {
    if (!presence || typeof presence !== 'object') return 'PRESENCE_INVALID';
    if (presence.connected !== true) return 'DISCONNECTED';
    const position = presence.position;
    if (!position || typeof position !== 'object') return 'PRESENCE_INVALID';
    if (position.scene !== FOREST_SCENE) return 'NOT_IN_FOREST';
    if (!isFiniteNumber(position.x) || !isFiniteNumber(position.z)) return 'PRESENCE_INVALID';
    if (distanceToStand(position, definition) > STAND_DISTANCE) return 'TOO_FAR';
    return null;
  }

  _requirePresence(uid, definition) {
    const code = this._presenceError(definition, this._readPresence(uid));
    if (code) fail(code);
  }

  _pruneExpired(now) {
    for (const record of [...this._byUid.values()]) {
      if (now >= record.expiresAt) this._release(record);
    }
  }

  _prune(now) {
    const released = [];
    for (const record of [...this._byUid.values()]) {
      if (!this._byUid.has(record.uid)) continue;
      if (now >= record.expiresAt) {
        released.push(cloneRecord(record));
        this._release(record);
        continue;
      }
      const definition = STATION_BY_ID.get(record.station);
      const code = this._presenceError(definition, this._readPresence(record.uid));
      if (code) {
        released.push(cloneRecord(record));
        this._release(record);
      } else {
        this._advance(record,now);
        if(!this._byUid.has(record.uid))released.push(cloneRecord(record));
      }
    }
    return released;
  }

  _release(record) {
    const state = this._stations.get(record.station);
    if (state && state.slots[record.seat - 1]?.uid === record.uid) {
      state.slots[record.seat - 1] = null;
      if (state.slots.every(slot => slot === null)) state.startedAt = null;
    }
    if (this._byUid.get(record.uid) === record) this._byUid.delete(record.uid);
  }

  _snapshot(now) {
    const players = [];
    const stations = STATION_DEFINITIONS.map(definition => {
      const state = this._stations.get(definition.station);
      const occupants = state.slots.filter(Boolean).map(cloneRecord);
      players.push(...occupants);
      return {
        station: definition.station,
        center: { ...definition.center },
        stand: { ...definition.stand },
        capacity: definition.capacity,
        occupied: occupants.length,
        started: state.startedAt !== null,
        startedAt: state.startedAt,
        occupants
      };
    });
    players.sort((a, b) => a.uid.localeCompare(b.uid));
    return { now, players, stations };
  }
}

export const FOREST_PLAYGROUND = Object.freeze({
  scene: FOREST_SCENE,
  standDistance: STAND_DISTANCE,
  stations: STATION_DEFINITIONS,
  errorsZh: ERROR_MESSAGES_ZH
});

