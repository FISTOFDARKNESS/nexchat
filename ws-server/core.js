const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { verifyUserToken } = require('./auth');
const { renderHealthPage } = require('./health-ui');

const INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET || '';

let APP_VERSION = 'unknown';
try {
  const vf = path.join(__dirname, '..', 'src', 'lib', 'version.js');
  const src = fs.readFileSync(vf, 'utf8');
  const m = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (m) APP_VERSION = m[1];
} catch {}

const connections = new Map();

const queue = new Map();

const rooms = new Map();

const GRACE_MS = 20_000;
const pendingCloses = new Map(); 

function cancelPendingClose(userId) {
  if (pendingCloses.has(userId)) {
    clearTimeout(pendingCloses.get(userId));
    pendingCloses.delete(userId);
  }
}

function scheduleRoomCloseForUser(userId) {
  cancelPendingClose(userId);
  pendingCloses.set(userId, setTimeout(() => {
    pendingCloses.delete(userId);
    for (const [rid, room] of rooms) {
      if (room.peerA === userId || room.peerB === userId) {
        rooms.delete(rid);
        if (room.peerA && room.peerA !== userId) pushToUser(room.peerA, 'peer_left', {});
        if (room.peerB && room.peerB !== userId) pushToUser(room.peerB, 'peer_left', {});
      }
    }
  }, GRACE_MS));
}

function addConnection(userId, ws) {
  let set = connections.get(userId);
  if (!set) { set = new Set(); connections.set(userId, set); }
  set.add(ws);
  ws._userId = userId;
}

function getStats() {
  let totalSockets = 0;
  const userPlatforms = new Map();
  for (const [uid, set] of connections) {
    totalSockets += set.size;
    for (const ws of set) {
      const p = ws._platform || 'other';
      if (!userPlatforms.has(uid)) userPlatforms.set(uid, new Set());
      userPlatforms.get(uid).add(p);
    }
  }
  const platforms = { android: 0, ios: 0, windows: 0, mac: 0, linux: 0, other: 0 };
  for (const plats of userPlatforms.values()) {
    for (const p of plats) {
      if (Object.prototype.hasOwnProperty.call(platforms, p)) platforms[p] += 1;
      else platforms.other += 1;
    }
  }
  return {
    ok: true,
    alive: true,
    version: APP_VERSION,
    activeUsers: connections.size,
    connections: totalSockets,
    platforms,
    queue: queue.size,
    rooms: rooms.size,
  };
}

const HISTORY_FILE = path.join(process.cwd(), 'data', 'health-history.json');
const HISTORY_MAX = 7 * 24 * 60; 
let history = [];
try {
  const loaded = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  if (Array.isArray(loaded)) history = loaded;
} catch {  }

function persistHistory() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-HISTORY_MAX)));
  } catch {  }
}

function recordSample() {
  const s = getStats();
  history.push({
    ts: Date.now(),
    activeUsers: s.activeUsers,
    connections: s.connections,
    rooms: s.rooms,
    queue: s.queue,
    platforms: s.platforms,
  });
  if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
  persistHistory();
}

recordSample();
setInterval(recordSample, 60_000).unref?.();

function getHealthHistory() {
  return { current: getStats(), history, generatedAt: Date.now() };
}

