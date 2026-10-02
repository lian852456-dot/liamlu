'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs');

test('refresh and active reads preserve the original fixed deadline at 11:59:59',()=>{
  const b=runtime(),auth=b.post({action:'ptauth',key:'synthetic-passcode'});
  assert.equal(auth.expiresIn,43200);
  b.advance(43199);
  const restored=b.post({action:'ptauth',token:auth.token});
  assert.equal(restored.token,auth.token);
  assert.equal(restored.expiresAt,auth.expiresAt);
  assert.equal(restored.expiresIn,1);
  assert.equal(b.post({action:'department_scores_read',token:auth.token}).status,'ok');
  b.advance(1);
  assert.equal(b.post({action:'ptauth',token:auth.token}).reason,'AUTH_SESSION_EXPIRED');
});

test('six-hour cache loss does not shorten twelve-hour login and cache TTL stays in platform bounds',()=>{
  const b=runtime(),cache=b.context.CacheService.getScriptCache();
  const original=b.context.CacheService.getScriptCache;
  const ttls=[];
  b.context.CacheService.getScriptCache=()=>({...cache,put:(key,value,ttl)=>{assert.ok(ttl>=1&&ttl<=21600);ttls.push(ttl);cache.put(key,value,ttl);}});
  const auth=b.post({action:'ptauth',key:'synthetic-passcode'});
  assert.equal(ttls[0],21600);
  b.advance(21601);cache.remove(b.context.ptSessionCacheKey_(auth.token));
  const restored=b.post({action:'ptauth',token:auth.token});
  assert.equal(restored.expiresAt,auth.expiresAt);assert.equal(restored.expiresIn,21599);assert.equal(ttls[1],21599);
  b.context.CacheService.getScriptCache=original;
});

test('existing thirty-minute tokens are neither extended nor resurrected by the new policy',()=>{
  const b=runtime();
  const legacy=b.context.ptIssueSession_();
  const claims={...legacy.claims,exp:legacy.claims.iat+1800};
  const payload=b.context.ptBase64UrlEncode_(b.context.Utilities.newBlob(JSON.stringify(claims)).getBytes());
  const token=payload+'.'+b.context.ptSessionSignature_(payload);
  b.advance(1799);
  const restored=b.post({action:'ptauth',token});
  assert.equal(restored.expiresAt,claims.exp);assert.equal(restored.expiresIn,1);
  b.advance(1);assert.equal(b.post({action:'ptauth',token}).reason,'AUTH_SESSION_EXPIRED');
});

test('logout survives cache loss: neither restore nor private reads revive a revoked token',()=>{
  const b=runtime(),auth=b.post({action:'ptauth',key:'synthetic-passcode'});
  const cache=b.context.CacheService.getScriptCache(),cacheKey=b.context.ptSessionCacheKey_(auth.token);
  cache.remove(cacheKey);
  assert.equal(b.post({action:'ptauth',token:auth.token}).status,'ok');
  assert.ok(cache.get(cacheKey));
  assert.equal(b.post({action:'ptlogout',token:auth.token}).status,'ok');
  cache.remove(cacheKey);
  const reads=b.reads,writes=b.writes;
  for(const action of ['ptauth','department_ops_read','department_scores_read','department_store_rules_read']) {
    assert.equal(b.post({action,token:auth.token}).reason,'AUTH_SESSION_REVOKED');
    assert.equal(cache.get(cacheKey),null);
  }
  assert.equal(b.reads,reads);assert.equal(b.writes,writes);
});
