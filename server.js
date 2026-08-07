const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const next = require('next');
const { Server } = require('socket.io');
const DOMPurify = require('isomorphic-dompurify');
const { getPool, sql } = require('./src/lib/db.js');

// Carrega variáveis do .env local (no Render elas vêm do ambiente)
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnvFile(path.join(__dirname, '.env'));

function sanitizeConnectionString(url) {
  const [base, query = ''] = url.split('?');
  if (!query) return url;
  const kept = query.split('&').filter((p) => !/^ssl/i.test(p));
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

function setUserOnline(userId, online) {
  const pool = getPool();
  if (!pool) return;
  pool.query('UPDATE "User" SET "isOnline" = $2 WHERE id = $1', [userId, online])
    .catch((e) => console.error('Erro ao atualizar isOnline:', e.message));
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// --- Sessão por cookie HttpOnly (mesmo HMAC do Next) ---
const SESSION_COOKIE_NAME = 'nexchat_session';
function getSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
  return process.env.JWT_SECRET;
}
function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.id) return null;
    return payload;
  } catch {
    return null;
  }
}
function getCookie(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

// Verifica se há bloqueio em qualquer direção entre dois usuários
function isBlocked(userIdA, userIdB) {
  const pool = getPool();
  if (!pool || !userIdA || !userIdB) return Promise.resolve(false);
  return pool.query(
    `SELECT 1 FROM "Block" WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
    [userIdA, userIdB]
  ).then(r => r.rows.length > 0).catch(() => false);
}

// Push notifications
let webpush = null;
function getWebPush() {
  if (!webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      webpush = require('web-push');
      webpush.setVapidDetails(
        `mailto:${process.env.SMTP_FROM || 'no-reply@nexchat.app'}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } catch (e) {
      console.error('Erro ao inicializar web-push:', e);
    }
  }
  return webpush;
}

