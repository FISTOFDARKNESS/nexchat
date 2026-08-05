const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

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
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Fila de Matchmaking em memória
  // Cada item: { socketId, userId, username, gender, country, prefGender, prefCountry, mode }
  let matchmakingQueue = [];

  // Quartos ativos do Omegle: roomId -> { peerA: socketId, peerB: socketId }
  let activeRandomRooms = {};

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

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
      // Retransmite para os membros da sala
      socket.to(roomId).emit('receive_random_msg', message);
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

    socket.on('send_friend_msg', (data) => {
      // data: { roomId, message: { id, senderId, receiverId, content, parentMessageId, parentMessageContent } }
      const { roomId, message } = data;
      socket.to(roomId).emit('receive_friend_msg', message);
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
      // Envia evento global ou envia para a sala individual do amigo
      io.emit(`incoming_call_to_${friendUserId}`, { callerData, type, callRoomId });
    });

    socket.on('accept_friend_call', (data) => {
      // data: { callRoomId }
      const { callRoomId } = data;
      socket.join(callRoomId);
      io.emit(`call_accepted_for_${callRoomId}`);
    });

    socket.on('reject_friend_call', (data) => {
      // data: { callRoomId }
      const { callRoomId } = data;
      io.emit(`call_rejected_for_${callRoomId}`);
    });

    socket.on('end_friend_call', (data) => {
      // data: { callRoomId }
      const { callRoomId } = data;
      io.to(callRoomId).emit('friend_call_ended');
      socket.leave(callRoomId);
    });

    // 5. DESCONEXÃO E LIMPEZA
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
      
      // Remove da fila de matchmaking se estiver nela
      matchmakingQueue = matchmakingQueue.filter(item => item.socketId !== socket.id);

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