function removeConnection(ws) {
  const userId = ws._userId;
  if (!userId) return;
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

function pushToUser(userId, event, payload) {
  const set = connections.get(userId);
  if (!set || set.size === 0) return 0;
  const msg = JSON.stringify({ event, payload });
  let sent = 0;
  for (const ws of set) {
    if (ws.readyState === 1) {
      try { ws.send(msg); sent++; } catch {}
    }
  }
  return sent;
}

function removeFromQueue(userId) {
  queue.delete(userId);
}

function roomForUser(userId) {
  for (const room of rooms.values()) {
    if (room.peerA === userId || room.peerB === userId) return room;
  }
  return null;
}

function findPeer(participant) {
  const pg = participant.prefGender;
  const pg2 = participant.gender;
  const pc = participant.prefCountry;
  const pc2 = participant.country;
  const pmin = Number(participant.prefMinLevel) || 1;
  const pmax = Number(participant.prefMaxLevel) || 100;
  const lvl = Number(participant.level) || 1;

  const candidates = [];
  for (const [uid, peer] of queue) {
    if (uid === participant.userId) continue;
    
    const peerSockets = connections.get(uid);
    if (!peerSockets || peerSockets.size === 0) continue;
    if (peer.mode !== participant.mode) continue;
    if (pg !== 'any' && peer.gender !== pg) continue;
    if (peer.prefGender !== 'any' && pg2 !== peer.prefGender) continue;
    if (pc !== 'any' && peer.country !== pc) continue;
    if (peer.prefCountry !== 'any' && pc2 !== peer.prefCountry) continue;
    if (Number(peer.level) < pmin || Number(peer.level) > pmax) continue;
    if (Number(peer.prefMinLevel) > lvl || Number(peer.prefMaxLevel) < lvl) continue;
    candidates.push(peer);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const pa = a.isPremium ? 1 : 0;
    const pb = b.isPremium ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return candidates[0];
}

function buildProfileData(p) {
  return {
    userId: p.userId,
    username: p.username,
    gender: p.gender || 'other',
    country: p.country || 'BR',
    bio: p.bio || '',
    isPremium: !!p.isPremium,
    verified: !!p.verified,
    level: Number(p.level) || 1,
  };
}

function createRoom(participant, peer) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const peerAData = buildProfileData(participant);
  const peerBData = buildProfileData(peer);
  const room = {
    roomId,
    peerA: participant.userId,
    peerB: peer.userId,
    peerAData,
    peerBData,
    createdAt: new Date().toISOString(),
    
    readyA: false,
    readyB: false,
    enterPushed: false,
  };
  rooms.set(roomId, room);
  return room;
}

function markReady(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false };
  if (room.peerA === userId) room.readyA = true;
  else if (room.peerB === userId) room.readyB = true;
  else return { ok: false };
  if (room.readyA && room.readyB && !room.enterPushed) {
    room.enterPushed = true;
    pushToUser(room.peerA, 'enter_room', { roomId, role: 'caller', partner: room.peerBData });
    pushToUser(room.peerB, 'enter_room', { roomId, role: 'receiver', partner: room.peerAData });
  }
  return { ok: true };
}

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  rooms.delete(roomId);
  if (room.peerA) pushToUser(room.peerA, 'peer_left', {});
  if (room.peerB) pushToUser(room.peerB, 'peer_left', {});
  return room;
}

