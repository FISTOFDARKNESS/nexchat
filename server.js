const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const next = require('next');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const DOMPurify = require('isomorphic-dompurify');

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

let dbPool = null;
function getDbPool() {
  if (!dbPool && process.env.DATABASE_URL) {
    dbPool = new Pool({
      connectionString: sanitizeConnectionString(process.env.DATABASE_URL),
      max: 3,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 10000,
    });
  }
  return dbPool;
}

function setUserOnline(userId, online) {
  const pool = getDbPool();
  if (!pool) return;
  pool.query('UPDATE "User" SET "isOnline" = $2 WHERE id = $1', [userId, online])
    .catch((e) => console.error('Erro ao atualizar isOnline:', e.message));
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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

  // Fila de Matchmaking em memória
  // Cada item: { socketId, userId, username, gender, country, prefGender, prefCountry, mode }
  let matchmakingQueue = [];

  // Quartos ativos do Omegle: roomId -> { peerA: socketId, peerB: socketId }
  let activeRandomRooms = {};

  // Chamadas diretas ativas: callRoomId -> { callerSocketId, callerUserId, calleeUserId }
  let activeCalls = {};

  // Mapeia socketId -> userId (definido via evento 'identify')
  let socketUsers = {};

  // Mapeia userId -> Set de socketIds (presença por usuário)
  let userSockets = {};

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

    socket.on('identify', ({ userId } = {}) => {
      if (!userId) return;
      const alreadyOnline = !userSockets[userId] || userSockets[userId].size === 0;
      socketUsers[socket.id] = userId;
      if (!userSockets[userId]) userSockets[userId] = new Set();
      userSockets[userId].add(socket.id);
      if (alreadyOnline) {
        io.emit('user_online', { userId });
        setUserOnline(userId, true);
      }
    });

    // 1. FILA DE MATCHMAKING (OMEGLE)
    socket.on('join_queue', (userData) => {
      // userData: { userId, username, gender, country, prefGender, prefCountry, mode }
      // mode: 'text' ou 'video'
      
      // Remove qualquer entrada antiga deste socket da fila
      matchmakingQueue = matchmakingQueue.filter(item => item.socketId !== socket.id);

      const newParticipant = {
        socketId: socket.id,
        userId: userData.userId,
        username: userData.username,
        gender: userData.gender || 'other',
        country: userData.country || 'unknown',
        prefGender: userData.prefGender || 'any', // 'male', 'female', 'any'
        prefCountry: userData.prefCountry || 'any', // código de país ou 'any'
        mode: userData.mode || 'text'
      };

      console.log(`Usuário entrou na fila: ${newParticipant.username} (Gênero: ${newParticipant.gender}, PrefGênero: ${newParticipant.prefGender}, Modo: ${newParticipant.mode})`);

      // Tenta encontrar um par na fila
      let matchedPeer = null;

      for (let i = 0; i < matchmakingQueue.length; i++) {
        const potentialPeer = matchmakingQueue[i];

        // Verificar compatibilidade de Modo (texto com texto, vídeo com vídeo)
        if (potentialPeer.mode !== newParticipant.mode) continue;

        // Verificar gênero do peer em relação à preferência do novo participante
        if (newParticipant.prefGender !== 'any' && potentialPeer.gender !== newParticipant.prefGender) continue;

        // Verificar gênero do novo participante em relação à preferência do peer
        if (potentialPeer.prefGender !== 'any' && newParticipant.gender !== potentialPeer.prefGender) continue;

        // Verificar preferência de país (do novo participante)
        if (newParticipant.prefCountry !== 'any' && potentialPeer.country !== newParticipant.prefCountry) continue;

        // Verificar preferência de país (do peer)
        if (potentialPeer.prefCountry !== 'any' && newParticipant.country !== potentialPeer.prefCountry) continue;

        // Se passar por todas as validações, temos um match!
        matchedPeer = potentialPeer;
        matchmakingQueue.splice(i, 1); // remove o peer da fila
        break;
      }

      if (matchedPeer) {
        // Encontrou par! Cria uma sala temporária aleatória
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        activeRandomRooms[roomId] = {
          peerA: socket.id,
          peerB: matchedPeer.socketId,
          peerAData: newParticipant,
          peerBData: matchedPeer
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
            country: matchedPeer.country
          }
        });

        io.to(matchedPeer.socketId).emit('match_found', {
          roomId,
          role: 'receiver',
          partner: {
            userId: newParticipant.userId,
            username: newParticipant.username,
            gender: newParticipant.gender,
            country: newParticipant.country
          }
        });

        console.log(`Match criado! Sala: ${roomId} entre ${newParticipant.username} e ${matchedPeer.username}`);
      } else {
        // Sem match disponível no momento, adiciona à fila
        matchmakingQueue.push(newParticipant);
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
      // data: { roomId, messageId, likedByUserId }
      const { roomId, messageId, likedByUserId } = data;
      socket.to(roomId).emit('receive_random_msg_like', { messageId, likedByUserId });
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
    socket.on('webrtc_offer', (data) => {
      // data: { roomId, offer }
      const { roomId, offer } = data;
      socket.to(roomId).emit('webrtc_offer', { offer });
    });

    socket.on('webrtc_answer', (data) => {
      // data: { roomId, answer }
      const { roomId, answer } = data;
      socket.to(roomId).emit('webrtc_answer', { answer });
    });

    socket.on('webrtc_ice_candidate', (data) => {
      // data: { roomId, candidate }
      const { roomId, candidate } = data;
      socket.to(roomId).emit('webrtc_ice_candidate', { candidate });
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
      // data: { groupId, message: { id, groupId, senderId, senderName, content, createdAt } }
      const { groupId, message } = data;
      if (!groupId || !message) return;
      const roomId = `group_chat_${groupId}`;
      socket.to(roomId).emit('receive_group_msg', message);
      // Entrega direta aos membros online que estão fora da sala do grupo
      const members = io.sockets.adapter.rooms.get(roomId);
      getDbPool()?.query('SELECT "userId" FROM "GroupMember" WHERE "groupId" = $1', [groupId])
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

    socket.on('send_friend_msg', (data) => {
      // data: { roomId, message: { id, senderId, receiverId, content, parentMessageId, parentMessageContent } }
      const { roomId, message } = data;
      if (!roomId || !message) return;
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

    // Sinalização para chamadas diretas com amigos
    socket.on('call_friend', (data) => {
      // data: { friendUserId, callerData: { id, username, avatarUrl }, type: 'audio'|'video', callRoomId }
      const { friendUserId, callerData, type, callRoomId } = data;
      if (!callRoomId || !friendUserId) return;

      // Caller entra na sala da chamada para receber aceite/rejeição e sinalização
      socket.join(callRoomId);
      activeCalls[callRoomId] = {
        hostSocketId: socket.id,
        type,
        participants: [socketUsers[socket.id], friendUserId]
      };

      // Envia a chamada apenas para o socket do amigo
      for (const [id, sock] of io.sockets.sockets) {
        if (socketUsers[id] === friendUserId) {
          sock.emit(`incoming_call_to_${friendUserId}`, { callerData, callerId: callerData.id, type, callRoomId, isGroup: false });
          break;
        }
      }
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
      call.participants.push(friendUserId);
      for (const [id, sock] of io.sockets.sockets) {
        if (socketUsers[id] === friendUserId) {
          sock.emit(`incoming_call_to_${friendUserId}`, { callerData, callerId: myUserId, type, callRoomId, isGroup: true });
          break;
        }
      }
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
          io.emit('user_offline', { userId: disconnectedUserId });
          setUserOnline(disconnectedUserId, false);
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
});
