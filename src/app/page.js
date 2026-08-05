"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { 
  Video, Phone, UserPlus, Send, Heart, Smile, Shield, Flag, X, 
  MessageSquare, LogOut, MapPin, User, Users, Check, Trash, ShieldAlert,
  Moon, CheckSquare, Settings, AlertCircle, VolumeX, Mic, MicOff, VideoOff, Play,
  Plus, CheckCircle, Clock, Info, ChevronLeft, SkipForward, CheckCheck
} from 'lucide-react';

let socket;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function authedFetch(url, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexchat_token') : null;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export default function Home() {
  // --- Estados do Sistema ---
  const [consentGranted, setConsentGranted] = useState(false);
  const [useMedia, setUseMedia] = useState(false);
  const [user, setUser] = useState(null); // Usuário logado
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [activeView, setActiveView] = useState('sidebar'); // 'sidebar', 'chat'

  // Inputs de Login
  const [loginUsername, setLoginUsername] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginGender, setLoginGender] = useState('male');
  const [loginCountry, setLoginCountry] = useState('BR');
  const [loginMode, setLoginMode] = useState('guest'); // 'guest' ou 'google'

  // --- Sistema de Toasts Personalizados ---
  const [toasts, setToasts] = useState([]);
  
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  // --- Efeito: Detectar se é Mobile e Redimensionar ---
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Efeito: Carregar Sessão Local ou Parâmetros da URL ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const userDataParam = query.get('user_data');
      const authErrorParam = query.get('auth_error');
      const tokenParam = query.get('token');

      if (tokenParam) {
        localStorage.setItem('nexchat_token', tokenParam);
      }

      if (userDataParam) {
        try {
          const parsedUser = JSON.parse(decodeURIComponent(userDataParam));
          setUser(parsedUser);
          localStorage.setItem('nexchat_user', JSON.stringify(parsedUser));
          addToast(`Conectado com sucesso! Bem-vindo, ${parsedUser.username}!`, 'success');
        } catch (err) {
          console.error('Erro ao ler dados da URL:', err);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (authErrorParam) {
        addToast(decodeURIComponent(authErrorParam), 'error');
        setAuthError(decodeURIComponent(authErrorParam));
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const savedUser = localStorage.getItem('nexchat_user');
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch (e) {
            localStorage.removeItem('nexchat_user');
          }
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [addToast]);

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
  const [randomFriendRequestStatus, setRandomFriendRequestStatus] = useState('none'); // 'none', 'sent', 'received', 'accepted'
  
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

  // --- Presença Online, Perfil e Digitando ---
  const [onlineUsers, setOnlineUsers] = useState({}); // userId -> true
  const [localUnread, setLocalUnread] = useState({}); // friendId -> contagem recebida em tempo real
  const [profileUser, setProfileUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [typingStatus, setTypingStatus] = useState({ friendId: null, isTyping: false });
  const typingTimeoutRef = useRef(null);
  const typingEmittedRef = useRef(false);

  // --- Referências de Elementos e WebRTC ---
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  // --- Refs com os valores mais recentes (para handlers do socket) ---
  const matchModeRef = useRef(matchMode);
  const useMediaRef = useRef(useMedia);
  const randomRoomIdRef = useRef(randomRoomId);
  const activeCallRoomRef = useRef(activeCallRoom);
  const selectedFriendRef = useRef(selectedFriend);
  const callStateRef = useRef(callState);
  const inRandomChatRef = useRef(inRandomChat);
  const callListenersRef = useRef([]);

  useEffect(() => {
    matchModeRef.current = matchMode;
    useMediaRef.current = useMedia;
    randomRoomIdRef.current = randomRoomId;
    activeCallRoomRef.current = activeCallRoom;
    selectedFriendRef.current = selectedFriend;
    callStateRef.current = callState;
    inRandomChatRef.current = inRandomChat;
  });
  // --- Efeito: Auto-scroll no Chat ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, inQueue]);

  // --- Efeito: Corrigir tela preta da Câmera (Reatribuir streams quando os elementos montarem no DOM) ---
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(e => console.log('Autoplay local stream error:', e));
    }
  }, [inRandomChat, callState, matchMode, useMedia, activeCallRoom, activeView]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(e => console.log('Autoplay remote stream error:', e));
    }
  }, [inRandomChat, callState, matchMode, useMedia, activeCallRoom, activeView]);

  // Carregar dados de amigos via API
  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/friends');
      const data = await res.json();
      if (data.success) {
        setFriendsList(data.friends || []);
        setPendingReceived(data.pendingReceived || []);
        setPendingSent(data.pendingSent || []);
      }
    } catch (err) {
      console.error('Erro ao buscar amigos:', err);
    }
  }, [user]);

  // --- Marcar mensagens recebidas como lidas (tick de visto) ---
  const markMessagesRead = useCallback(async (friendId) => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', senderId: friendId })
      });
      const data = await res.json();
      if (data.success && data.updated > 0) {
        setMessages(prev => prev.map(m =>
          m.senderId === friendId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m
        ));
        setLocalUnread(prev => {
          const n = { ...prev };
          delete n[friendId];
          return n;
        });
      }
      const sortedIds = [user.id, friendId].sort();
      const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
      socket?.emit('friend_msgs_read', { roomId: chatRoomId, readerId: user.id, friendId });
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  // --- Abrir Perfil de um Usuário ---
  const openProfile = useCallback(async (target) => {
    setProfileLoading(true);
    setProfileError('');
    setProfileUser(null);
    try {
      const q = target.customId ? `customId=${encodeURIComponent(target.customId)}` : `id=${target.friendId}`;
      const res = await authedFetch(`/api/users?${q}`);
      const data = await res.json();
      if (data.success) {
        setProfileUser(data.user);
      } else {
        setProfileError(data.error || 'Não foi possível carregar o perfil');
      }
    } catch (err) {
      console.error(err);
      setProfileError('Erro ao carregar o perfil');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // --- Iniciar conversa a partir do perfil ---
  const startChatFromProfile = () => {
    if (!profileUser) return;
    const f = friendsList.find(fr => fr.friendId === profileUser.id);
    setProfileUser(null);
    setProfileError('');
    if (f) {
      stopTyping();
      setTypingStatus({ friendId: null, isTyping: false });
      setSelectedFriend(f);
      setShowAdminPanel(false);
    } else {
      addToast('Este usuário não está na sua lista de amigos.', 'error');
    }
  };

  // --- Indicador "digitando..." ---
  const emitTyping = (isTyping) => {
    if (!selectedFriend || inRandomChat) return;
    const sortedIds = [user.id, selectedFriend.friendId].sort();
    const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
    socket?.emit('friend_typing', { roomId: chatRoomId, senderId: user.id, isTyping });
  };

  const handleTypingChange = () => {
    if (!typingEmittedRef.current) {
      typingEmittedRef.current = true;
      emitTyping(true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingEmittedRef.current = false;
      emitTyping(false);
    }, 1500);
  };

  const stopTyping = () => {
    clearTimeout(typingTimeoutRef.current);
    if (typingEmittedRef.current) {
      typingEmittedRef.current = false;
      emitTyping(false);
    }
  };

  // Carregar mensagens históricas com o amigo selecionado
  useEffect(() => {
    if (!selectedFriend || !user) return;

    const sortedIds = [user.id, selectedFriend.friendId].sort();
    const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;

    const run = async () => {
      await Promise.resolve();
      setInRandomChat(false);
      setInQueue(false);
      setActiveView('chat');

      if (socket) {
        socket.emit('join_friend_chat', { roomId: chatRoomId });
      }

      try {
        const res = await authedFetch(`/api/messages?friendId=${selectedFriend.friendId}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages || []);
          setLocalUnread(prev => {
            const n = { ...prev };
            delete n[selectedFriend.friendId];
            return n;
          });
          setFriendsList(prev => prev.map(f =>
            f.friendId === selectedFriend.friendId ? { ...f, unreadCount: 0 } : f
          ));
          const hasUnread = data.messages.some(m => m.senderId === selectedFriend.friendId && !m.readAt);
          if (hasUnread) markMessagesRead(selectedFriend.friendId);
        }
      } catch (e) {
        console.error(e);
      }
    };
    run();

    return () => {
      if (socket) {
        socket.emit('leave_friend_chat', { roomId: chatRoomId });
      }
    };
  }, [selectedFriend, user, markMessagesRead]);

  // --- Inicializar Câmera e Áudio ---
  const requestMediaPermissions = async (wantsMedia = true) => {
    if (wantsMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setUseMedia(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(e => console.log(e));
        }
      } catch (err) {
        console.warn('Permissão de mídia recusada ou indisponível:', err.message);
        addToast('Não foi possível acessar a câmera ou microfone. O modo texto estará disponível.', 'error');
        setUseMedia(false);
      }
    } else {
      setUseMedia(false);
    }
    setConsentGranted(true);
  };

  const removeCallListeners = useCallback(() => {
    if (!socket) return;
    callListenersRef.current.forEach(({ event, handler }) => socket.off(event, handler));
    callListenersRef.current = [];
  }, []);

  // --- WebRTC signaling logic ---
  const initWebRTC = useCallback(async (roomId, role, isAudioOnly = false) => {
    try {
      peerConnectionRef.current = new RTCPeerConnection(rtcConfig);

      // Adiciona o stream local
      if (localStreamRef.current) {
        // Em chamada de áudio envia apenas o áudio; em vídeo envia áudio + vídeo
        const tracks = isAudioOnly
          ? localStreamRef.current.getAudioTracks()
          : localStreamRef.current.getTracks();
        tracks.forEach(track => {
          peerConnectionRef.current.addTrack(track, localStreamRef.current);
        });
      }

      // Receber stream remoto
      peerConnectionRef.current.ontrack = (event) => {
        if (event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            remoteVideoRef.current.play().catch(e => console.log('Autoplay remote stream error:', e));
          }
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
  }, []);

  const cleanupCall = useCallback(() => {
    removeCallListeners();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
    setCallState('idle');
    setActiveCallRoom(null);
  }, [removeCallListeners]);

  // --- Efeito: Inicializar Socket se Usuário Logar ---
  useEffect(() => {
    if (!user) return;

    socket = io();

    socket.on('connect', () => {
      console.log('Conectado ao WebSocket local');
      socket.emit('identify', { userId: user.id });
    });

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
      setRandomFriendRequestStatus('none');
      setMessages([]);
      setReplyingTo(null);
      setActiveView('chat');
      addToast(`Conectado com um parceiro de ${partner.country}!`, 'success');

      if (matchModeRef.current === 'video' && useMediaRef.current) {
        setQueueStatusText('Iniciando stream de vídeo...');
        await initWebRTC(roomId, role);
      }
    });

    socket.on('peer_left', () => {
      addToast('Seu parceiro de chat desconectou.', 'warning');
      cleanupCall();
      setInRandomChat(false);
      setRandomRoomId(null);
      setRandomPartner(null);
      setRandomFriendRequestStatus('none');
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

    socket.on('receive_random_friend_request', () => {
      setRandomFriendRequestStatus('received');
      addToast('Seu parceiro de chat enviou um pedido de amizade! Clique em Solicitar para aceitar.', 'info');
      loadFriends();
    });

    socket.on('receive_random_friend_accepted', () => {
      setRandomFriendRequestStatus('accepted');
      addToast('Amizade estabelecida em tempo real! 🎉', 'success');
      loadFriends();
    });

    socket.on('webrtc_offer', async (data) => {
      const rId = randomRoomIdRef.current || activeCallRoomRef.current;
      if (!peerConnectionRef.current && rId) {
        await initWebRTC(rId, 'receiver');
      }
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit('webrtc_answer', { roomId: rId, answer });
        } catch (err) {
          console.error('Erro ao processar webrtc_offer:', err);
        }
      }
    });

    socket.on('webrtc_answer', async (data) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
          console.error('Erro ao processar webrtc_answer:', err);
        }
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

    socket.on('receive_friend_msg', (msg) => {
      const activeFriend = selectedFriendRef.current;
      if (activeFriend && (msg.senderId === activeFriend.friendId || msg.receiverId === activeFriend.friendId)) {
        setMessages(prev => [...prev, msg]);
        if (msg.senderId === activeFriend.friendId) {
          markMessagesRead(activeFriend.friendId);
        }
      } else {
        addToast('Nova mensagem de amizade!', 'info');
        setLocalUnread(prev => ({ ...prev, [msg.senderId]: (prev[msg.senderId] || 0) + 1 }));
      }
    });

    socket.on('friend_typing', (data) => {
      const { senderId, isTyping } = data;
      if (senderId === selectedFriendRef.current?.friendId) {
        setTypingStatus({ friendId: senderId, isTyping });
      }
    });

    socket.on('friend_msgs_read', ({ readerId }) => {
      setMessages(prev => prev.map(m =>
        m.senderId === user.id && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m
      ));
    });

    socket.on('user_online', (data) => {
      setOnlineUsers(prev => ({ ...prev, [data.userId]: true }));
    });

    socket.on('user_offline', (data) => {
      setOnlineUsers(prev => {
        const n = { ...prev };
        delete n[data.userId];
        return n;
      });
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

    socket.on(`incoming_call_to_${user.id}`, (data) => {
      if (callStateRef.current === 'idle' && !inRandomChatRef.current) {
        setIncomingCall(data);
        setCallType(data.type);
      } else {
        socket.emit('reject_friend_call', { callRoomId: data.callRoomId });
      }
    });

    socket.on('friend_call_ended', () => {
      addToast('Chamada encerrada pelo amigo.', 'warning');
      cleanupCall();
    });

    const queueLoad = setTimeout(loadFriends, 0);

    return () => {
      clearTimeout(queueLoad);
      removeCallListeners();
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user, loadFriends, addToast, initWebRTC, cleanupCall, removeCallListeners, markMessagesRead]);

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
        localStorage.setItem('nexchat_user', JSON.stringify(data.user));
        if (data.token) {
          localStorage.setItem('nexchat_token', data.token);
        }
        addToast(`Bem-vindo, ${data.user.username}!`, 'success');
      } else {
        setAuthError(data.error || 'Falha na autenticação');
        addToast(data.error || 'Falha na autenticação', 'error');
      }
    } catch (err) {
      setAuthError('Erro ao conectar ao servidor de autenticação');
      addToast('Erro ao conectar ao servidor de autenticação', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Redirecionamento OAuth2 do Google
  const handleGoogleAuthRedirect = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      
      if (data.success && data.url) {
        // Redireciona o navegador para a tela de Consentimento do Google
        window.location.href = data.url;
      } else {
        addToast(data.error || 'Erro ao gerar URL do Google', 'error');
      }
    } catch (err) {
      addToast('Erro ao contatar servidor de autenticação Google', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Ação de Logout
  const handleLogout = () => {
    localStorage.removeItem('nexchat_user');
    localStorage.removeItem('nexchat_token');
    setUser(null);
    setSelectedFriend(null);
    setFriendsList([]);
    setPendingReceived([]);
    setPendingSent([]);
    cleanupCall();
    if (socket) {
      socket.disconnect();
    }
    addToast('Sessão encerrada com sucesso.', 'info');
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
    setActiveView('chat'); // Muda a visualização no mobile para ver a fila
  };

  const cancelRandomMatch = () => {
    if (socket) {
      socket.emit('leave_queue');
    }
    setInQueue(false);
    addToast('Busca cancelada.', 'info');
  };

  const skipRandomMatch = () => {
    if (randomRoomId && socket) {
      socket.emit('leave_random_chat', { roomId: randomRoomId });
    }
    cleanupCall();
    setInRandomChat(false);
    setRandomRoomId(null);
    setRandomPartner(null);
    setRandomFriendRequestStatus('none');
    
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
      try {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send',
            receiverId: selectedFriend.friendId,
            content,
            parentMessageId: payload.parentMessageId
          })
        });
        const data = await res.json();
        if (data.success) {
          const savedMsg = data.message;
          setMessages(prev => [...prev, savedMsg]);
          
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: savedMsg });
          stopTyping();
        }
      } catch (err) {
        console.error('Erro ao enviar mensagem privada:', err);
      }
    }
  };

  const handleLikeMessage = async (msgId) => {
    if (!user) return;

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
    } else if (selectedFriend) {
      try {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'like',
            messageId: msgId
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
      const res = await authedFetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          friendId: randomPartner.userId
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.autoAccepted) {
          setRandomFriendRequestStatus('accepted');
          addToast('Vocês agora são amigos! 🎉', 'success');
          socket.emit('accept_random_friend_request', { roomId: randomRoomId, senderId: user.id });
        } else {
          setRandomFriendRequestStatus('sent');
          addToast('Solicitação de amizade enviada!', 'success');
          socket.emit('send_random_friend_request', { roomId: randomRoomId, senderId: user.id });
        }
        loadFriends();
      } else {
        addToast(data.error, 'error');
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
      const res = await authedFetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          friendCustomId: addFriendId.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.autoAccepted ? 'Agora vocês são amigos! 🎉' : 'Pedido de amizade enviado com sucesso!';
        setAddFriendSuccess(msg);
        addToast(msg, 'success');
        setAddFriendId('');
        loadFriends();
      } else {
        setAddFriendError(data.error);
        addToast(data.error, 'error');
      }
    } catch (e) {
      setAddFriendError('Erro na conexão com o servidor');
    }
  };

  const respondFriendRequest = async (friendId, accept) => {
    try {
      const res = await authedFetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: accept ? 'accept' : 'reject',
          friendId
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(accept ? 'Solicitação aceita!' : 'Solicitação rejeitada.', accept ? 'success' : 'info');
        await loadFriends();
        if (accept) {
          const req = pendingReceived.find(r => r.friendId === friendId);
          if (req) openProfile(req);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Denúncia no Random Chat ---
  const submitReport = async () => {
    if (!randomPartner || !user) return;
    try {
      const res = await authedFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedId: randomPartner.userId,
          reason: reportReason,
          details: reportDetails
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Usuário denunciado com sucesso.', 'success');
        setShowReportModal(false);
        setReportDetails('');
        skipRandomMatch();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Chamada Direta com Amigos ---
  const callFriend = async (type) => {
    if (!selectedFriendRef.current || !user) return;
    
    const callRoomId = `call_${Date.now()}_${user.id}`;
    setCallState('calling');
    setCallType(type);
    setActiveCallRoom(callRoomId);
    setActiveView('chat');

    const onAccepted = async () => {
      removeCallListeners();
      setCallState('connected');
      addToast('Chamada conectada!', 'success');
      if (useMediaRef.current) {
        await initWebRTC(callRoomId, 'caller', type === 'audio');
      }
    };

    const onRejected = () => {
      removeCallListeners();
      addToast('O amigo rejeitou a chamada ou está ocupado.', 'warning');
      cleanupCall();
    };

    socket.on(`call_accepted_for_${callRoomId}`, onAccepted);
    socket.on(`call_rejected_for_${callRoomId}`, onRejected);
    callListenersRef.current = [
      { event: `call_accepted_for_${callRoomId}`, handler: onAccepted },
      { event: `call_rejected_for_${callRoomId}`, handler: onRejected }
    ];

    socket.emit('call_friend', {
      friendUserId: selectedFriendRef.current.friendId,
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
    setActiveView('chat');

    socket.emit('accept_friend_call', { callRoomId });
    if (useMedia) {
      await initWebRTC(callRoomId, 'receiver', incomingCall.type === 'audio');
    }
  };

  const rejectIncomingCall = () => {
    if (!incomingCall) return;
    socket.emit('reject_friend_call', { callRoomId: incomingCall.callRoomId });
    setIncomingCall(null);
    addToast('Chamada recusada.', 'info');
  };

  const endCall = () => {
    const roomId = activeCallRoom;
    if (roomId) {
      socket.emit('end_friend_call', { callRoomId: roomId });
    }
    cleanupCall();
    addToast('Chamada encerrada.', 'info');
  };

  // --- Admin Logic ---
  const loadAdminReports = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin');
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  useEffect(() => {
    if (!showAdminPanel) return;
    const timer = setTimeout(loadAdminReports, 0);
    return () => clearTimeout(timer);
  }, [showAdminPanel, loadAdminReports]);

  const handleAdminAction = async (targetUserId, action, durationDays = 0) => {
    setAdminStatusMsg('');
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          targetUserId,
          reason: 'Violação de Termos (Moderação Admin)',
          durationDays
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Ação '${action}' aplicada pelo Admin.`, 'success');
        loadAdminReports();
      } else {
        addToast(`Erro: ${data.error}`, 'error');
      }
    } catch (err) {
      addToast('Erro ao contatar o servidor', 'error');
    }
  };

  // --- Toggle botões de mídia ---
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
      addToast(audioEnabled ? 'Microfone Mutado' : 'Microfone Ativo', 'info');
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
      addToast(videoEnabled ? 'Câmera Desativada' : 'Câmera Ativada', 'info');
    }
  };

  // --- VIEW: TELA DE CONSENTIMENTO INICIAL ---
  if (!consentGranted) {
    return (
      <div style={{ display: 'flex', height: '100dvh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '20px' }}>
        <div className="glass-card animate-slide-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: '1px solid var(--line)' }}>
          <h2 style={{ color: 'var(--gold)', marginBottom: '16px' }}>Consentimento e Permissões</h2>
          <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
            Para oferecer chamadas de vídeo, chat em tempo real e uma experiência personalizada, nosso site utiliza cookies locais de sessão. 
            Você deseja ativar sua câmera e microfone agora para fazer videochamadas com aleatórios?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn-primary animate-pulse-glow" onClick={() => requestMediaPermissions(true)} style={{ justifyContent: 'center', minHeight: '48px' }}>
              <Video className="icon" /> Aceitar Cookies e Ativar Câmera + Microfone
            </button>
            <button className="btn-secondary" onClick={() => requestMediaPermissions(false)} style={{ minHeight: '48px' }}>
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
      <div style={{ display: 'flex', height: '100dvh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '16px' }}>
        <div className="glass-card animate-slide-in" style={{ width: '100%', maxWidth: '420px', border: '1px solid var(--line)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }} className="animate-float">
            <h1 style={{ color: 'var(--gold)', fontSize: '32px', textShadow: '0 0 15px var(--gold-glow)' }}>NexChat</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>A sua plataforma de conexões imediatas</p>
          </div>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {loginMode === 'guest' ? (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Nome de Usuário / Apelido</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Gabriel" 
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    required
                    style={{ width: '100%', minHeight: '44px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Gênero</label>
                    <select value={loginGender} onChange={e => setLoginGender(e.target.value)} style={{ width: '100%', minHeight: '44px' }}>
                      <option value="male">Masculino</option>
                      <option value="female">Feminino</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>País</label>
                    <select value={loginCountry} onChange={e => setLoginCountry(e.target.value)} style={{ width: '100%', minHeight: '44px' }}>
                      <option value="BR">Brasil</option>
                      <option value="US">Estados Unidos</option>
                      <option value="PT">Portugal</option>
                      <option value="AR">Argentina</option>
                      <option value="ES">Espanha</option>
                    </select>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary animate-pulse-glow" style={{ width: '100%', justifyContent: 'center', marginTop: '8px', minHeight: '48px' }}>
                  {loading ? 'Entrando...' : 'Entrar como Visitante'}
                </button>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', marginBottom: '8px' }}>
                  Você será redirecionado para a tela de autenticação segura do Google OAuth2.
                </p>
                <button 
                  type="button" 
                  onClick={handleGoogleAuthRedirect} 
                  disabled={loading} 
                  className="btn-primary animate-pulse-glow" 
                  style={{ width: '100%', justifyContent: 'center', minHeight: '48px' }}
                >
                  {loading ? 'Redirecionando...' : 'Iniciar Login com Google'}
                </button>
              </>
            )}

            {authError && (
              <p style={{ color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> {authError}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '13px', marginTop: '12px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
              <span 
                onClick={() => setLoginMode('guest')} 
                style={{ color: loginMode === 'guest' ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer', fontWeight: loginMode === 'guest' ? '600' : '400', padding: '6px' }}
              >
                Entrar como Convidado
              </span>
              <span 
                onClick={() => setLoginMode('google')} 
                style={{ color: loginMode === 'google' ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer', fontWeight: loginMode === 'google' ? '600' : '400', padding: '6px' }}
              >
                Entrar com Google API
              </span>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- VIEW: PRINCIPAL DO APLICATIVO ---
  return (
    <div className="app-container" style={{ display: 'flex', height: '100dvh', width: '100vw', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>
      
      {/* Container de Toasts flutuantes */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item ${t.type}`}>
            <Info size={16} style={{ color: t.type === 'success' ? 'var(--green)' : t.type === 'error' ? 'var(--red)' : t.type === 'warning' ? 'var(--amber)' : 'var(--gold)' }} />
            <span style={{ fontSize: '13px' }}>{t.message}</span>
          </div>
        ))}
      </div>

      {/* 1. SIDEBAR (Estilo Discord) - Ocultada no mobile se estiver no chat */}
      <aside 
        style={{ 
          width: isMobile ? '100%' : '300px', 
          display: isMobile && activeView !== 'sidebar' ? 'none' : 'flex',
          background: 'var(--bg-2)', 
          borderRight: '1px solid var(--line)', 
          flexDirection: 'column', 
          flexShrink: 0,
          height: '100%'
        }} 
        className="animate-slide-in-left"
      >
        {/* Perfil e Logout */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '15px', color: 'var(--text)' }}>{user.username}</h3>
            <span style={{ fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{user.customId}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(user.role === 'admin' || user.role === 'moderator') && (
              <button onClick={() => {
                setShowAdminPanel(!showAdminPanel);
                if (isMobile) setActiveView('chat');
              }} title="Painel Moderador" style={{ color: 'var(--gold)', padding: '8px' }}>
                <Shield size={18} />
              </button>
            )}
            <button onClick={handleLogout} title="Sair" style={{ color: 'var(--muted)', padding: '8px' }}>
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
              if (isMobile) setActiveView('chat');
            }} 
            style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-soft)', border: '1px solid var(--gold)', color: 'var(--gold)', minHeight: '44px' }}
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
              style={{ fontSize: '13px', padding: '8px 12px', flex: 1, minHeight: '38px' }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '8px 12px', minHeight: '38px' }}>
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
                <div key={req.friendId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }} className="animate-slide-in">
                  <span>{req.username}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => respondFriendRequest(req.friendId, true)} style={{ color: 'var(--green)', padding: '6px' }}>
                      <Check size={16} />
                    </button>
                    <button onClick={() => respondFriendRequest(req.friendId, false)} style={{ color: 'var(--red)', padding: '6px' }}>
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
                  stopTyping();
                  setTypingStatus({ friendId: null, isTyping: false });
                  setSelectedFriend(f);
                  setShowAdminPanel(false);
                }}
                className="friend-item-hover"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  padding: '12px 16px', 
                  cursor: 'pointer',
                  background: selectedFriend?.friendId === f.friendId ? 'rgba(234, 200, 71, 0.08)' : 'transparent',
                  borderLeft: selectedFriend?.friendId === f.friendId ? '3px solid var(--gold)' : '3px solid transparent',
                  minHeight: '52px'
                }}
              >
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openProfile(f); }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-3)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                    {f.username[0].toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: onlineUsers[f.friendId] ? 'var(--green)' : 'var(--bg-3)', border: '2px solid var(--bg-2)' }}></div>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{f.username}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.customId}</span>
                    {((f.unreadCount || 0) + (localUnread[f.friendId] || 0)) > 0 && (
                      <span style={{ background: 'var(--gold)', color: '#111', fontSize: '9px', fontWeight: '700', borderRadius: '8px', padding: '1px 6px', flexShrink: 0 }}>
                        {(f.unreadCount || 0) + (localUnread[f.friendId] || 0)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 2. CHAT / ÁREA CENTRAL - Ocultada no mobile se estiver na sidebar */}
      <main 
        style={{ 
          flex: 1, 
          display: isMobile && activeView !== 'chat' ? 'none' : 'flex', 
          flexDirection: 'column', 
          background: 'var(--bg)', 
          position: 'relative',
          height: '100%',
          width: isMobile ? '100%' : 'auto'
        }}
      >
        
        {/* Painel Administrativo */}
        {showAdminPanel ? (
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }} className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isMobile && (
                  <button onClick={() => setActiveView('sidebar')} style={{ color: 'var(--muted)', padding: '6px' }}>
                    <ChevronLeft size={20} />
                  </button>
                )}
                <h2 style={{ color: 'var(--gold)', fontSize: '20px' }}>Painel Administrativo</h2>
              </div>
              <button onClick={() => {
                setShowAdminPanel(false);
                if (isMobile) setActiveView('sidebar');
              }} style={{ color: 'var(--muted)', padding: '6px' }}><X /></button>
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
                    <div key={rep.id} style={{ padding: '12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }} className="animate-slide-in">
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', gap: '2px' }}>
                        <span>Denunciante: {rep.reporterName}</span>
                        <span>Data: {new Date(rep.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                        <strong>Denunciado: </strong> {rep.reportedName} ({rep.reportedCustomId})
                      </div>
                      <p style={{ fontSize: '13px', background: 'var(--bg-2)', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                        <strong>Motivo: </strong> {rep.reason} <br/>
                        <strong>Detalhes: </strong> {rep.details || 'Sem detalhes.'}
                      </p>
                      
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {rep.isCurrentlyBanned ? (
                          <button onClick={() => handleAdminAction(rep.reportedId, 'unban')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                            Desbanir
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleAdminAction(rep.reportedId, 'ban', 1)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                              Banir 1 Dia
                            </button>
                            <button onClick={() => handleAdminAction(rep.reportedId, 'ban', 0)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }} className="animate-fade-in">
            
            {/* Header do Chat */}
            <div style={{ height: isMobile ? '56px' : '64px', borderBottom: '1px solid var(--line)', padding: isMobile ? '0 6px' : '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-2)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px', maxWidth: isMobile ? '42%' : '50%' }}>
                {isMobile && (
                  <button 
                    onClick={() => {
                      if (inRandomChat) {
                        if (confirm('Deseja sair do chat aleatório?')) {
                          skipRandomMatch();
                          setActiveView('sidebar');
                        }
                      } else {
                        setSelectedFriend(null);
                        setActiveView('sidebar');
                      }
                    }} 
                    style={{ color: 'var(--muted)', padding: '8px', marginRight: '-4px' }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}
                
                <div style={{ width: isMobile ? '30px' : '36px', height: isMobile ? '30px' : '36px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--gold)', flexShrink: 0, cursor: inRandomChat ? 'default' : 'pointer' }} onClick={() => { if (!inRandomChat) openProfile(selectedFriend); }}>
                  {inRandomChat ? '?' : selectedFriend.username[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inRandomChat ? `Parceiro (${randomPartner?.country})` : selectedFriend.username}
                  </h4>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inRandomChat
                      ? `Filtro: ${randomPartner?.gender === 'male' ? 'Homem' : 'Mulher'}`
                      : typingStatus.isTyping && typingStatus.friendId === selectedFriend.friendId
                        ? <span style={{ color: 'var(--gold)' }}>digitando...</span>
                        : selectedFriend.customId}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px' }}>
                {inRandomChat ? (
                  <>
                    {/* Botão de Solicitação de Amizade */}
                    {randomFriendRequestStatus === 'none' && (
                      <button className="btn-primary" onClick={sendFriendRequestInRandom} style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px' }}>
                        <UserPlus size={isMobile ? 12 : 13} /> Pedir
                      </button>
                    )}
                    {randomFriendRequestStatus === 'sent' && (
                      <button className="btn-secondary" disabled style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px', opacity: 0.8, color: 'var(--gold)', borderColor: 'var(--gold)' }}>
                        <Clock size={12} />
                      </button>
                    )}
                    {randomFriendRequestStatus === 'received' && (
                      <button className="btn-primary animate-pulse-glow" onClick={sendFriendRequestInRandom} style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px' }}>
                        Aceitar
                      </button>
                    )}
                    {randomFriendRequestStatus === 'accepted' && (
                      <button className="btn-secondary" disabled style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px', color: 'var(--green)', borderColor: 'var(--green)' }}>
                        Amigos
                      </button>
                    )}

                    <button onClick={() => setShowReportModal(true)} title="Denunciar" style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', minHeight: isMobile ? '32px' : '36px' }}>
                      <Flag size={14} />
                    </button>
                    <button className="btn-primary animate-pulse-glow" onClick={skipRandomMatch} style={{ padding: isMobile ? '6px 10px' : '8px 12px', minHeight: isMobile ? '32px' : '36px', fontSize: isMobile ? '11px' : '12px' }}>
                      Pular
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => callFriend('audio')} title="Áudio" style={{ color: 'var(--text)', background: 'var(--bg-3)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                      <Phone size={14} />
                    </button>
                    <button onClick={() => callFriend('video')} title="Vídeo" style={{ color: 'var(--gold)', background: 'var(--gold-soft)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', border: '1px solid var(--gold)', minHeight: isMobile ? '32px' : '36px' }}>
                      <Video size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Indicador de Chamada de Áudio (sem tela de vídeo) */}
            {callState === 'connected' && callType === 'audio' && (
              <div style={{ height: isMobile ? '56px' : '64px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} /> Em chamada de áudio...
                </span>
                <button onClick={toggleAudio} title="Mudo" style={{ padding: '8px', borderRadius: '50%', background: 'var(--bg-3)', color: '#fff', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                  {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                </button>
                <button onClick={endCall} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px', border: 'none', minHeight: isMobile ? '32px' : '36px' }}>
                  Encerrar
                </button>
              </div>
            )}

            {/* Video Box (WebRTC P2P com layout responsivo mobile corrigido) */}
            {((inRandomChat && matchMode === 'video') || (callState === 'connected' && callType === 'video')) && (
              <div 
                style={{ 
                  height: isMobile ? '180px' : '280px', 
                  background: '#000', 
                  display: 'flex', 
                  position: 'relative', 
                  borderBottom: '1px solid var(--line)',
                  flexShrink: 0
                }}
              >
                {/* Remoto (Fundo principal) */}
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} 
                />
                
                {/* Local Flutuante */}
                {useMedia && (
                  <div 
                    style={{ 
                      position: 'absolute', 
                      bottom: '10px', 
                      right: '10px', 
                      width: isMobile ? '70px' : '110px', 
                      height: isMobile ? '95px' : '145px', 
                      borderRadius: '8px', 
                      overflow: 'hidden', 
                      border: '2px solid var(--gold)', 
                      boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
                      zIndex: 5
                    }}
                  >
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  </div>
                )}
                
                {/* Controles flutuantes */}
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '6px', zIndex: 10 }}>
                  <button onClick={toggleAudio} style={{ padding: '8px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid var(--line)' }}>
                    {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                  </button>
                  <button onClick={toggleVideo} style={{ padding: '8px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid var(--line)' }}>
                    {videoEnabled ? <Video size={12} /> : <VideoOff size={12} />}
                  </button>
                  {callState === 'connected' && (
                    <button onClick={endCall} style={{ padding: '6px 10px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px', border: 'none' }}>
                      Sair
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Histórico de Mensagens */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map((msg) => {
                const isMe = msg.senderId === user.id;
                const liked = msg.likedBy.includes(user.id);
                return (
                  <div 
                    key={msg.id} 
                    style={{ 
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      position: 'relative',
                    }}
                    className="animate-slide-in"
                  >
                    {msg.parentMessageId && (
                      <div style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        borderLeft: '3px solid var(--gold)', 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontSize: '11px',
                        color: 'var(--muted)',
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        marginBottom: '-6px'
                      }}>
                        {msg.parentContent}
                      </div>
                    )}

                    <div style={{ 
                      background: isMe ? 'var(--gold-soft)' : 'var(--bg-3)', 
                      border: isMe ? '1px solid var(--gold)' : '1px solid var(--line)', 
                      color: isMe ? '#fff' : 'var(--text)', 
                      padding: '8px 12px', 
                      borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      position: 'relative'
                    }}>
                      <p style={{ fontSize: '13px', lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.content}</p>
                      
                      {msg.likedBy.length > 0 && (
                        <div style={{ 
                          position: 'absolute', 
                          bottom: '-10px', 
                          right: '8px', 
                          background: 'var(--bg-2)', 
                          border: '1px solid var(--line)', 
                          borderRadius: '10px', 
                          padding: '2px 5px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '2px',
                          fontSize: '8px',
                          color: 'var(--gold)'
                        }}>
                          <Heart size={8} fill="var(--gold)" />
                          <span>{msg.likedBy.length}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      alignSelf: isMe ? 'flex-end' : 'flex-start', 
                      fontSize: '9px', 
                      color: 'var(--muted)',
                      padding: '0 4px'
                    }}>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && selectedFriend && (
                        msg.readAt
                          ? <CheckCheck size={11} style={{ color: 'var(--gold)' }} title="Visto" />
                          : <Check size={11} style={{ color: 'var(--muted)' }} title="Enviado" />
                      )}
                      <button onClick={() => setReplyingTo(msg)} style={{ color: 'var(--muted)', border: 'none', background: 'none' }}>Resp</button>
                      <button onClick={() => handleLikeMessage(msg.id)} style={{ color: liked ? 'var(--gold)' : 'var(--muted)', border: 'none', background: 'none' }}>
                        {liked ? 'Descurtir' : 'Curtir'}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} style={{ padding: isMobile ? '8px' : '12px', background: 'var(--bg-2)', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-3)', borderLeft: '3px solid var(--gold)', padding: '6px 12px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', minWidth: 0 }}>
                    <span style={{ color: 'var(--gold)', fontWeight: '600', display: 'block', fontSize: '9px' }}>RESPONDENDO A:</span>
                    <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{replyingTo.content}</span>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} style={{ color: 'var(--muted)', background: 'none', border: 'none' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <input 
                  type="text" 
                  placeholder="Escreva..." 
                  value={messageText}
                  onChange={e => { setMessageText(e.target.value); handleTypingChange(); }}
                  onBlur={stopTyping}
                  style={{ flex: 1, padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px', fontSize: '14px' }}
                />
                <button type="submit" className="btn-primary" style={{ padding: isMobile ? '8px 12px' : '10px 14px', minHeight: isMobile ? '36px' : '40px' }}>
                  <Send size={14} />
                </button>
                {inRandomChat && matchMode === 'text' && (
                  <button type="button" className="btn-primary animate-pulse-glow" onClick={skipRandomMatch} title="Pular pessoa" style={{ padding: isMobile ? '8px 12px' : '10px 14px', minHeight: isMobile ? '36px' : '40px' }}>
                    <SkipForward size={14} />
                  </button>
                )}
              </div>
            </form>

          </div>
        ) : inQueue ? (
          // FILA DE MATCHMAKING OMEGLE
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }} className="animate-fade-in">
            {isMobile && (
              <button onClick={() => setActiveView('sidebar')} style={{ position: 'absolute', top: '16px', left: '16px', color: 'var(--muted)', padding: '8px' }}>
                <ChevronLeft size={24} /> Voltar
              </button>
            )}

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
            }}>
              <div className="radar-wave-1"></div>
              <div className="radar-wave-2"></div>
              <Video size={36} style={{ color: 'var(--gold)', zIndex: 2 }} />
            </div>
            
            <h2 style={{ color: 'var(--gold)', marginBottom: '8px', fontSize: '20px' }}>Matchmaking Conectado</h2>
            <p style={{ color: 'var(--muted)', maxWidth: '300px', fontSize: '13px', marginBottom: '24px', lineHeight: '1.4' }}>
              {queueStatusText}
            </p>
            <button className="btn-secondary" onClick={cancelRandomMatch} style={{ minHeight: '40px' }}>
              Cancelar
            </button>
          </div>
        ) : (
          // TELA INICIAL / BEM-VINDO - Ocultada no mobile
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }} className="animate-fade-in">
            {isMobile && (
              <button 
                onClick={() => setActiveView('sidebar')} 
                className="btn-primary animate-pulse-glow" 
                style={{ position: 'absolute', top: '16px', right: '16px', padding: '8px 16px', fontSize: '12px' }}
              >
                Ver Amigos <Users size={14} style={{ marginLeft: '4px' }} />
              </button>
            )}

            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--gold)', marginBottom: '16px' }} className="animate-float">
              <ShieldAlert size={28} style={{ color: 'var(--gold)' }} />
            </div>
            
            <h1 style={{ color: 'var(--gold)', fontSize: '24px', marginBottom: '8px' }}>NexChat</h1>
            <p style={{ color: 'var(--muted)', maxWidth: '400px', fontSize: '13px', lineHeight: '1.5', marginBottom: '24px' }}>
              Combine conexões instantâneas (Omegle) com chat privado (WhatsApp) e moderação robusta (Discord). Configure as opções abaixo e inicie a diversão!
            </p>

            {/* Configuração de Filtros de Pareamento */}
            <div className="glass-card animate-slide-in" style={{ maxWidth: '440px', width: '100%', border: '1px solid var(--line)', textAlign: 'left', padding: '16px' }}>
              <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={14} /> Filtros de Matchmaking
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Filtro Gênero</label>
                    <select value={matchGender} onChange={e => setMatchGender(e.target.value)} style={{ width: '100%', fontSize: '12px', minHeight: '38px', padding: '6px 10px' }}>
                      <option value="any">Qualquer</option>
                      <option value="male">Homens</option>
                      <option value="female">Mulheres</option>
                    </select>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Filtro País</label>
                    <select value={matchCountry} onChange={e => setMatchCountry(e.target.value)} style={{ width: '100%', fontSize: '12px', minHeight: '38px', padding: '6px 10px' }}>
                      <option value="any">Qualquer</option>
                      <option value="BR">Brasil</option>
                      <option value="US">EUA</option>
                      <option value="PT">Portugal</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Formato</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ flex: 1, padding: '8px', background: matchMode === 'text' ? 'var(--gold-soft)' : 'var(--bg-3)', border: matchMode === 'text' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', minHeight: '38px' }}>
                      <input type="radio" name="matchMode" checked={matchMode === 'text'} onChange={() => setMatchMode('text')} style={{ display: 'none' }} />
                      <MessageSquare size={13} style={{ color: matchMode === 'text' ? 'var(--gold)' : 'var(--muted)' }} /> Texto
                    </label>
                    <label style={{ flex: 1, padding: '8px', background: matchMode === 'video' ? 'var(--gold-soft)' : 'var(--bg-3)', border: matchMode === 'video' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', minHeight: '38px', opacity: useMedia ? 1 : 0.5 }}>
                      <input type="radio" name="matchMode" disabled={!useMedia} checked={matchMode === 'video'} onChange={() => setMatchMode('video')} style={{ display: 'none' }} />
                      <Video size={13} style={{ color: matchMode === 'video' ? 'var(--gold)' : 'var(--muted)' }} /> Vídeo
                    </label>
                  </div>
                </div>

                <button className="btn-primary animate-pulse-glow" onClick={startRandomMatch} style={{ width: '100%', justifyContent: 'center', marginTop: '4px', minHeight: '44px' }}>
                  Buscar Conexão <Play size={12} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. TELA DE RECEBIMENTO DE CHAMADA DIRETA */}
      {incomingCall && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, width: '280px', background: 'rgba(17,17,21,0.95)', backdropFilter: 'blur(10px)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 20px rgba(234, 200, 71, 0.35)' }} className="animate-pulse-glow">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--gold)' }}>
              {incomingCall.callerData.username[0].toUpperCase()}
            </div>
            <div>
              <h4 style={{ fontSize: '13px', color: '#fff' }}>{incomingCall.callerData.username}</h4>
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Chamando você ({incomingCall.type === 'video' ? 'Vídeo' : 'Áudio'})...</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={acceptIncomingCall} className="btn-primary" style={{ flex: 1, padding: '6px', fontSize: '12px', justifyContent: 'center', minHeight: '34px' }}>
              Atender
            </button>
            <button onClick={rejectIncomingCall} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '12px', background: 'var(--red)', color: '#fff', border: 'none', minHeight: '34px' }}>
              Rejeitar
            </button>
          </div>
        </div>
      )}

      {/* 4.5 MODAL DE PERFIL */}
      {(profileLoading || profileUser || profileError) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '360px', width: '100%', border: '1px solid var(--line)', padding: '20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setProfileUser(null); setProfileError(''); }} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>
            {profileLoading ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px', padding: '24px 0' }}>Carregando perfil...</p>
            ) : profileError ? (
              <p style={{ color: 'var(--red)', fontSize: '13px', padding: '24px 0' }}>{profileError}</p>
            ) : profileUser && (
              <>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold', color: 'var(--gold)', margin: '0 auto 12px' }}>
                  {profileUser.username[0].toUpperCase()}
                </div>
                <h3 style={{ fontSize: '18px', color: 'var(--text)' }}>{profileUser.username}</h3>
                <p style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>{profileUser.customId}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
                  <span><MapPin size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} /> {profileUser.country || 'Desconhecido'}</span>
                  <span>Gênero: {profileUser.gender === 'male' ? 'Masculino' : profileUser.gender === 'female' ? 'Feminino' : 'Outro'}</span>
                  <span style={{ color: onlineUsers[profileUser.id] ? 'var(--green)' : 'var(--muted)' }}>
                    {onlineUsers[profileUser.id] ? 'Online' : 'Offline'}
                  </span>
                </div>

                <button className="btn-primary" onClick={startChatFromProfile} style={{ width: '100%', justifyContent: 'center', minHeight: '40px' }}>
                  <MessageSquare size={14} /> Conversar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. MODAL DE DENÚNCIA (REPORT) */}
      {showReportModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--red)', fontSize: '16px' }}>Denunciar</h3>
              <button onClick={() => setShowReportModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Motivo</label>
                <select value={reportReason} onChange={e => setReportReason(e.target.value)} style={{ width: '100%', minHeight: '38px' }}>
                  <option value="Comportamento impróprio">Comportamento impróprio</option>
                  <option value="Conteúdo impróprio / Nudez">Conteúdo impróprio / Nudez</option>
                  <option value="Assédio / Discurso de ódio">Assédio / Discurso de ódio</option>
                  <option value="Spam / Fraude">Spam / Fraude</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Detalhes</label>
                <textarea 
                  rows="3" 
                  placeholder="Descreva..." 
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  style={{ width: '100%', resize: 'none', background: 'var(--bg-3)', border: '1px solid var(--line)', color: '#fff', padding: '8px', borderRadius: '6px' }}
                />
              </div>
              <button className="btn-primary" onClick={submitReport} style={{ background: 'var(--red)', color: '#fff', justifyContent: 'center', marginTop: '4px', minHeight: '40px' }}>
                Enviar Denúncia
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
