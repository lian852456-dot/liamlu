import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';

// Opt-in transport for the isolated demo only. The original server remains
// loopback-only and continues to own all authentication and data decisions.
export function createRemoteBridge({upstreamPort, publicOrigin = '', loginInvite = null, resolveLoginInvite = null, expiresAt = Infinity, now = () => Date.now()}) {
  if (!(expiresAt === Infinity || Number.isFinite(expiresAt))) throw Error('INVALID_PREVIEW_EXPIRY');
  let origin = '';
  let inviteUsed = false;
  function setPublicOrigin(value) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw Error('INVALID_PREVIEW_ORIGIN');
    origin = parsed.origin;
  }
  if (publicOrigin) setPublicOrigin(publicOrigin);
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const reject = (status, error) => {
      res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
      res.end(JSON.stringify({error}));
    };
    const peer = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (!['127.0.0.1','::1'].includes(peer)) return reject(403, 'LOOPBACK_BRIDGE_ONLY');
    if (now() >= expiresAt) return reject(410, 'PREVIEW_EXPIRED');
    if (!origin) return reject(503, 'PREVIEW_STARTING');
    const localHost = `127.0.0.1:${server.address().port}`;
    if (![new URL(origin).host, localHost].includes(req.headers.host)) return reject(403, 'HOST_DENIED');
    if (!['GET','HEAD','POST'].includes(req.method)) return reject(405, 'METHOD_NOT_ALLOWED');
    if (req.headers.origin && req.headers.origin !== origin) return reject(403, 'ORIGIN_DENIED');
    if (req.method === 'POST' && req.headers.origin !== origin) return reject(403, 'ORIGIN_DENIED');
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reject(400, 'BAD_URL');
    const headers = {...req.headers, host:`127.0.0.1:${upstreamPort}`};
    let relayBody = null;
    if ((loginInvite || resolveLoginInvite) && req.method === 'POST' && req.url === '/api/login') {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reject(415, 'JSON_REQUIRED');
      let chunks = [], bytes = 0, body;
      try {
        for await (const chunk of req) {bytes += chunk.length;if (bytes > 16000) return reject(413, 'BODY_TOO_LARGE');chunks.push(chunk);}
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {return reject(400, 'INVALID_JSON');}
      if (body && typeof body === 'object' && !Array.isArray(body) && Object.hasOwn(body, 'oneTime')) {
        if (Object.keys(body).length !== 1 || typeof body.oneTime !== 'string') return reject(401, 'INVITE_EXPIRED');
        if (resolveLoginInvite) {
          let code;
          try { code = resolveLoginInvite(body.oneTime); } catch { return reject(503, 'INVITE_SERVICE_UNAVAILABLE'); }
          if (typeof code !== 'string' || !code) return reject(401, 'INVITE_EXPIRED');
          body = {code};
        } else {
        const supplied = Buffer.from(typeof body.oneTime === 'string' ? body.oneTime : '');
        const expected = Buffer.from(loginInvite.token);
        if (inviteUsed || Date.now() > loginInvite.expiresAt || Object.keys(body).length !== 1 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reject(401, 'INVITE_EXPIRED');
        inviteUsed = true;
        body = {code:loginInvite.code};
        }
      }
      relayBody = Buffer.from(JSON.stringify(body));
      delete headers['transfer-encoding'];headers['content-length'] = String(relayBody.length);
    }
    for (const name of Object.keys(headers)) if (name.startsWith('x-forwarded-') || name.startsWith('cf-') || ['forwarded','connection','upgrade','proxy-authorization','proxy-connection'].includes(name)) delete headers[name];
    if (req.headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
    const upstream = http.request({host:'127.0.0.1', port:upstreamPort, method:req.method, path:req.url, headers}, response => {
      const outgoing = {...response.headers, 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow, noarchive', 'Content-Security-Policy':"frame-ancestors 'self'"};
      delete outgoing.connection;
      if (outgoing['set-cookie']) outgoing['set-cookie'] = outgoing['set-cookie'].map(cookie => cookie + '; Secure');
      res.writeHead(response.statusCode, outgoing);
      response.pipe(res);
    });
    upstream.setTimeout(17000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) reject(502, 'PREVIEW_UPSTREAM_UNAVAILABLE'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    if (relayBody) upstream.end(relayBody);else req.pipe(upstream);
  });
  server.on('connection', socket => {sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on('upgrade', (req, socket, head) => {
    const reject = status => {socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);};
    const peer=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
    if(!['127.0.0.1','::1'].includes(peer))return reject(403);
    if(now()>=expiresAt)return reject(410);
    if(!origin)return reject(503);
    const localHost=`127.0.0.1:${server.address().port}`;
    if(![new URL(origin).host,localHost].includes(req.headers.host)||req.headers.origin!==origin)return reject(403);
    if(req.method!=='GET'||req.url!=='/api/live'||String(req.headers.upgrade).toLowerCase()!=='websocket')return reject(404);
    const headers={...req.headers,host:`127.0.0.1:${upstreamPort}`,origin:`http://127.0.0.1:${upstreamPort}`};
    for(const name of Object.keys(headers))if(name.startsWith('x-forwarded-')||name.startsWith('cf-')||['forwarded','proxy-authorization','proxy-connection'].includes(name))delete headers[name];
    const upstream=http.request({host:'127.0.0.1',port:upstreamPort,path:'/api/live',method:'GET',headers});
    let upgraded=false;
    const timer=setTimeout(()=>upstream.destroy(),10000);
    upstream.once('upgrade',(response,remote,remoteHead)=>{
      upgraded=true;clearTimeout(timer);sockets.add(remote);remote.once('close',()=>sockets.delete(remote));
      socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\r\n')+'\r\n\r\n');
      if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);
      remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());
      remote.once('close',()=>socket.destroy());socket.once('close',()=>remote.destroy());
      socket.pipe(remote).pipe(socket);
    });
    upstream.once('response',response=>{clearTimeout(timer);response.resume();reject(response.statusCode||502);});
    upstream.on('error',()=>{clearTimeout(timer);if(!upgraded)reject(502);});
    socket.once('close',()=>{clearTimeout(timer);if(!upgraded)upstream.destroy();});upstream.end();
  });
  server.requestTimeout = 18000;
  server.headersTimeout = 10000;
  return {server, setPublicOrigin, close:async () => {for(const socket of sockets)socket.destroy();server.closeAllConnections();await new Promise(resolve => server.close(resolve));}};
}
