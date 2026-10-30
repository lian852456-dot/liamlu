'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const exported = require('../city-server-clock.js');
const CityServerClock = exported.CityServerClock || exported;

function monotonicFixture(start = 1_000) {
  let value = start;
  return {
    read: () => value,
    set: next => { value = next; },
    advance: delta => { value += delta; },
  };
}

test('未完成 server sample 前，clock 不可讀取，也不回退到設備時間', () => {
  const mono = monotonicFixture();
  const clock = CityServerClock.create({ monotonic: mono.read });

  assert.equal(clock.ready(), false);
  assert.throws(() => clock.now(), /CITY_CLOCK/);
});

test('server 時鐘是權威來源，設備 Date.now 前後偏差五分鐘不影響結果', () => {
  const mono = monotonicFixture(10_000);
  const serverTime = 1_700_000_000_000;
  const clock = CityServerClock.create({ monotonic: mono.read });
  const originalDateNow = Date.now;

  try {
    clock.sample(serverTime, 9_800);
    Date.now = () => serverTime + 5 * 60 * 1_000;
    assert.equal(clock.now(), serverTime + 200);
    mono.advance(500);
    Date.now = () => serverTime - 5 * 60 * 1_000;
    assert.equal(clock.now(), serverTime + 700);
  } finally {
    Date.now = originalDateNow;
  }
});

test('clock 只隨 monotonic 前進，重新取樣或設備時間不能把 TTL 往後延長', () => {
  const mono = monotonicFixture(5_000);
  const serverTime = 1_700_000_000_000;
  const expiresAt = serverTime + 5_000;
  const clock = CityServerClock.create({ monotonic: mono.read });

  clock.sample(serverTime, 5_000);
  mono.advance(4_000);
  const beforeExpiry = clock.now();
  assert.equal(beforeExpiry, serverTime + 4_000);
  assert.ok(beforeExpiry < expiresAt);

  // A delayed response with a slightly older server timestamp must not move
  // the already-running city clock backwards or renew an existing lease.
  try {
    clock.sample(serverTime - 1, 8_900);
  } catch (error) {
    // An implementation may reject a stale sample; it must never use it to
    // move an already-running clock backwards.
    assert.match(error.message, /CITY_CLOCK/);
  }
  assert.ok(clock.now() >= beforeExpiry);
  mono.advance(1_000);
  assert.ok(clock.now() >= expiresAt);
});

test('無效 server timestamp、request start 或過大的 monotonic RTT 一律拒絕', () => {
  const mono = monotonicFixture(10_000);
  const clock = CityServerClock.create({ monotonic: mono.read });
  const invalidSamples = [
    [NaN, 9_900],
    [Infinity, 9_900],
    ['1700000000000', 9_900],
    [1_700_000_000_000, NaN],
    [1_700_000_000_000, Infinity],
    [1_700_000_000_000, 10_001],
  ];

  for (const [serverTime, requestStartedMono] of invalidSamples) {
    assert.throws(() => clock.sample(serverTime, requestStartedMono), /CITY_CLOCK/);
  }

  mono.set(1_000_000);
  assert.throws(() => clock.sample(1_700_000_000_000, 0), /CITY_CLOCK/);
  assert.equal(clock.ready(), false);
});
