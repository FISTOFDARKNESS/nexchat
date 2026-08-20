'use client';

import { getSupabase } from '@/lib/supabase';

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL && process.env.NEXT_PUBLIC_WS_URL.trim())
  ? process.env.NEXT_PUBLIC_WS_URL.trim()
  : (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    : '');
const HEARTBEAT_MS = 20_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;
const MAX_SEEN_IDS = 1_000;
const WS_TOKEN_TTL_MS = 4 * 60 * 1000; 

class RealtimeClient {
  constructor() {
    this.userId = null;
    this.connected = false;
    this.connectHandlers = new Set();
    this.identifyErrorHandlers = new Set();
    this._binds = [];
    this._hb = null;
    this._unload = null;
    this._ws = null;
    this._wsRetry = 0;
    this._wsTimer = null;
    this._wsToken = null;
    this._wsTokenAt = 0;
    this._seen = new Set();
    this._lastEventId = 0;
    this._sbChannel = null;
    this._initPromise = null;
    this._connectSeq = 0;
  }

  on(event, cb) {
    if (event === 'connect') {
      this.connectHandlers.add(cb);
      if (this.connected) { try { cb(); } catch (e) { console.error(e); } }
      return;
    }
    if (event === 'identify_error') {
      this.identifyErrorHandlers.add(cb);
      return;
    }
    this._binds.push({ event, cb });
  }

  off(event, cb) {
    if (event === 'connect') { this.connectHandlers.delete(cb); return; }
    if (event === 'identify_error') { this.identifyErrorHandlers.delete(cb); return; }
    this._binds = this._binds.filter(b => !(b.event === event && b.cb === cb));
  }