async function sendPushNotificationToUser(userId, payload) {
  const wp = getWebPush();
  const pool = getPool();
  if (!wp || !pool) return;

  try {
    const res = await pool.query(`SELECT endpoint, p256dh, auth FROM "PushSubscription" WHERE "userId" = $1`, [userId]);
    for (const sub of res.rows) {
      try {
        await wp.sendNotification(sub, JSON.stringify(payload));
      } catch (err) {
        console.error('Erro ao enviar push para subscription:', err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(`DELETE FROM "PushSubscription" WHERE endpoint = $1`, [sub.endpoint]);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao buscar subscriptions:', err);
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false,
      methods: ["GET", "POST"]
    }
  });
  // Expõe o Socket.IO para as rotas Next.js (ex.: notificar view-once)
  globalThis.__nexchatIo = io;

  // Fila de Matchmaking em memória
  // Cada item: { socketId, userId, username, gender, country, prefGender, prefCountry, mode }
  let matchmakingQueue = []; // MAX LIMIT 500

  // Quartos ativos do Omegle: roomId -> { peerA: socketId, peerB: socketId }
  let activeRandomRooms = {};

  // Chamadas diretas ativas: callRoomId -> { callerSocketId, callerUserId, calleeUserId, createdAt }
  let activeCalls = {};

  // Mapeia socketId -> userId (definido via evento 'identify')
  let socketUsers = {};

  // Mapeia userId -> Set de socketIds (presença por usuário)
  let userSockets = {};

  // Rate limiting simples por socket para eventos de mensagem
  const socketRateLimit = new Map();
  const SOCKET_RATE_LIMIT_WINDOW = 10_000;
  const SOCKET_RATE_LIMIT_MAX = 20;

  function checkSocketRateLimit(socketId) {
    const now = Date.now();
    const entry = socketRateLimit.get(socketId);
    if (!entry || now - entry.window > SOCKET_RATE_LIMIT_WINDOW) {
      socketRateLimit.set(socketId, { count: 1, window: now });
      return true;
    }
    entry.count += 1;
    if (entry.count > SOCKET_RATE_LIMIT_MAX) {
      return false;
    }
    return true;
  }

  // Limpa entradas antigas periodicamente
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of socketRateLimit.entries()) {
      if (now - entry.window > SOCKET_RATE_LIMIT_WINDOW) {
        socketRateLimit.delete(key);
      }
    }

    // Cleanup active rooms that might have leaked (TTL 2 hours)
    for (const [roomId, room] of Object.entries(activeRandomRooms)) {
      if (room.createdAt && now - room.createdAt > 7200000) {
        delete activeRandomRooms[roomId];
      }
    }

    // Cleanup active calls that might have leaked (TTL 2 hours)
    for (const [callRoomId, call] of Object.entries(activeCalls)) {
      if (call.createdAt && now - call.createdAt > 7200000) {
        delete activeCalls[callRoomId];
      }
    }
  }, 30_000);

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

    socket.on('identify', ({ userId } = {}) => {
      if (!userId) return;
      const sessionToken = getCookie(socket.handshake, SESSION_COOKIE_NAME);
      const session = verifySessionToken(sessionToken);
      if (!session || session.id !== userId) {
        socket.emit('identify_error', { error: 'Sessão inválida. Faça login novamente.' });
        return;
      }
      socketUsers[socket.id] = userId;
      if (!userSockets[userId]) userSockets[userId] = new Set();
      const wasOffline = userSockets[userId].size === 0;
      userSockets[userId].add(socket.id);
      if (wasOffline) {
        getPool()?.query('SELECT "invisibleMode" FROM "User" WHERE id = $1 LIMIT 1', [userId])
          .then(res => {
            const invisible = res.rows[0]?.invisibleMode;
            if (!invisible) {
              io.emit('user_online', { userId });
              setUserOnline(userId, true);
            }
          })
          .catch(() => {});
      }
    });

    // 1. FILA DE MATCHMAKING (OMEGLE)
    socket.on('join_queue', async (userData) => {
      // userData: { userId, username, gender, country, prefGender, prefCountry, mode }
      // mode: 'text' ou 'video'
      
      // Remove qualquer entrada antiga deste socket da fila
      matchmakingQueue = matchmakingQueue.filter(item => item.socketId !== socket.id);

      let premiumFlag = false;
      let bioText = '';
      try {
        const p = await getPool()?.query('SELECT "premiumTier", "premiumExpiresAt", bio FROM "User" WHERE id = $1 LIMIT 1', [userData.userId]);
        const u = p.rows[0];
        premiumFlag = !!(u?.premiumTier === 'premium' && u?.premiumExpiresAt && new Date(u.premiumExpiresAt) > new Date());
        bioText = u?.bio || '';
      } catch {}

      const newParticipant = {
        socketId: socket.id,
        userId: userData.userId,
        username: userData.username,
        gender: userData.gender || 'other',
        country: userData.country || 'BR',
        bio: bioText,
        prefGender: userData.prefGender || 'any',
        prefCountry: userData.prefCountry || 'any',
        mode: userData.mode || 'text',
        joinedAt: Date.now(),
        isPremium: premiumFlag
      };

      if (matchmakingQueue.length > 500) {
        // Prevent queue from growing unbounded
        socket.emit('queue_waiting');
        socket.emit('error', { message: 'Fila muito cheia, tente novamente mais tarde.' });
        return;
      }

      console.log(`Usuário entrou na fila: ${newParticipant.username} (Gênero: ${newParticipant.gender}, PrefGênero: ${newParticipant.prefGender}, Modo: ${newParticipant.mode})`);

      // Tenta encontrar um par na fila
      let matchedPeer = null;

      // Premium tem prioridade: procura primeiro entre outros premium
      for (let i = 0; i < matchmakingQueue.length; i++) {
        const potentialPeer = matchmakingQueue[i];
        if (!potentialPeer.isPremium) continue;
        if (potentialPeer.mode !== newParticipant.mode) continue;
        if (newParticipant.prefGender !== 'any' && potentialPeer.gender !== newParticipant.prefGender) continue;
        if (potentialPeer.prefGender !== 'any' && newParticipant.gender !== potentialPeer.prefGender) continue;
        if (newParticipant.prefCountry !== 'any' && potentialPeer.country !== newParticipant.prefCountry) continue;
        if (potentialPeer.prefCountry !== 'any' && newParticipant.country !== potentialPeer.prefCountry) continue;
        matchedPeer = potentialPeer;
        matchmakingQueue.splice(i, 1);
        break;
      }

      if (!matchedPeer) {
        for (let i = 0; i < matchmakingQueue.length; i++) {
          const potentialPeer = matchmakingQueue[i];
          if (potentialPeer.mode !== newParticipant.mode) continue;
          if (newParticipant.prefGender !== 'any' && potentialPeer.gender !== newParticipant.prefGender) continue;
          if (potentialPeer.prefGender !== 'any' && newParticipant.gender !== potentialPeer.prefGender) continue;
          if (newParticipant.prefCountry !== 'any' && potentialPeer.country !== newParticipant.prefCountry) continue;
          if (potentialPeer.prefCountry !== 'any' && newParticipant.country !== potentialPeer.prefCountry) continue;
          matchedPeer = potentialPeer;
          matchmakingQueue.splice(i, 1);
          break;
        }
      }

      if (matchedPeer) {
        // Encontrou par! Cria uma sala temporária aleatória
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        activeRandomRooms[roomId] = {
          peerA: socket.id,
          peerB: matchedPeer.socketId,
          peerAData: newParticipant,
          peerBData: matchedPeer,
          createdAt: Date.now()
        };

        // Associa os dois à sala no socket
        socket.join(roomId);
        const peerSocket = io.sockets.sockets.get(matchedPeer.socketId);
        if (peerSocket) {
          peerSocket.join(roomId);
        }

        // Emite match_found para ambos, enviando detalhes do parceiro
        socket.emit('match_found', {
          roomId,
          role: 'caller', // Aquele que inicia a chamada WebRTC
          partner: {
            userId: matchedPeer.userId,
            username: matchedPeer.username,
            gender: matchedPeer.gender,
            country: matchedPeer.country,
            bio: matchedPeer.bio || ''
          }
        });

        io.to(matchedPeer.socketId).emit('match_found', {
          roomId,
          role: 'receiver',
          partner: {
            userId: newParticipant.userId,
            username: newParticipant.username,
            gender: newParticipant.gender,
            country: newParticipant.country,
            bio: newParticipant.bio || ''
          }
        });

        console.log(`Match criado! Sala: ${roomId} entre ${newParticipant.username} e ${matchedPeer.username}`);
      } else {
        // Sem match disponível no momento, adiciona à fila (premium tem prioridade)
        if (newParticipant.premium) {
          matchmakingQueue.unshift(newParticipant);
        } else {
          matchmakingQueue.push(newParticipant);
        }
        socket.emit('queue_waiting');
      }
    });

    // Sair da fila de matchmaking
    socket.on('leave_queue', () => {
      matchmakingQueue = matchmakingQueue.filter(item => item.socketId !== socket.id);
      console.log(`Socket saiu da fila: ${socket.id}`);
    });

    // Sair do chat aleatório
    socket.on('leave_random_chat', (data) => {
      const { roomId } = data;
      if (roomId && activeRandomRooms[roomId]) {
        io.to(roomId).emit('peer_left');
        
        // Remove os sockets da sala e limpa
        const room = activeRandomRooms[roomId];
        const socketA = io.sockets.sockets.get(room.peerA);
        const socketB = io.sockets.sockets.get(room.peerB);
        if (socketA) socketA.leave(roomId);
        if (socketB) socketB.leave(roomId);

        delete activeRandomRooms[roomId];
        console.log(`Sala random fechada: ${roomId}`);
      }
    });

    // 2. MENSAGERIA EM TEMPO REAL NO CHAT ALEATÓRIO
    socket.on('send_random_msg', (data) => {
      if (!checkSocketRateLimit(socket.id)) {
        socket.emit('rate_limited');
        return;
      }
      // data: { roomId, message: { id, content, senderId, senderName, parentMessageId, parentMessageContent } }
      const { roomId, message } = data;
      if (!message || typeof message.content !== 'string') return;
      // Sanitiza o conteúdo contra XSS antes de retransmitir ao parceiro
      const cleanContent = DOMPurify.sanitize(message.content).trim();
      if (!cleanContent) return;
      socket.to(roomId).emit('receive_random_msg', { ...message, content: cleanContent });
    });

    // Curtir mensagem no Chat Aleatório
    socket.on('like_random_msg', (data) => {
      if (!checkSocketRateLimit(socket.id)) {
        socket.emit('rate_limited');
        return;
      }
      // data: { roomId, messageId, likedByUserId }
      const { roomId, messageId, likedByUserId } = data;
      socket.to(roomId).emit('receive_random_msg_like', { messageId, likedByUserId });
    });

    socket.on('react_random_msg', (data) => {
      if (!checkSocketRateLimit(socket.id)) {
        socket.emit('rate_limited');
        return;
      }
      const { roomId, messageId, emoji, userId, username } = data;
      socket.to(roomId).emit('random_msg_reacted', { messageId, emoji, userId, username });
    });

    socket.on('unreact_random_msg', (data) => {
      const { roomId, messageId, emoji, userId } = data;
      socket.to(roomId).emit('random_msg_unreacted', { messageId, emoji, userId });
    });

    // Enviar pedido de amizade no chat aleatório
    socket.on('send_random_friend_request', (data) => {
      // data: { roomId, senderId }
      const { roomId, senderId } = data;
      socket.to(roomId).emit('receive_random_friend_request', { senderId });
    });

    // Aceitar pedido de amizade no chat aleatório
    socket.on('accept_random_friend_request', (data) => {
      // data: { roomId, senderId }
      const { roomId, senderId } = data;
      socket.to(roomId).emit('receive_random_friend_accepted', { senderId });
    });

    // 3. SINALIZAÇÃO WEBRTC (CHAMADA DE VÍDEO/ÁUDIO P2P)
    // data: { roomId, from, to, offer|answer|candidate } — 'to' é o destinatário do mesh
    socket.on('webrtc_offer', (data) => {
      const { roomId, from, to, offer } = data;
      if (!roomId || !from || !to || !offer) return;
      socket.to(roomId).emit('webrtc_offer', { roomId, from, to, offer });
    });

    socket.on('webrtc_answer', (data) => {
      const { roomId, from, to, answer } = data;
      if (!roomId || !from || !to || !answer) return;
      socket.to(roomId).emit('webrtc_answer', { roomId, from, to, answer });
    });

    socket.on('webrtc_ice_candidate', (data) => {
      const { roomId, from, to, candidate } = data;
      if (!roomId || !from || !to) return;
      socket.to(roomId).emit('webrtc_ice_candidate', { roomId, from, to, candidate });
    });

    // 4. CHAT PRIVADO COM AMIGOS (WHATSAPP/DISCORD)
    socket.on('join_friend_chat', (data) => {
      // data: { roomId } (gerado concatenando e ordenando os IDs dos dois amigos)
      const { roomId } = data;
      socket.join(roomId);
      console.log(`Socket ${socket.id} entrou no chat com amigo: ${roomId}`);
    });

    socket.on('leave_friend_chat', (data) => {
      const { roomId } = data;
      socket.leave(roomId);
      console.log(`Socket ${socket.id} saiu do chat com amigo: ${roomId}`);
    });

    // 4.5 CHAT EM GRUPO
    socket.on('join_group_chat', (data) => {
      const { groupId } = data;
      if (!groupId) return;
      socket.join(`group_chat_${groupId}`);
      console.log(`Socket ${socket.id} entrou no grupo: ${groupId}`);
    });

    socket.on('leave_group_chat', (data) => {
      const { groupId } = data;
      if (!groupId) return;
      socket.leave(`group_chat_${groupId}`);
      console.log(`Socket ${socket.id} saiu do grupo: ${groupId}`);
    });

    socket.on('send_group_msg', (data) => {
      if (!checkSocketRateLimit(socket.id)) {
        socket.emit('rate_limited');
        return;
      }
      // data: { groupId, message: { id, groupId, senderId, senderName, content, createdAt } }
      const { groupId, message } = data;
      if (!groupId || !message) return;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('receive_group_msg', message);
      // Entrega direta aos membros online que estão fora da sala do grupo
      const members = io.sockets.adapter.rooms.get(roomId);
      getPool()?.query('SELECT "userId" FROM "GroupMember" WHERE "groupId" = $1', [groupId])
        .then(res => {
          const memberIds = new Set(res.rows.map(r => r.userId));
          for (const [id, sock] of io.sockets.sockets) {
            const uid = socketUsers[id];
            if (uid && uid !== message.senderId && memberIds.has(uid) && (!members || !members.has(id))) {
              sock.emit('receive_group_msg', message);
            }
          }
        })
        .catch(() => {});
    });

    socket.on('react_group_msg', (data) => {
      const { groupId, messageId, emoji, userId, username } = data;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('group_msg_reacted', { messageId, emoji, userId, username });
    });

    socket.on('unreact_group_msg', (data) => {
      const { groupId, messageId, emoji, userId } = data;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('group_msg_unreacted', { messageId, emoji, userId });
    });

    socket.on('like_group_msg', (data) => {
      // data: { groupId, messageId, likedByUserId }
      const { groupId, messageId, likedByUserId } = data;
      if (!groupId || !messageId || !likedByUserId) return;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('receive_group_msg_like', { messageId, likedByUserId });
    });

    socket.on('pin_group_msg', (data) => {
      // data: { groupId, messageId, pinnedAt }
      const { groupId, messageId, pinnedAt } = data;
      if (!groupId || !messageId) return;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('group_msg_pinned', { messageId, pinnedAt: pinnedAt || new Date().toISOString() });
    });

    socket.on('unpin_group_msg', (data) => {
      const { groupId, messageId } = data;
      if (!groupId || !messageId) return;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('group_msg_unpinned', { messageId });
    });

    socket.on('send_friend_msg', (data) => {
      if (!checkSocketRateLimit(socket.id)) {
        socket.emit('rate_limited');
        return;
      }
      // data: { roomId, message: { id, senderId, receiverId, content, parentMessageId, parentMessageContent } }
      const { roomId, message } = data;
      if (!roomId || !message) return;
      isBlocked(message.senderId, message.receiverId).then((blocked) => {
        if (blocked) return; // não repassa mensagem de/para bloqueado
        socket.to(roomId).emit('receive_friend_msg', message);
        // Se o destinatário não estiver na sala (ex: na sidebar), entrega direta
        // para que a mensagem chegue em tempo real, sem recarregar a página
        const receiverId = message.receiverId;
        if (receiverId) {
          const members = io.sockets.adapter.rooms.get(roomId);
          for (const [id, sock] of io.sockets.sockets) {
            if (socketUsers[id] === receiverId && (!members || !members.has(id))) {
              sock.emit('receive_friend_msg', message);
            }
          }
        }
      });
    });

    socket.on('delete_friend_msg', (data) => {
      // data: { roomId, messageId, friendId (destinatário, para entrega direta) }
      const { roomId, messageId, friendId } = data;
      if (!roomId || !messageId) return;
      socket.to(roomId).emit('friend_msg_deleted', { messageId });
      if (friendId) {
        const members = io.sockets.adapter.rooms.get(roomId);
        for (const [id, sock] of io.sockets.sockets) {
          if (socketUsers[id] === friendId && (!members || !members.has(id))) {
            sock.emit('friend_msg_deleted', { messageId });
          }
        }
      }
    });

    socket.on('edit_friend_msg', (data) => {
      // data: { roomId, message, friendId (destinatário, para entrega direta) }
      const { roomId, message, friendId } = data;
      if (!roomId || !message || !message.id) return;
      socket.to(roomId).emit('friend_msg_edited', message);
      if (friendId) {
        const members = io.sockets.adapter.rooms.get(roomId);
        for (const [id, sock] of io.sockets.sockets) {
          if (socketUsers[id] === friendId && (!members || !members.has(id))) {
            sock.emit('friend_msg_edited', message);
          }
        }
      }
    });

    socket.on('friend_typing', (data) => {
      // data: { roomId, senderId, isTyping }
      const { roomId, senderId, isTyping } = data;
      socket.to(roomId).emit('friend_typing', { senderId, isTyping });
    });

    socket.on('friend_msgs_read', (data) => {
      // data: { roomId, readerId, friendId (remetente das mensagens lidas) }
      const { roomId, readerId, friendId } = data;
      if (!roomId || !readerId) return;
      socket.to(roomId).emit('friend_msgs_read', { readerId });
      // Entrega direta ao remetente caso ele não esteja na sala
      if (friendId) {
        const members = io.sockets.adapter.rooms.get(roomId);
        for (const [id, sock] of io.sockets.sockets) {
          if (socketUsers[id] === friendId && (!members || !members.has(id))) {
            sock.emit('friend_msgs_read', { readerId });
          }
        }
      }
    });

    socket.on('like_friend_msg', (data) => {
      // data: { roomId, messageId, likedByUserId }
      const { roomId, messageId, likedByUserId } = data;
      socket.to(roomId).emit('receive_friend_msg_like', { messageId, likedByUserId });
    });

    socket.on('react_friend_msg', (data) => {
      const { roomId, messageId, emoji, userId, username } = data;
      socket.to(roomId).emit('friend_msg_reacted', { messageId, emoji, userId, username });
    });

    socket.on('unreact_friend_msg', (data) => {
      const { roomId, messageId, emoji, userId } = data;
      socket.to(roomId).emit('friend_msg_unreacted', { messageId, emoji, userId });
    });

    // Sinalização para chamadas diretas com amigos
    socket.on('call_friend', (data) => {
      // data: { friendUserId, callerData: { id, username, avatarUrl }, type: 'audio'|'video', callRoomId }
      const { friendUserId, callerData, type, callRoomId } = data;
      if (!callRoomId || !friendUserId) return;

      const callerId = socketUsers[socket.id];
      // Bloqueado (qualquer direção): não chama nem é chamado
      isBlocked(callerId, friendUserId).then((blocked) => {
        if (blocked) {
          socket.emit(`call_rejected_for_${callRoomId}`);
          return;
        }

        // Caller entra na sala da chamada para receber aceite/rejeição e sinalização
        socket.join(callRoomId);
        activeCalls[callRoomId] = {
          hostSocketId: socket.id,
          type,
          participants: [callerId, friendUserId]
        };

        // Envia a chamada apenas para o socket do amigo
        let sent = false;
        for (const [id, sock] of io.sockets.sockets) {
          if (socketUsers[id] === friendUserId) {
            sock.emit(`incoming_call_to_${friendUserId}`, { callerData, callerId: callerData.id, type, callRoomId, isGroup: false });
            sent = true;
            break;
          }
        }

        if (!sent) {
          sendPushNotificationToUser(friendUserId, {
            title: `Chamada de ${callerData.username}`,
            body: type === 'video' ? 'Você recebeu uma chamada de vídeo' : 'Você recebeu uma chamada de áudio',
            icon: callerData.avatarUrl || '/icon.svg',
            badge: '/icon.svg',
            tag: `call-${callRoomId}`,
            data: {
              url: '/',
              targetId: callerId,
              callRoomId,
              isNewSession: true
            }
          });
        }
      });
    });

    // Adicionar pessoa a uma chamada em andamento
    socket.on('add_friend_to_call', (data) => {
      // data: { callRoomId, friendUserId, callerData, type }
      const { callRoomId, friendUserId, callerData, type } = data;
      const call = activeCalls[callRoomId];
      if (!call) return;
      const myUserId = socketUsers[socket.id];
      if (!call.participants.includes(myUserId)) return;
      if (call.participants.includes(friendUserId)) return;
      isBlocked(myUserId, friendUserId).then((blocked) => {
        if (blocked) return;
        call.participants.push(friendUserId);
        let sent = false;
        for (const [id, sock] of io.sockets.sockets) {
          if (socketUsers[id] === friendUserId) {
            sock.emit(`incoming_call_to_${friendUserId}`, { callerData, callerId: myUserId, type, callRoomId, isGroup: true });
            sent = true;
            break;
          }
        }
        if (!sent) {
          sendPushNotificationToUser(friendUserId, {
            title: `Chamada de ${callerData?.username || 'Alguém'}`,
            body: 'Você foi adicionado a uma chamada em grupo',
            icon: callerData?.avatarUrl || '/icon.svg',
            badge: '/icon.svg',
            tag: `call-${callRoomId}`,
            data: {
              url: '/',
              targetId: myUserId,
              callRoomId,
              isNewSession: true
            }
          });
        }
      });
    });

    socket.on('accept_friend_call', (data) => {
      // data: { callRoomId }
      const { callRoomId } = data;
      const call = activeCalls[callRoomId];
      const userId = socketUsers[socket.id];
      if (!call || !call.participants.includes(userId)) return;
      socket.join(callRoomId);
      io.to(callRoomId).emit(`call_accepted_for_${callRoomId}`);
      // Avisa os demais que um participante entrou
      socket.to(callRoomId).emit('participant_joined', { userId });
      // Envia a lista de participantes ao novo participante (para criar o WebRTC mesh)
      socket.emit('call_participants', { participants: call.participants, type: call.type });
    });

    socket.on('reject_friend_call', (data) => {
      // data: { callRoomId }
      const { callRoomId } = data;
      const call = activeCalls[callRoomId];
      const userId = socketUsers[socket.id];
      if (!call || !call.participants.includes(userId)) return;
      io.to(callRoomId).emit(`call_rejected_for_${callRoomId}`);
      socket.leave(callRoomId);
      call.participants = call.participants.filter(p => p !== userId);
    });

    socket.on('end_friend_call', (data) => {
      // data: { callRoomId }
      const { callRoomId } = data;
      const call = activeCalls[callRoomId];
      if (!call) return;
      const userId = socketUsers[socket.id];
      if (!call.participants.includes(userId)) return;
      io.to(callRoomId).emit('friend_call_ended');
      socket.leave(callRoomId);
      delete activeCalls[callRoomId];
    });

    // Registro de chamada no chat privado
    socket.on('friend_call_logged', (data) => {
      // data: { roomId, message }
      const { roomId, message } = data;
      if (!roomId || !message) return;
      socket.to(roomId).emit('friend_call_logged', message);
      const members = io.sockets.adapter.rooms.get(roomId);
      const receiverId = message.receiverId;
      if (receiverId) {
        for (const [id, sock] of io.sockets.sockets) {
          if (socketUsers[id] === receiverId && (!members || !members.has(id))) {
            sock.emit('friend_call_logged', message);
          }
        }
      }
    });

    // 5. DESCONEXÃO E LIMPEZA
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
      
      // Remove da fila de matchmaking se estiver nela
      matchmakingQueue = matchmakingQueue.filter(item => item.socketId !== socket.id);

      // Atualiza presença online (se era o último socket do usuário)
      const disconnectedUserId = socketUsers[socket.id];
      delete socketUsers[socket.id];
      if (disconnectedUserId && userSockets[disconnectedUserId]) {
        userSockets[disconnectedUserId].delete(socket.id);
        if (userSockets[disconnectedUserId].size === 0) {
          delete userSockets[disconnectedUserId];
          getPool()?.query('SELECT "invisibleMode" FROM "User" WHERE id = $1 LIMIT 1', [disconnectedUserId])
            .then(res => {
              const invisible = res.rows[0]?.invisibleMode;
              if (!invisible) {
                io.emit('user_offline', { userId: disconnectedUserId });
                setUserOnline(disconnectedUserId, false);
                getPool()?.query('UPDATE "User" SET "lastSeen" = now() WHERE id = $1', [disconnectedUserId])
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      }

      // Encerra chamadas diretas em que este usuário era participante
      for (const roomId in activeCalls) {
        const call = activeCalls[roomId];
        if (call.hostSocketId === socket.id || call.participants.includes(disconnectedUserId)) {
          io.to(roomId).emit('friend_call_ended');
          delete activeCalls[roomId];
        }
      }

      // Limpa qualquer sala ativa do Omegle que esse socket estava participando
      for (const roomId in activeRandomRooms) {
        const room = activeRandomRooms[roomId];
        if (room.peerA === socket.id || room.peerB === socket.id) {
          io.to(roomId).emit('peer_left');
          
          // Remove o outro peer da sala
          const otherPeerId = room.peerA === socket.id ? room.peerB : room.peerA;
          const otherSocket = io.sockets.sockets.get(otherPeerId);
          if (otherSocket) otherSocket.leave(roomId);

          delete activeRandomRooms[roomId];
          console.log(`Sala random ${roomId} limpa devido a desconexão do socket.`);
          break;
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // Limpeza periódica: arquivos view-once/24h expirados e registros órfãos (físico sumiu)
  const UPLOADS_DIR = path.join(__dirname, 'uploads');
  async function cleanupExpiredFiles() {
    const pool = getPool();
    if (!pool) return;
    const diskPath = (storagePath) => {
      const parts = String(storagePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts[0] === 'uploads') parts.shift();
      return path.join(UPLOADS_DIR, ...parts);
    };
    try {
      const res = await pool.query(
        `SELECT id, "storagePath", "storageKey" FROM "File"
         WHERE ("expiresAt" IS NOT NULL AND "expiresAt" < now())
            OR ("viewOnce" = true AND "viewedAt" IS NOT NULL AND "viewedAt" < now() - interval '1 hour')`
      );
      for (const row of res.rows) {
        if (row.storageKey) {
          // Remove do bucket "marketplace" (Supabase Storage)
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/marketplace/${row.storageKey}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${key}`,
              'apikey': key
            }
          }).catch(() => {});
        } else {
          fs.unlink(diskPath(row.storagePath), () => {});
        }
        pool.query('DELETE FROM "File" WHERE id = $1', [row.id]).catch(() => {});
      }
      // Órfãos (só locais): registro existe, mas o arquivo físico não está mais no disco
      const all = await pool.query('SELECT id, "storagePath" FROM "File" WHERE "storageKey" IS NULL');
      for (const row of all.rows) {
        if (!fs.existsSync(diskPath(row.storagePath))) {
          pool.query('DELETE FROM "File" WHERE id = $1', [row.id]).catch(() => {});
          res.rows.push(row);
        }
      }
      if (res.rows.length > 0) console.log(`Limpeza de arquivos: ${res.rows.length} removidos`);
    } catch (e) {
      console.error('Erro na limpeza de arquivos:', e.message);
    }
  }
  setInterval(cleanupExpiredFiles, 30 * 60 * 1000);
  setTimeout(cleanupExpiredFiles, 60 * 1000);

  async function cleanupExpiredPremium() {
    const pool = getPool();
    if (!pool) return;
    try {
      const res = await pool.query(
        `UPDATE "User"
         SET "premiumTier" = 'free', "premiumSince" = NULL, "premiumExpiresAt" = NULL
         WHERE "premiumTier" = 'premium' AND "premiumExpiresAt" IS NOT NULL AND "premiumExpiresAt" < now()
         RETURNING id, username`
      );
      if (res.rows.length > 0) {
        console.log(`Premium expirado: ${res.rows.length} usuários revertidos para free`);
      }
    } catch (e) {
      console.error('Erro na limpeza de premium:', e.message);
    }
  }
  setInterval(cleanupExpiredPremium, 60 * 60 * 1000);
  setTimeout(cleanupExpiredPremium, 60 * 1000);
});
