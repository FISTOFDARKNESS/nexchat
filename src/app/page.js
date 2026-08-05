"use client";

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Video, Phone, UserPlus, Send, Heart, Smile, Shield, Flag, X, 
  MessageSquare, LogOut, MapPin, User, Users, Check, Trash, ShieldAlert,
  Moon, CheckSquare, Settings, AlertCircle, VolumeX, Mic, MicOff, VideoOff, Play
} from 'lucide-react';

let socket;

export default function Home() {
  // --- Estados do Sistema ---
  const [consentGranted, setConsentGranted] = useState(false);
  const [useMedia, setUseMedia] = useState(false);
  const [user, setUser] = useState(null); // Usuário logado
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Inputs de Login
  const [loginUsername, setLoginUsername] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginGender, setLoginGender] = useState('male');
  const [loginCountry, setLoginCountry] = useState('BR');
  const [loginMode, setLoginMode] = useState('guest'); // 'guest' ou 'google'

  // --- Estados do Chat e Amizade ---
  const [friendsList, setFriendsList] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  
  // Input para adicionar amigo
  const [addFriendId, setAddFriendId] = useState('');
  const [addFriendError, setAddFriendError] = useState('');
  const [addFriendSuccess, setAddFriendSuccess] = useState('');

  // --- Estados do Matchmaking (Omegle) ---
  const [inQueue, setInQueue] = useState(false);
  const [inRandomChat, setInRandomChat] = useState(false);
  const [randomRoomId, setRandomRoomId] = useState(null);
  const [randomPartner, setRandomPartner] = useState(null);
  
  // Filtros de Match
  const [matchGender, setMatchGender] = useState('any'); // 'male', 'female', 'any'
  const [matchCountry, setMatchCountry] = useState('any');
  const [matchMode, setMatchMode] = useState('text'); // 'text' ou 'video'
  const [queueStatusText, setQueueStatusText] = useState('');

  // --- Estados de Mensagens ---
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { id, content }

  // --- Estados de Chamadas com Amigos ---
  const [activeCallRoom, setActiveCallRoom] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null); // { callerData, type, callRoomId }
  const [callState, setCallState] = useState('idle'); // 'idle', 'calling', 'ringing', 'connected'
  const [callType, setCallType] = useState('video'); // 'video' ou 'audio'

  // --- Controles de Mídia ---
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  // --- Admin ---
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [reports, setReports] = useState([]);
  const [adminStatusMsg, setAdminStatusMsg] = useState('');

  // --- Denúncia ---
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Comportamento impróprio');
  const [reportDetails, setReportDetails] = useState('');

  // --- Referências de Elementos e WebRTC ---
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // Configuração STUN pública gratuita
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // --- Efeito: Auto-scroll no Chat ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, inQueue]);

  // --- Efeito: Inicializar Socket se Usuário Logar ---
  useEffect(() => {
    if (!user) return;

    // Conectar ao WebSocket
    socket = io();

    socket.on('connect', () => {
      console.log('Conectado ao WebSocket local');
    });

    // 1. Ouvintes do Matchmaking
    socket.on('queue_waiting', () => {
      setQueueStatusText('Procurando alguém compatível com seus filtros...');
    });

    socket.on('match_found', async (data) => {
      const { roomId, role, partner } = data;
      console.log('Par encontrado!', partner, 'Cargo:', role);
      setInQueue(false);
      setInRandomChat(true);
      setRandomRoomId(roomId);
      setRandomPartner(partner);
      setMessages([]);
      setReplyingTo(null);

      if (matchMode === 'video' && useMedia) {
        setQueueStatusText('Iniciando stream de vídeo...');
        await initWebRTC(roomId, role);
      }
    });

    socket.on('peer_left', () => {
      alert('Seu parceiro de chat desconectou.');
      cleanupCall();
      setInRandomChat(false);
      setRandomRoomId(null);
      setRandomPartner(null);
    });

    socket.on('receive_random_msg', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('receive_random_msg_like', (data) => {
      const { messageId, likedByUserId } = data;
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const alreadyLiked = m.likedBy.includes(likedByUserId);
          return {
            ...m,
            likedBy: alreadyLiked 
              ? m.likedBy.filter(id => id !== likedByUserId)
              : [...m.likedBy, likedByUserId]
          };
        }
        return m;
      }));
    });

    socket.on('receive_random_friend_request', (data) => {
      alert('Seu parceiro de chat enviou um pedido de amizade!');
      loadFriends(); // Atualiza lista
    });

    socket.on('receive_random_friend_accepted', () => {
      alert('Pedido de amizade aceito pelo seu parceiro!');
      loadFriends();
    });

    // 2. Ouvintes de WebRTC (Sinalização)
    socket.on('webrtc_offer', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('webrtc_answer', { roomId: randomRoomId || activeCallRoom, answer });
      }
    });

    socket.on('webrtc_answer', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socket.on('webrtc_ice_candidate', async (data) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Erro ao adicionar ICE Candidate:', e);
        }
      }
    });

    // 3. Ouvintes de Chat Privado com Amigos
    socket.on('receive_friend_msg', (msg) => {
      // Só adiciona na tela se a conversa ativa for com o remetente
      if (selectedFriend && (msg.senderId === selectedFriend.friendId || msg.receiverId === selectedFriend.friendId)) {
        setMessages(prev => [...prev, msg]);
      } else {
        // Alerta simples ou reload (em produção usaria badges de unread)
        loadFriends();
      }
    });

    socket.on('receive_friend_msg_like', (data) => {
      const { messageId, likedByUserId } = data;
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const alreadyLiked = m.likedBy.includes(likedByUserId);
          return {
            ...m,
            likedBy: alreadyLiked 
              ? m.likedBy.filter(id => id !== likedByUserId)
              : [...m.likedBy, likedByUserId]
          };
        }
        return m;
      }));
    });

    // 4. Ouvintes de Chamada com Amigos
    socket.on(`incoming_call_to_${user.id}`, (data) => {
      // data: { callerData, type, callRoomId }
      if (callState === 'idle' && !inRandomChat) {
        setIncomingCall(data);
        setCallType(data.type);
        // Toca som de toque
      } else {
        // Envia rejeição automática (ocupado)
        socket.emit('reject_friend_call', { callRoomId: data.callRoomId });
      }
    });

    socket.on(`call_accepted_for_${user.id}`, () => {
      // Callback local de aceitação
    });

    // Como o canal é global para sinalização, ouvimos eventos associados ao quarto de chamada ativo
    socket.on('friend_call_ended', () => {
      alert('Chamada encerrada pelo amigo.');
      cleanupCall();
    });

    // Carregar amigos e solicitações iniciais
    loadFriends();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user]);

  // Carregar dados de amigos via API
  const loadFriends = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/friends?userId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setFriendsList(data.friends || []);
        setPendingReceived(data.pendingReceived || []);
        setPendingSent(data.pendingSent || []);
      }
    } catch (err) {
      console.error('Erro ao buscar amigos:', err);
    }
  };

  // Carregar mensagens históricas com o amigo selecionado
  useEffect(() => {
    if (!selectedFriend || !user) return;
    setInRandomChat(false);
    setInQueue(false);
    
    // Join room do Socket para chat com este amigo
    const sortedIds = [user.id, selectedFriend.friendId].sort();
    const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
    
    if (socket) {
      socket.emit('join_friend_chat', { roomId: chatRoomId });
    }

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/messages?userId=${user.id}&friendId=${selectedFriend.friendId}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages || []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchHistory();

    return () => {
      if (socket) {
        socket.emit('leave_friend_chat', { roomId: chatRoomId });
      }
    };
  }, [selectedFriend]);

  // --- Inicializar Câmera e Áudio ---
  const requestMediaPermissions = async (wantsMedia = true) => {
    if (wantsMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setUseMedia(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Permissão de mídia recusada ou indisponível:', err.message);
        alert('Não foi possível acessar a câmera ou microfone. O modo somente texto estará disponível.');
        setUseMedia(false);
      }
    } else {
      setUseMedia(false);
    }
    setConsentGranted(true);
  };

  // --- WebRTC signaling logic ---
  const initWebRTC = async (roomId, role) => {
    try {
      peerConnectionRef.current = new RTCPeerConnection(rtcConfig);

      // Adiciona o stream local
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peerConnectionRef.current.addTrack(track, localStreamRef.current);
        });
      }

      // Receber stream remoto
      peerConnectionRef.current.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Mandar ICE Candidates
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', { roomId, candidate: event.candidate });
        }
      };

      if (role === 'caller') {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit('webrtc_offer', { roomId, offer });
      }
    } catch (err) {
      console.error('Erro ao inicializar WebRTC:', err);
    }
  };

  const cleanupCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setCallState('idle');
    setActiveCallRoom(null);
  };

  // --- Ações de Login ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    
    try {
      const payload = {
        action: loginMode,
        username: loginUsername.trim(),
        email: loginMode === 'google' ? loginEmail.trim() : null,
        gender: loginGender,
        country: loginCountry
      };

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        setUser(data.user);
      } else {
        setAuthError(data.error || 'Falha na autenticação');
      }
    } catch (err) {
      setAuthError('Erro ao conectar ao servidor de autenticação');
    } finally {
      setLoading(false);
    }
  };

  // --- Ações de Matchmaking ---
  const startRandomMatch = () => {
    if (!user) return;
    setSelectedFriend(null);
    setInQueue(true);
    setQueueStatusText('Entrando na fila de pareamento...');

    socket.emit('join_queue', {
      userId: user.id,
      username: user.username,
      gender: user.gender,
      country: user.country,
      prefGender: matchGender,
      prefCountry: matchCountry,
      mode: matchMode
    });
  };

  const cancelRandomMatch = () => {
    if (socket) {
      socket.emit('leave_queue');
    }
    setInQueue(false);
  };

  const skipRandomMatch = () => {
    if (randomRoomId && socket) {
      socket.emit('leave_random_chat', { roomId: randomRoomId });
    }
    cleanupCall();
    setInRandomChat(false);
    setRandomRoomId(null);
    setRandomPartner(null);
    
    // Auto-iniciar a próxima busca
    setTimeout(() => {
      startRandomMatch();
    }, 200);
  };

  // --- Ações de Envio e Reação de Mensagens ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const content = messageText.trim();
    setMessageText('');

    const tempMsgId = `temp_${Date.now()}`;
    const payload = {
      id: tempMsgId,
      content,
      senderId: user.id,
      senderName: user.username,
      parentMessageId: replyingTo ? replyingTo.id : null,
      parentContent: replyingTo ? replyingTo.content : null,
      likedBy: [],
      createdAt: new Date().toISOString()
    };

    setReplyingTo(null);

    // 1. Mensagem para Chat Aleatório (Omegle)
    if (inRandomChat && randomRoomId) {
      setMessages(prev => [...prev, payload]);
      socket.emit('send_random_msg', { roomId: randomRoomId, message: payload });
    }
    // 2. Mensagem para Amigo (WhatsApp)
    else if (selectedFriend) {
      // Salva no banco de dados para persistência
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send',
            senderId: user.id,
            receiverId: selectedFriend.friendId,
            content,
            parentMessageId: payload.parentMessageId
          })
        });
        const data = await res.json();
        if (data.success) {
          const savedMsg = data.message;
          setMessages(prev => [...prev, savedMsg]);
          
          // Envia em tempo real via socket
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: savedMsg });
        }
      } catch (err) {
        console.error('Erro ao enviar mensagem privada:', err);
      }
    }
  };

  const handleLikeMessage = async (msgId) => {
    if (!user) return;

    // 1. Curtida em Chat Aleatório
    if (inRandomChat && randomRoomId) {
      setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          const alreadyLiked = m.likedBy.includes(user.id);
          return {
            ...m,
            likedBy: alreadyLiked ? m.likedBy.filter(id => id !== user.id) : [...m.likedBy, user.id]
          };
        }
        return m;
      }));
      socket.emit('like_random_msg', { roomId: randomRoomId, messageId: msgId, likedByUserId: user.id });
    }
    // 2. Curtida em Chat de Amigos
    else if (selectedFriend) {
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'like',
            messageId: msgId,
            userId: user.id
          })
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              return {
                ...m,
                likedBy: data.liked 
                  ? [...m.likedBy, user.id]
                  : m.likedBy.filter(id => id !== user.id)
              };
            }
            return m;
          }));

          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('like_friend_msg', { roomId: chatRoomId, messageId: msgId, likedByUserId: user.id });
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // --- Solicitação de Amizade no Random Chat ---
  const sendFriendRequestInRandom = async () => {
    if (!randomPartner || !user) return;
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          userId: user.id,
          friendId: randomPartner.userId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.autoAccepted ? 'Agora vocês são amigos!' : 'Pedido de amizade enviado!');
        socket.emit('send_random_friend_request', { roomId: randomRoomId, senderId: user.id });
        loadFriends();
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Adicionar Amigo via ID (Sidebar) ---
  const handleAddFriend = async (e) => {
    e.preventDefault();
    setAddFriendError('');
    setAddFriendSuccess('');
    
    if (!addFriendId.trim()) return;

    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          userId: user.id,
          friendCustomId: addFriendId.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setAddFriendSuccess(data.autoAccepted ? 'Agora vocês são amigos!' : 'Pedido de amizade enviado com sucesso!');
        setAddFriendId('');
        loadFriends();
      } else {
        setAddFriendError(data.error);
      }
    } catch (e) {
      setAddFriendError('Erro na conexão com o servidor');
    }
  };

  const respondFriendRequest = async (friendId, accept) => {
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: accept ? 'accept' : 'reject',
          userId: user.id,
          friendId
        })
      });
      const data = await res.json();
      if (data.success) {
        loadFriends();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Denúncia no Random Chat ---
  const submitReport = async () => {
    if (!randomPartner || !user) return;
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: user.id,
          reportedId: randomPartner.userId,
          reason: reportReason,
          details: reportDetails
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Usuário denunciado com sucesso. Os moderadores analisarão os registros.');
        setShowReportModal(false);
        setReportDetails('');
        skipRandomMatch(); // Pula automaticamente para a próxima pessoa
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Chamada Direta com Amigos ---
  const callFriend = async (type) => {
    if (!selectedFriend || !user) return;
    
    const callRoomId = `call_${Date.now()}`;
    setCallState('calling');
    setCallType(type);
    setActiveCallRoom(callRoomId);

    // Escuta aceite do amigo
    socket.on(`call_accepted_for_${callRoomId}`, async () => {
      setCallState('connected');
      socket.join(callRoomId);
      if (useMedia) {
        await initWebRTC(callRoomId, 'caller');
      }
    });

    socket.on(`call_rejected_for_${callRoomId}`, () => {
      alert('O amigo rejeitou a chamada ou está ocupado.');
      cleanupCall();
    });

    socket.emit('call_friend', {
      friendUserId: selectedFriend.friendId,
      callerData: { id: user.id, username: user.username, avatarUrl: user.avatarUrl },
      type,
      callRoomId
    });
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    const { callRoomId } = incomingCall;
    
    setCallState('connected');
    setActiveCallRoom(callRoomId);
    setIncomingCall(null);

    socket.emit('accept_friend_call', { callRoomId });
    if (useMedia) {
      await initWebRTC(callRoomId, 'receiver');
    }
  };

  const rejectIncomingCall = () => {
    if (!incomingCall) return;
    socket.emit('reject_friend_call', { callRoomId: incomingCall.callRoomId });
    setIncomingCall(null);
  };

  const endCall = () => {
    const roomId = activeCallRoom;
    if (roomId) {
      socket.emit('end_friend_call', { callRoomId: roomId });
    }
    cleanupCall();
  };

  // --- Admin Logic ---
  const loadAdminReports = async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await fetch(`/api/admin?adminUserId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (showAdminPanel) {
      loadAdminReports();
    }
  }, [showAdminPanel]);

  const handleAdminAction = async (targetUserId, action, durationDays = 0) => {
    setAdminStatusMsg('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          adminUserId: user.id,
          targetUserId,
          reason: 'Violação de Termos (Moderação Admin)',
          durationDays
        })
      });
      const data = await res.json();
      if (data.success) {
        setAdminStatusMsg(`Sucesso: Ação '${action}' aplicada.`);
        loadAdminReports();
      } else {
        setAdminStatusMsg(`Erro: ${data.error}`);
      }
    } catch (err) {
      setAdminStatusMsg('Erro ao contatar o servidor');
    }
  };

  // --- Toggle botões de mídia ---
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  // --- VIEW: TELA DE CONSENTIMENTO INICIAL ---
  if (!consentGranted) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '20px' }}>
        <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: '1px solid var(--line)' }}>
          <h2 style={{ color: 'var(--gold)', marginBottom: '16px' }}>Consentimento e Permissões</h2>
          <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
            Para oferecer chamadas de vídeo, chat em tempo real e uma experiência personalizada, nosso site utiliza cookies locais de sessão. 
            Você deseja ativar sua câmera e microfone agora para fazer videochamadas com aleatórios?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn-primary" onClick={() => requestMediaPermissions(true)} style={{ justifyContent: 'center' }}>
              <Video className="icon" /> Aceitar Cookies e Ativar Câmera + Microfone
            </button>
            <button className="btn-secondary" onClick={() => requestMediaPermissions(false)}>
              Apenas Modo Texto (Sem Câmera/Microfone)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: TELA DE LOGIN ---
  if (!user) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="glass-card animate-fade-in" style={{ width: '420px', border: '1px solid var(--line)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{ color: 'var(--gold)', fontSize: '28px', textShadow: '0 0 10px var(--gold-glow)' }}>NexChat</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>A sua plataforma de conexões imediatas</p>
          </div>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Nome de Usuário / Apelido</label>
              <input 
                type="text" 
                placeholder="Ex: Gabriel" 
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            {loginMode === 'google' && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Endereço de E-mail</label>
                <input 
                  type="email" 
                  placeholder="Ex: gabriel@gmail.com" 
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Gênero</label>
                <select value={loginGender} onChange={e => setLoginGender(e.target.value)} style={{ width: '100%' }}>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>País</label>
                <select value={loginCountry} onChange={e => setLoginCountry(e.target.value)} style={{ width: '100%' }}>
                  <option value="BR">Brasil</option>
                  <option value="US">Estados Unidos</option>
                  <option value="PT">Portugal</option>
                  <option value="AR">Argentina</option>
                  <option value="ES">Espanha</option>
                </select>
              </div>
            </div>

            {authError && (
              <p style={{ color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> {authError}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span 
                onClick={() => setLoginMode('guest')} 
                style={{ color: loginMode === 'guest' ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer', fontWeight: loginMode === 'guest' ? '600' : '400' }}
              >
                Modo Visitante (Sem Login)
              </span>
              <span 
                onClick={() => setLoginMode('google')} 
                style={{ color: loginMode === 'google' ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer', fontWeight: loginMode === 'google' ? '600' : '400' }}
              >
                Conectar com Google API
              </span>
            </div>

            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
              {loading ? 'Entrando...' : loginMode === 'guest' ? 'Entrar como Visitante' : 'Conectar com Google'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- VIEW: PRINCIPAL DO APLICATIVO ---
  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg)', overflow: 'hidden' }}>
      
      {/* 1. SIDEBAR (Estilo Discord) */}
      <aside style={{ width: '300px', background: 'var(--bg-2)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Perfil e Logout */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '15px', color: 'var(--text)' }}>{user.username}</h3>
            <span style={{ fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{user.customId}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(user.role === 'admin' || user.role === 'moderator') && (
              <button onClick={() => setShowAdminPanel(!showAdminPanel)} title="Painel Moderador" style={{ color: 'var(--gold)' }}>
                <Shield size={18} />
              </button>
            )}
            <button onClick={() => setUser(null)} title="Sair" style={{ color: 'var(--muted)' }}>
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Lobby Omegle Button */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--line)' }}>
          <button 
            className="btn-primary" 
            onClick={() => {
              setSelectedFriend(null);
              setShowAdminPanel(false);
            }} 
            style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-soft)', border: '1px solid var(--gold)', color: 'var(--gold)' }}
          >
            <Video size={18} /> Chat Aleatório (Omegle)
          </button>
        </div>

        {/* Adicionar Amigo */}
        <form onSubmit={handleAddFriend} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid var(--line)' }}>
          <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>ADICIONAR AMIGO POR ID</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="Ex: gabriel#4829" 
              value={addFriendId}
              onChange={e => setAddFriendId(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px', flex: 1 }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '6px 12px' }}>
              <UserPlus size={16} />
            </button>
          </div>
          {addFriendError && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{addFriendError}</span>}
          {addFriendSuccess && <span style={{ color: 'var(--green)', fontSize: '11px' }}>{addFriendSuccess}</span>}
        </form>

        {/* Lista de Solicitações Pendentes */}
        {pendingReceived.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(234,200,71,0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
              CONVITES DE AMIZADE ({pendingReceived.length})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingReceived.map(req => (
                <div key={req.friendId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>{req.username}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => respondFriendRequest(req.friendId, true)} style={{ color: 'var(--green)', padding: '2px' }}>
                      <Check size={16} />
                    </button>
                    <button onClick={() => respondFriendRequest(req.friendId, false)} style={{ color: 'var(--red)', padding: '2px' }}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Amigos (Discord style) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', padding: '0 16px', display: 'block', marginBottom: '8px' }}>
            MENSAGENS DIRETAS ({friendsList.length})
          </span>
          {friendsList.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '12px', padding: '0 16px', fontStyle: 'italic' }}>Nenhum amigo ainda.</p>
          ) : (
            friendsList.map(f => (
              <div 
                key={f.friendId}
                onClick={() => {
                  setSelectedFriend(f);
                  setShowAdminPanel(false);
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  padding: '10px 16px', 
                  cursor: 'pointer',
                  background: selectedFriend?.friendId === f.friendId ? 'rgba(234, 200, 71, 0.08)' : 'transparent',
                  borderLeft: selectedFriend?.friendId === f.friendId ? '3px solid var(--gold)' : '3px solid transparent'
                }}
              >
                <div style={{ position: 'relative' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-3)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                    {f.username[0].toUpperCase()}
                  </div>
                  {/* Status indicator */}
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--bg-2)' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{f.username}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{f.customId}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 2. CHAT / ÁREA CENTRAL */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
        
        {/* Painel Administrativo */}
        {showAdminPanel ? (
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--gold)' }}>Painel de Moderação / Admin</h2>
              <button onClick={() => setShowAdminPanel(false)} style={{ color: 'var(--muted)' }}><X /></button>
            </div>
            
            {adminStatusMsg && (
              <div style={{ padding: '12px', background: 'var(--bg-3)', border: '1px solid var(--line)', color: 'var(--gold)', borderRadius: '8px', marginBottom: '16px' }}>
                {adminStatusMsg}
              </div>
            )}

            <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Denúncias Recebidas</h3>
              {reports.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Nenhuma denúncia pendente.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {reports.map(rep => (
                    <div key={rep.id} style={{ padding: '16px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                        <span>Denunciante: {rep.reporterName} ({rep.reporterCustomId})</span>
                        <span>Data: {new Date(rep.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                        <strong>Denunciado: </strong> {rep.reportedName} ({rep.reportedCustomId})
                      </div>
                      <p style={{ fontSize: '13px', background: 'var(--bg-2)', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                        <strong>Motivo: </strong> {rep.reason} <br/>
                        <strong>Detalhes: </strong> {rep.details || 'Sem detalhes fornecidos.'}
                      </p>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {rep.isCurrentlyBanned ? (
                          <button onClick={() => handleAdminAction(rep.reportedId, 'unban')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            Desbanir
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleAdminAction(rep.reportedId, 'ban', 1)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '6px 12px', fontSize: '12px' }}>
                              Banir 1 Dia
                            </button>
                            <button onClick={() => handleAdminAction(rep.reportedId, 'ban', 0)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '6px 12px', fontSize: '12px' }}>
                              Banir Permanente
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : selectedFriend || inRandomChat ? (
          // SE ESTIVER CONECTADO NO CHAT COM ALGUÉM (FRIEND OU RANDOM)
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Header do Chat */}
            <div style={{ height: '64px', borderBottom: '1px solid var(--line)', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--gold)' }}>
                  {inRandomChat ? '?' : selectedFriend.username[0].toUpperCase()}
                </div>
                <div>
                  <h4 style={{ fontSize: '15px' }}>{inRandomChat ? `Parceiro (${randomPartner?.country})` : selectedFriend.username}</h4>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    {inRandomChat ? `Filtro: ${randomPartner?.gender === 'male' ? 'Homem' : 'Mulher'}` : selectedFriend.customId}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {inRandomChat ? (
                  <>
                    <button className="btn-primary" onClick={sendFriendRequestInRandom} style={{ padding: '6px 12px', fontSize: '12px' }}>
                      <UserPlus size={14} /> Mandar Solicitação
                    </button>
                    <button onClick={() => setShowReportModal(true)} title="Denunciar Usuário" style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '6px' }}>
                      <Flag size={16} />
                    </button>
                    <button className="btn-primary" onClick={skipRandomMatch} style={{ padding: '8px 16px' }}>
                      Próximo Match <Play size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    {/* Botões de chamada para amigos */}
                    <button onClick={() => callFriend('audio')} title="Chamada de Áudio" style={{ color: 'var(--text)', background: 'var(--bg-3)', padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <Phone size={16} />
                    </button>
                    <button onClick={() => callFriend('video')} title="Chamada de Vídeo" style={{ color: 'var(--gold)', background: 'var(--gold-soft)', padding: '8px', borderRadius: '6px', border: '1px solid var(--gold)' }}>
                      <Video size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Video Box (WebRTC P2P) */}
            {((inRandomChat && matchMode === 'video') || callState === 'connected') && (
              <div style={{ height: '240px', background: '#000', display: 'flex', position: 'relative', borderBottom: '1px solid var(--line)' }}>
                {/* Remoto */}
                <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {/* Local Flutuante */}
                {useMedia && (
                  <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '100px', height: '130px', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--gold)', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }}>
                    <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                {/* Controles flutuantes */}
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '8px' }}>
                  <button onClick={toggleAudio} style={{ padding: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    {audioEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                  </button>
                  <button onClick={toggleVideo} style={{ padding: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    {videoEnabled ? <Video size={14} /> : <VideoOff size={14} />}
                  </button>
                  {callState === 'connected' && (
                    <button onClick={endCall} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px' }}>
                      Desconectar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Histórico de Mensagens */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map((msg) => {
                const isMe = msg.senderId === user.id;
                const liked = msg.likedBy.includes(user.id);
                return (
                  <div 
                    key={msg.id} 
                    style={{ 
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '60%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      position: 'relative',
                      group: 'true'
                    }}
                  >
                    {/* Conteúdo da resposta se houver */}
                    {msg.parentMessageId && (
                      <div style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        borderLeft: '3px solid var(--gold)', 
                        padding: '6px 10px', 
                        borderRadius: '6px', 
                        fontSize: '11px',
                        color: 'var(--muted)',
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        marginBottom: '-6px'
                      }}>
                        {msg.parentContent}
                      </div>
                    )}

                    {/* Balão da Mensagem */}
                    <div style={{ 
                      background: isMe ? 'var(--gold-soft)' : 'var(--bg-3)', 
                      border: isMe ? '1px solid var(--gold)' : '1px solid var(--line)', 
                      color: isMe ? '#fff' : 'var(--text)', 
                      padding: '10px 14px', 
                      borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      boxShadow: isMe ? '0 0 8px rgba(234,200,71,0.05)' : 'none',
                      position: 'relative'
                    }}>
                      <p style={{ fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.content}</p>
                      
                      {/* Selo de Likes */}
                      {msg.likedBy.length > 0 && (
                        <div style={{ 
                          position: 'absolute', 
                          bottom: '-10px', 
                          right: '8px', 
                          background: 'var(--bg-2)', 
                          border: '1px solid var(--line)', 
                          borderRadius: '10px', 
                          padding: '2px 6px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '3px',
                          fontSize: '9px',
                          color: 'var(--gold)'
                        }}>
                          <Heart size={8} fill="var(--gold)" />
                          <span>{msg.likedBy.length}</span>
                        </div>
                      )}
                    </div>

                    {/* Meta/Ações da Mensagem */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '10px', 
                      alignSelf: isMe ? 'flex-end' : 'flex-start', 
                      fontSize: '10px', 
                      color: 'var(--muted)',
                      padding: '0 4px'
                    }}>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <button onClick={() => setReplyingTo(msg)} style={{ color: 'var(--muted)', hover: { color: 'var(--gold)' } }}>Responder</button>
                      <button onClick={() => handleLikeMessage(msg.id)} style={{ color: liked ? 'var(--gold)' : 'var(--muted)' }}>
                        {liked ? 'Descurtir' : 'Curtir'}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} style={{ padding: '16px', background: 'var(--bg-2)', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Caixa de visualização do Reply */}
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-3)', borderLeft: '3px solid var(--gold)', padding: '6px 12px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: '600', display: 'block', fontSize: '10px' }}>RESPONDENDO A:</span>
                    <span style={{ color: 'var(--muted)' }}>{replyingTo.content}</span>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} style={{ color: 'var(--muted)' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <input 
                  type="text" 
                  placeholder="Escreva uma mensagem..." 
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  style={{ flex: 1, padding: '12px' }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '12px 18px' }}>
                  <Send size={16} />
                </button>
              </div>
            </form>

          </div>
        ) : inQueue ? (
          // FILA DE MATCHMAKING OMEGLE
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
            {/* Animação do Radar Dourado */}
            <div style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              border: '2px solid var(--gold)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative',
              boxShadow: '0 0 20px var(--gold-glow)',
              marginBottom: '24px',
              animation: 'spin 4s linear infinite'
            }}>
              <Video size={40} style={{ color: 'var(--gold)' }} />
              {/* Círculo expansivo */}
              <div style={{ 
                position: 'absolute', 
                inset: '-10px', 
                border: '1px dashed var(--gold)', 
                borderRadius: '50%',
                opacity: 0.5
              }}></div>
            </div>
            
            <h2 style={{ color: 'var(--gold)', marginBottom: '8px' }}>Matchmaking Conectado</h2>
            <p style={{ color: 'var(--muted)', maxWidth: '400px', fontSize: '14px', marginBottom: '24px' }}>
              {queueStatusText}
            </p>
            <button className="btn-secondary" onClick={cancelRandomMatch}>
              Cancelar Busca
            </button>
          </div>
        ) : (
          // TELA INICIAL / BEM-VINDO
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--gold)', marginBottom: '20px' }}>
              <ShieldAlert size={36} style={{ color: 'var(--gold)' }} />
            </div>
            
            <h1 style={{ color: 'var(--gold)', fontSize: '32px', marginBottom: '8px' }}>Bem-vindo ao NexChat</h1>
            <p style={{ color: 'var(--muted)', maxWidth: '460px', fontSize: '14px', lineHeight: '1.6', marginBottom: '32px' }}>
              Uma mistura perfeita de videochamadas aleatórias (Omegle), bate-papo de amigos (WhatsApp) e moderação robusta com servidores (Discord). 
              Escolha seus filtros no menu ao lado e comece a fazer amizades!
            </p>

            {/* Configuração de Filtros de Pareamento */}
            <div className="glass-card" style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--line)', textAlign: 'left' }}>
              <h3 style={{ color: '#fff', fontSize: '15px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={16} /> Configurar Próximo Match Aleatório
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Preferência de Gênero</label>
                    <select value={matchGender} onChange={e => setMatchGender(e.target.value)} style={{ width: '100%', fontSize: '13px' }}>
                      <option value="any">Qualquer Gênero</option>
                      <option value="male">Apenas Homens</option>
                      <option value="female">Apenas Mulheres</option>
                    </select>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Preferência de País</label>
                    <select value={matchCountry} onChange={e => setMatchCountry(e.target.value)} style={{ width: '100%', fontSize: '13px' }}>
                      <option value="any">Qualquer País</option>
                      <option value="BR">Brasil</option>
                      <option value="US">Estados Unidos</option>
                      <option value="PT">Portugal</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Modo do Chat</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <label style={{ flex: 1, padding: '10px', background: matchMode === 'text' ? 'var(--gold-soft)' : 'var(--bg-3)', border: matchMode === 'text' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="radio" name="matchMode" checked={matchMode === 'text'} onChange={() => setMatchMode('text')} style={{ display: 'none' }} />
                      <MessageSquare size={14} style={{ color: matchMode === 'text' ? 'var(--gold)' : 'var(--muted)' }} /> Bate-papo de Texto
                    </label>
                    <label style={{ flex: 1, padding: '10px', background: matchMode === 'video' ? 'var(--gold-soft)' : 'var(--bg-3)', border: matchMode === 'video' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', opacity: useMedia ? 1 : 0.5 }}>
                      <input type="radio" name="matchMode" disabled={!useMedia} checked={matchMode === 'video'} onChange={() => setMatchMode('video')} style={{ display: 'none' }} />
                      <Video size={14} style={{ color: matchMode === 'video' ? 'var(--gold)' : 'var(--muted)' }} /> Chamada de Vídeo
                    </label>
                  </div>
                </div>

                <button className="btn-primary" onClick={startRandomMatch} style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}>
                  Iniciar Conexão Aleatória <Play size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. TELA DE RECEBIMENTO DE CHAMADA DIRETA */}
      {incomingCall && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, width: '320px', background: 'rgba(17,17,21,0.95)', backdropFilter: 'blur(10px)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', boxShadow: '0 0 20px rgba(234, 200, 71, 0.25)' }} className="animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--gold)' }}>
              {incomingCall.callerData.username[0].toUpperCase()}
            </div>
            <div>
              <h4 style={{ fontSize: '14px', color: '#fff' }}>{incomingCall.callerData.username}</h4>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Chamando você ({incomingCall.type === 'video' ? 'Vídeo' : 'Áudio'})...</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={acceptIncomingCall} className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: '12px', justifyContent: 'center' }}>
              Atender
            </button>
            <button onClick={rejectIncomingCall} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'var(--red)', color: '#fff', border: 'none' }}>
              Rejeitar
            </button>
          </div>
        </div>
      )}

      {/* 4. MODAL DE DENÚNCIA (REPORT) */}
      {showReportModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ maxWidth: '400px', width: '100%', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: 'var(--red)' }}>Denunciar Usuário</h3>
              <button onClick={() => setShowReportModal(false)} style={{ color: 'var(--muted)' }}><X /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Selecione o Motivo</label>
                <select value={reportReason} onChange={e => setReportReason(e.target.value)} style={{ width: '100%' }}>
                  <option value="Comportamento impróprio">Comportamento impróprio</option>
                  <option value="Conteúdo impróprio / Nudez">Conteúdo impróprio / Nudez</option>
                  <option value="Assédio / Discurso de ódio">Assédio / Discurso de ódio</option>
                  <option value="Spam / Fraude">Spam / Fraude</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Detalhes da Ocorrência</label>
                <textarea 
                  rows="3" 
                  placeholder="Escreva brevemente o que aconteceu..." 
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  style={{ width: '100%', resize: 'none', background: 'var(--bg-3)', border: '1px solid var(--line)', color: '#fff', padding: '10px', borderRadius: '6px' }}
                />
              </div>
              <button className="btn-primary" onClick={submitReport} style={{ background: 'var(--red)', color: '#fff', justifyContent: 'center', marginTop: '6px' }}>
                Enviar Denúncia
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