  async emit(event, payload) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify({ event, payload }));
        return { success: true };
      } catch (e) {
        console.warn('[rt.emit direct ws failed]', event, e.message);
      }
    }

    try {
      const res = await fetch('/api/realtime', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload })
      });
      if (res.status === 401 && this.userId) {
        this._fireIdentifyError('Sessão inválida. Faça login novamente.');
      }
      return await res.json().catch(() => ({}));
    } catch (e) {
      console.error('[rt.emit]', event, e.message);
      return {};
    }
  }

  disconnect() {
    this._stopHeartbeat();
    this._disconnectWs(true);
    this._disconnectSupabase();
    this.connected = false;
  }

  init(userId) {
    if (this._initPromise && this.userId === userId) return this._initPromise;
    this.userId = userId;
    this._initPromise = this._init(userId);
    return this._initPromise;
  }

  async _init(userId) {
    
    await this.emit('session_init').catch(() => {});
    await this._fetchMissedEvents();
    this._connectWs(userId);
    this._connectSupabaseFallback(userId);
    this._startHeartbeat();
  }

  async _getWsToken() {
    const now = Date.now();
    if (this._wsToken && now - this._wsTokenAt < WS_TOKEN_TTL_MS) return this._wsToken;
    try {
      const res = await fetch('/api/realtime/ws-token', { credentials: 'include' });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => ({})));
      this._wsToken = data.token;
      this._wsTokenAt = now;
      return this._wsToken;
    } catch {
      return null;
    }
  }

  async _connectWs(userId) {
    if (!WS_URL) {
      console.warn('[rt] NEXT_PUBLIC_WS_URL não configurada — usando Supabase Realtime');
      return;
    }
    const seq = ++this._connectSeq;
    this._disconnectWs(false);
    const token = await this._getWsToken();
    if (!token) return;
    if (seq !== this._connectSeq) return;

    const url = `${WS_URL.replace(/\/$/, '')}/ws?token=${encodeURIComponent(token)}&platform=${encodeURIComponent(detectPlatform())}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn('[rt] WebSocket indisponível:', e.message);
      this._scheduleWsReconnect(userId);
      return;
    }
    if (seq !== this._connectSeq) { try { ws.close(); } catch {} return; }
    this._ws = ws;

    ws.onopen = () => {
      this._wsRetry = 0;
      this._startWsHeartbeat(ws);
      if (!this.connected) {
        this.connected = true;
        this.connectHandlers.forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
      }
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.event === 'connect') return;
      this._dispatch(msg.event, msg.payload);
    };

    ws.onclose = (ev) => {
      if (this._ws !== ws) return;
      this._ws = null;
      this._stopWsHeartbeat();
      this.connected = false;
      if (ev.code === 4001) {
        this._fireIdentifyError('Sessão inválida. Faça login novamente.');
        return;
      }
      if (this.userId) this._scheduleWsReconnect(this.userId);
    };

    ws.onerror = () => {};
  }

  _startWsHeartbeat(ws) {
    this._stopWsHeartbeat();
    this._hbWs = setInterval(() => {
      try { if (ws.readyState === WebSocket.OPEN) ws.send('{"event":"_hb"}'); } catch {}
    }, 15_000);
  }

  _stopWsHeartbeat() {
    if (this._hbWs) { clearInterval(this._hbWs); this._hbWs = null; }
  }

  _disconnectWs(clearSeen) {
    if (this._wsTimer) { clearTimeout(this._wsTimer); this._wsTimer = null; }
    const ws = this._ws;
    this._ws = null;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.CONNECTING) {
          
          ws.onopen = () => { try { ws.close(); } catch {} };
        } else {
          ws.close();
        }
      } catch {}
    }
    if (clearSeen) { this._seen.clear(); this._lastEventId = 0; }
  }

  _scheduleWsReconnect(userId) {
    if (this._wsTimer) return;
    const delay = Math.min(RECONNECT_MIN_MS * Math.pow(2, this._wsRetry), RECONNECT_MAX_MS);
    this._wsRetry += 1;
    this._wsTimer = setTimeout(() => {
      this._wsTimer = null;
      this._connectWs(userId);
    }, delay);
  }

  _connectSupabaseFallback() {
    
    return;
  }

  _disconnectSupabase() {
    if (this._sbChannel) {
      const sb = getSupabase();
      if (sb) sb.removeChannel(this._sbChannel).catch(() => {});
      this._sbChannel = null;
    }
  }

  async _fetchMissedEvents() {
    try {
      const after = this._lastEventId > 0 ? `?after=${this._lastEventId}` : '';
      const res = await fetch(`/api/realtime/missed${after}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({})));
      for (const row of (data.events || [])) {
        let payload = row.payload;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = {}; } }
        if (Number(row.id) > this._lastEventId) this._lastEventId = Number(row.id);
        this._dispatch(row.event, payload, true);
      }
    } catch {}
  }

  _dispatch(event, payload, fromReplay = false) {
    if (!event) return;
    const eid = payload?.eventId;
    if (eid) {
      const key = String(eid);
      if (this._seen.has(key)) return;
      if (this._seen.size >= MAX_SEEN_IDS) this._seen.delete(this._seen.values().next().value);
      this._seen.add(key);
      if (Number(eid) > this._lastEventId) this._lastEventId = Number(eid);
    }

    if (event === 'match_found' && fromReplay) return;

    for (const { event: ev, cb } of this._binds) {
      if (ev !== event) continue;
      try { cb(payload); } catch (e) { console.error('[rt] handler', event, e.message); }
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    const send = (action) => fetch('/api/realtime/presence', {
      method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    }).catch(() => {});
    this._hb = setInterval(() => send('online'), HEARTBEAT_MS);
    this._unload = () => send('offline');
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this._unload);
  }

  _stopHeartbeat() {
    if (this._hb) clearInterval(this._hb);
    this._hb = null;
    if (this._unload && typeof window !== 'undefined') window.removeEventListener('beforeunload', this._unload);
  }

  _fireIdentifyError(msg) {
    this.identifyErrorHandlers.forEach(cb => { try { cb({ error: msg }); } catch (e) { console.error(e); } });
  }
}

export const rt = new RealtimeClient();