function joinQueue(participant) {
  removeFromQueue(participant.userId);
  const existing = roomForUser(participant.userId);
  if (existing) {
    const ageMs = Date.now() - new Date(existing.createdAt).getTime();
    if (ageMs < 180_000) {
      return { status: 'matched', room: existing };
    }
    closeRoom(existing.roomId);
  }
  const peer = findPeer(participant);
  if (peer) {
    removeFromQueue(peer.userId);
    const room = createRoom(participant, peer);
    return { status: 'matched', room };
  }
  queue.set(participant.userId, { ...participant, createdAt: new Date().toISOString() });
  return { status: 'waiting' };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function requireInternalSecret(req, res) {
  if (!INTERNAL_SECRET) {
    res.writeHead(503); res.end('WS_INTERNAL_SECRET not configured'); return false;
  }
  if ((req.headers['x-ws-secret'] || '') !== INTERNAL_SECRET) {
    res.writeHead(403); res.end('Forbidden'); return false;
  }
  return true;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function handleHttpRequest(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJson(res, 200, getStats());
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/health/v1')) {
    const u = new URL(req.url, 'http://localhost');
    if (u.searchParams.get('json')) {
      sendJson(res, 200, getHealthHistory());
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHealthPage(getStats(), history));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/push') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { userId, event, payload } = JSON.parse(raw);
      if (!userId || !event) { res.writeHead(400); res.end('userId and event required'); return; }
      const sent = pushToUser(userId, event, payload ?? {});
      sendJson(res, 200, { ok: true, sent });
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/join_queue') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { participant } = JSON.parse(raw);
      if (!participant || !participant.userId) { res.writeHead(400); res.end('participant.userId required'); return; }
      sendJson(res, 200, joinQueue(participant));
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/leave_queue') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { userId } = JSON.parse(raw);
      removeFromQueue(userId);
      sendJson(res, 200, { ok: true });
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/leave_room') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { roomId } = JSON.parse(raw);
      const room = closeRoom(roomId);
      sendJson(res, 200, { ok: true, room: room || null });
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/room_by_id') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { roomId } = JSON.parse(raw);
      sendJson(res, 200, { room: rooms.get(roomId) || null });
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/room_for_user') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { userId } = JSON.parse(raw);
      sendJson(res, 200, { room: roomForUser(userId) || null });
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/mark_ready') {
    if (!requireInternalSecret(req, res)) return;
    readBody(req).then((raw) => {
      const { roomId, userId } = JSON.parse(raw);
      if (!roomId || !userId) { res.writeHead(400); res.end('roomId and userId required'); return; }
      sendJson(res, 200, markReady(roomId, userId));
    }).catch((e) => { res.writeHead(400); res.end(e.message); });
    return;
  }

  res.writeHead(404); res.end('Not found');
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({
    noServer: true,
    
    verifyClient: (info) => {
      const allowed = process.env.WS_ALLOWED_ORIGIN;
      if (!allowed) return true;
      const origin = info.origin || info.req.headers.origin;
      if (!origin) return false;
      const list = allowed.split(',').map((s) => s.trim().toLowerCase());
      return list.includes(origin.toLowerCase());
    },
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const platform = url.searchParams.get('platform') || 'other';
    const auth = verifyUserToken(token);
    if (!auth || !auth.id) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    addConnection(auth.id, ws);
    cancelPendingClose(auth.id); 
    ws._platform = platform;
    ws._isAlive = true;
    ws.send(JSON.stringify({ event: 'connect', payload: { userId: auth.id } }));

    ws.on('pong', () => { ws._isAlive = true; });

    ws.on('message', (raw) => {
      ws._isAlive = true;
      let data;
      try { data = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const { event, payload } = data;
      if (!event || event === '_hb') return;

      const userId = ws._userId;
      if (!userId) return;

      switch (event) {
        case 'join_queue': {
          const ud = payload || {};
          const participant = {
            userId,
            username: ud.username || 'Usuário',
            gender: ud.gender || 'other',
            country: ud.country || 'BR',
            bio: ud.bio || '',
            isPremium: !!ud.isPremium,
            verified: !!ud.verified,
            level: Number(ud.level) || 1,
            prefGender: ud.prefGender || 'any',
            prefCountry: ud.prefCountry || 'any',
            prefMinLevel: Number(ud.prefMinLevel) || 1,
            prefMaxLevel: Number(ud.prefMaxLevel) || 100,
            mode: ud.mode || 'text'
          };
          const res = joinQueue(participant);
          if (res.status === 'matched' && res.room) {
            const room = res.room;
            const isCaller = room.peerA === userId;
            const myData = isCaller ? room.peerAData : room.peerBData;
            const partnerData = isCaller ? room.peerBData : room.peerAData;
            const partnerId = isCaller ? room.peerB : room.peerA;
            pushToUser(userId, 'match_found', { roomId: room.roomId, role: isCaller ? 'caller' : 'receiver', partner: partnerData });
            pushToUser(partnerId, 'match_found', { roomId: room.roomId, role: isCaller ? 'receiver' : 'caller', partner: myData });
          } else {
            pushToUser(userId, 'queue_waiting', {});
          }
          break;
        }

        case 'leave_queue': {
          removeFromQueue(userId);
          break;
        }

        case 'ready_for_room': {
          if (payload?.roomId) {
            markReady(payload.roomId, userId);
          }
          break;
        }

        case 'leave_random_chat': {
          if (payload?.roomId) {
            const room = rooms.get(payload.roomId);
            if (room && (room.peerA === userId || room.peerB === userId)) {
              closeRoom(payload.roomId);
            }
          } else {
            const room = roomForUser(userId);
            if (room) closeRoom(room.roomId);
          }
          break;
        }

        case 'send_random_msg': {
          const { roomId, message } = payload || {};
          let room = roomId ? rooms.get(roomId) : null;
          if (!room) room = roomForUser(userId);
          if (!room) return;
          const partnerId = String(room.peerA) === String(userId) ? room.peerB : room.peerA;
          if (!partnerId) return;

          let msgObj;
          if (typeof message === 'object' && message !== null) {
            msgObj = {
              ...message,
              senderId: userId,
              createdAt: message.createdAt || new Date().toISOString()
            };
          } else {
            msgObj = {
              id: `rmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              senderId: userId,
              content: String(message || payload.content || ''),
              type: payload.type || 'text',
              createdAt: new Date().toISOString()
            };
          }

          pushToUser(partnerId, 'receive_random_msg', msgObj);
          break;
        }

        case 'like_random_msg': {
          const { roomId, messageId } = payload || {};
          const room = roomId ? rooms.get(roomId) : roomForUser(userId);
          if (!room) return;
          const partnerId = room.peerA === userId ? room.peerB : room.peerA;
          if (partnerId) {
            pushToUser(partnerId, 'receive_random_msg_like', { messageId, likedByUserId: userId });
          }
          break;
        }

        case 'react_random_msg': {
          const { roomId, messageId, emoji, username } = payload || {};
          const room = roomId ? rooms.get(roomId) : roomForUser(userId);
          if (!room) return;
          const partnerId = room.peerA === userId ? room.peerB : room.peerA;
          if (partnerId) {
            pushToUser(partnerId, 'random_msg_reacted', { messageId, emoji, userId, username });
          }
          break;
        }

        case 'unreact_random_msg': {
          const { roomId, messageId, emoji } = payload || {};
          const room = roomId ? rooms.get(roomId) : roomForUser(userId);
          if (!room) return;
          const partnerId = room.peerA === userId ? room.peerB : room.peerA;
          if (partnerId) {
            pushToUser(partnerId, 'random_msg_unreacted', { messageId, emoji, userId });
          }
          break;
        }

        case 'send_random_friend_request': {
          const room = payload?.roomId ? rooms.get(payload.roomId) : roomForUser(userId);
          if (!room) return;
          const partnerId = room.peerA === userId ? room.peerB : room.peerA;
          if (partnerId) {
            pushToUser(partnerId, 'receive_random_friend_request', { fromUserId: userId });
          }
          break;
        }

        case 'accept_random_friend_request': {
          const room = payload?.roomId ? rooms.get(payload.roomId) : roomForUser(userId);
          if (!room) return;
          const partnerId = room.peerA === userId ? room.peerB : room.peerA;
          if (partnerId) {
            pushToUser(partnerId, 'receive_random_friend_accepted', { fromUserId: userId });
          }
          break;
        }

        case 'send_friend_msg': {
          const fid = payload?.friendId || payload?.receiverId || payload?.message?.receiverId;
          if (fid) {
            const msgObj = payload?.message || { ...payload, senderId: userId };
            pushToUser(fid, 'receive_friend_msg', msgObj);
          }
          break;
        }

        case 'edit_friend_msg': {
          const fid = payload?.friendId || payload?.message?.receiverId;
          if (fid) pushToUser(fid, 'friend_msg_edited', payload.message || payload);
          break;
        }

        case 'delete_friend_msg': {
          const fid = payload?.friendId;
          if (fid) pushToUser(fid, 'friend_msg_deleted', { messageId: payload.messageId });
          break;
        }

        case 'friend_msgs_read': {
          const fid = payload?.friendId;
          if (fid) pushToUser(fid, 'friend_msgs_read', { readerId: userId });
          break;
        }

        case 'like_friend_msg': {
          const fid = payload?.friendId;
          if (fid) pushToUser(fid, 'receive_friend_msg_like', { messageId: payload.messageId, likedByUserId: userId });
          break;
        }

        case 'react_friend_msg': {
          const fid = payload?.friendId;
          if (fid) pushToUser(fid, 'friend_msg_reacted', { messageId: payload.messageId, emoji: payload.emoji, userId, username: payload.username });
          break;
        }

        case 'unreact_friend_msg': {
          const fid = payload?.friendId;
          if (fid) pushToUser(fid, 'friend_msg_unreacted', { messageId: payload.messageId, emoji: payload.emoji, userId });
          break;
        }

        case 'view_once_viewed': {
          const fid = payload?.friendId;
          if (fid) pushToUser(fid, 'view_once_viewed', { messageId: payload.messageId });
          break;
        }

        case 'send_group_msg': {
          const memberIds = payload?.memberIds || [];
          const msgObj = payload?.message || payload;
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'receive_group_msg', msgObj);
          }
          break;
        }

        case 'group_msgs_read': {
          const memberIds = payload?.memberIds || [];
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'group_msg_read_by', { userId, username: payload.username, messageIds: payload.messageIds, readAt: new Date().toISOString() });
          }
          break;
        }

        case 'like_group_msg': {
          const memberIds = payload?.memberIds || [];
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'receive_group_msg_like', { messageId: payload.messageId, likedByUserId: userId });
          }
          break;
        }

        case 'react_group_msg': {
          const memberIds = payload?.memberIds || [];
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'group_msg_reacted', { messageId: payload.messageId, emoji: payload.emoji, userId, username: payload.username });
          }
          break;
        }

        case 'unreact_group_msg': {
          const memberIds = payload?.memberIds || [];
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'group_msg_unreacted', { messageId: payload.messageId, emoji: payload.emoji, userId });
          }
          break;
        }

        case 'pin_group_msg': {
          const memberIds = payload?.memberIds || [];
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'group_msg_pinned', { messageId: payload.messageId, pinnedAt: payload.pinnedAt });
          }
          break;
        }

        case 'unpin_group_msg': {
          const memberIds = payload?.memberIds || [];
          for (const mid of memberIds) {
            if (mid !== userId) pushToUser(mid, 'group_msg_unpinned', { messageId: payload.messageId });
          }
          break;
        }

        case 'call_friend': {
          if (payload?.targetUserId) {
            pushToUser(payload.targetUserId, `incoming_call_to_${payload.targetUserId}`, { callRoomId: payload.callRoomId, fromUserId: userId, callerName: payload.callerName, type: payload.type });
          }
          break;
        }

        case 'accept_friend_call': {
          if (payload?.targetUserId) {
            pushToUser(payload.targetUserId, `call_accepted_for_${payload.callRoomId}`, { userId });
          }
          break;
        }

        case 'reject_friend_call': {
          if (payload?.targetUserId) {
            pushToUser(payload.targetUserId, `call_rejected_for_${payload.callRoomId}`, { userId });
          }
          break;
        }

        case 'end_friend_call': {
          if (payload?.targetUserId) {
            pushToUser(payload.targetUserId, 'friend_call_ended', { callRoomId: payload.callRoomId });
          }
          break;
        }

        case 'friend_typing': {
          if (payload?.friendId) {
            pushToUser(payload.friendId, 'friend_typing', { senderId: userId, isTyping: !!payload.isTyping });
          }
          break;
        }

        case 'webrtc_offer':
        case 'webrtc_answer':
        case 'webrtc_ice_candidate': {
          if (payload?.to) {
            pushToUser(payload.to, event, payload);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      removeConnection(ws);
      const stillConnected = connections.get(ws._userId) && connections.get(ws._userId).size > 0;
      
      if (!stillConnected) {
        removeFromQueue(ws._userId);
        scheduleRoomCloseForUser(ws._userId);
      }
      if (ws._pingInterval) clearInterval(ws._pingInterval);
    });

    ws.on('error', () => {
      removeConnection(ws);
      if (ws._pingInterval) clearInterval(ws._pingInterval);
    });

    ws._pingInterval = setInterval(() => {
      if (ws.readyState !== 1) return;
      if (ws._isAlive === false) {
        ws.terminate();
        return;
      }
      ws._isAlive = false;
      try { ws.ping(); } catch {}
    }, 25_000);
  });

  return wss;
}

module.exports = { handleHttpRequest, attachWebSocket, connections, queue, rooms };
