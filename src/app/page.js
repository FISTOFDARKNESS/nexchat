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

const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤔','😅','😭','😡','🥺','😴','🤯','👍','👎','👏','🙏','💪','🔥','❤️','💔','✨','🎉','🎂','👀','💯','✅','❌','⚠️','🚀','🐱','🐶','🍕','⚽','🎮','🌹','☕','😂','😉','🤝','😇','🥳','😬','🙄','😜','🤗','😷'];

function formatDuration(secs) {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `(${m}:${String(s).padStart(2, '0')})`;
}

function Avatar({ url, name, size = 36, fontSize, border = '1px solid var(--line)', bg = 'var(--bg-3)', color }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border, flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontSize || Math.round(size * 0.4), fontWeight: 'bold', color: color || 'var(--gold)', flexShrink: 0 }}>
      {name ? name[0].toUpperCase() : '?'}
    </div>
  );
}

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

  // --- Grupos ---
  const [groupsList, setGroupsList] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddToCallModal, setShowAddToCallModal] = useState(false);

  // --- Edição de mensagem ---
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState('');

  // --- Emoji picker ---
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // --- Cronômetro de chamada ---
  const callStartedAtRef = useRef(null);
  const [callElapsed, setCallElapsed] = useState(0);

  // --- Bloqueios ---
  const [blockedIds, setBlockedIds] = useState({});

  // --- Edição de perfil próprio ---
  const [editProfileMode, setEditProfileMode] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editStatus, setEditStatus] = useState('');

  // --- Referências de Elementos e WebRTC ---
  const localVideoRef = useRef(null);
  const remoteVideoElsRef = useRef({}); // peerId -> <video>
  const remoteAudioElsRef = useRef({}); // peerId -> <audio> (chamadas sem vídeo)
  const messagesEndRef = useRef(null);
  const localStreamRef = useRef(null);

  // WebRTC mesh: um RTCPeerConnection por participante (peerId -> pc)
  const pcsRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream

  // --- Refs com os valores mais recentes (para handlers do socket) ---
  const matchModeRef = useRef(matchMode);
  const useMediaRef = useRef(useMedia);
  const randomRoomIdRef = useRef(randomRoomId);
  const activeCallRoomRef = useRef(activeCallRoom);
  const selectedFriendRef = useRef(selectedFriend);
  const selectedGroupRef = useRef(selectedGroup);
  const callStateRef = useRef(callState);
  const callTypeRef = useRef(callType);
  const inRandomChatRef = useRef(inRandomChat);
  const callListenersRef = useRef([]);

  useEffect(() => {
    matchModeRef.current = matchMode;
    useMediaRef.current = useMedia;
    randomRoomIdRef.current = randomRoomId;
    activeCallRoomRef.current = activeCallRoom;
    selectedFriendRef.current = selectedFriend;
    selectedGroupRef.current = selectedGroup;
    callStateRef.current = callState;
    callTypeRef.current = callType;
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

  // Reatribui streams remotos aos elementos (montam depois do ontrack)
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      const v = remoteVideoElsRef.current[peerId];
      if (v && v.srcObject !== stream) {
        v.srcObject = stream;
        v.play().catch(e => console.log('Autoplay remote stream error:', e));
      }
      const a = remoteAudioElsRef.current[peerId];
      if (a && a.srcObject !== stream) {
        a.srcObject = stream;
        a.play().catch(e => console.log('Autoplay remote audio error:', e));
      }
    });
  });

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

  // --- Som sutil de mensagem (WebAudio, sem arquivo) ---
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 600);
    } catch (e) { /* áudio indisponível */ }
  }, []);

  // --- Badge de não lidas no título da aba ---
  useEffect(() => {
    const total =
      Object.values(localUnread).reduce((a, b) => a + b, 0) +
      friendsList.reduce((a, f) => a + (f.unreadCount || 0), 0) +
      groupsList.reduce((a, g) => a + (g.unreadCount || 0), 0);
    document.title = total > 0 ? `(${total}) NexChat` : 'NexChat';
  }, [localUnread, friendsList, groupsList]);

  // --- Cronômetro da chamada ativa ---
  useEffect(() => {
    if (callState !== 'connected') return;
    callStartedAtRef.current = Date.now();
    const iv = setInterval(() => {
      setCallElapsed(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [callState]);

  // --- Carregar lista de bloqueados ---
  const loadBlocks = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/blocks');
      const data = await res.json();
      if (data.success) {
        setBlockedIds(Object.fromEntries(data.blocked.map(b => [b.id, true])));
      }
    } catch (err) {
      console.error('Erro ao buscar bloqueios:', err);
    }
  }, [user]);

  // --- Carregar lista de grupos ---
  const loadGroups = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/groups');
      const data = await res.json();
      if (data.success) {
        setGroupsList(data.groups || []);
      }
    } catch (err) {
      console.error('Erro ao buscar grupos:', err);
    }
  }, [user]);

  // --- Registrar chamada no chat (registro fica salvo) ---
  const logCall = useCallback(async (callType, duration = 0) => {
    const friend = selectedFriendRef.current;
    if (!friend || !user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'call_log', receiverId: friend.friendId, callType, durationSeconds: duration })
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        const sortedIds = [user.id, friend.friendId].sort();
        const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
        socket?.emit('friend_call_logged', { roomId: chatRoomId, message: data.message });
      }
    } catch (err) {
      console.error('Erro ao registrar chamada:', err);
    }
  }, [user]);

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
      setSelectedGroup(null);
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

  // --- WebRTC mesh: cria/reusa um RTCPeerConnection por participante ---
  const cleanupPeer = useCallback((peerId) => {
    const pc = pcsRef.current[peerId];
    if (pc) {
      pc.close();
      delete pcsRef.current[peerId];
    }
    setRemoteStreams(prev => {
      if (!prev[peerId]) return prev;
      const n = { ...prev };
      delete n[peerId];
      return n;
    });
  }, []);

  const getOrCreatePC = useCallback((peerId, roomId, role, isAudioOnly = false) => {
    if (!peerId) return null;
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];

    const pc = new RTCPeerConnection(rtcConfig);
    pcsRef.current[peerId] = pc;

    // Em chamada de áudio envia apenas o áudio; em vídeo envia áudio + vídeo
    if (localStreamRef.current) {
      const tracks = isAudioOnly
        ? localStreamRef.current.getAudioTracks()
        : localStreamRef.current.getTracks();
      tracks.forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setRemoteStreams(prev => ({ ...prev, [peerId]: event.streams[0] }));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', { roomId, peerId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    if (role === 'caller') {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { roomId, peerId, offer });
      })().catch(err => console.error('Erro ao criar oferta WebRTC:', err));
    }

    return pc;
  }, [cleanupPeer]);

  const cleanupCall = useCallback(() => {
    removeCallListeners();
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    setRemoteStreams({});
    setCallState('idle');
    setActiveCallRoom(null);
    setCallElapsed(0);
  }, [removeCallListeners]);

  // --- Efeito: Inicializar Socket se Usuário Logar ---
  useEffect(() => {
    if (!user) return;

    socket = io();

    socket.on('connect', () => {
      console.log('Conectado ao WebSocket local');
      socket.emit('identify', { userId: user.id });
    });

    // Sessão inválida (cookie ausente/expirado): exige novo login
    socket.on('identify_error', ({ error }) => {
      addToast(error || 'Sessão inválida. Faça login novamente.', 'error');
      localStorage.removeItem('nexchat_user');
      localStorage.removeItem('nexchat_token');
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      setUser(null);
      socket.disconnect();
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
        getOrCreatePC(partner.userId, roomId, role, false);
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
      const { roomId, offer, peerId } = data;
      if (!peerId || !roomId) return;
      const rId = randomRoomIdRef.current || activeCallRoomRef.current;
      if (rId !== roomId) return;
      const pc = getOrCreatePC(peerId, roomId, 'receiver', callTypeRef.current === 'audio');
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', { roomId, peerId, answer });
      } catch (err) {
        console.error('Erro ao processar webrtc_offer:', err);
      }
    });

    socket.on('webrtc_answer', async (data) => {
      const { peerId, answer } = data;
      const pc = peerId ? pcsRef.current[peerId] : null;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Erro ao processar webrtc_answer:', err);
        }
      }
    });

    socket.on('webrtc_ice_candidate', async (data) => {
      const { peerId, candidate } = data;
      const pc = peerId ? pcsRef.current[peerId] : null;
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Erro ao adicionar ICE Candidate:', e);
        }
      }
    });

    // Novo participante entrou na chamada (cria PC receptor para ele)
    socket.on('participant_joined', ({ userId }) => {
      if (userId !== user.id && activeCallRoomRef.current) {
        getOrCreatePC(userId, activeCallRoomRef.current, 'receiver', callTypeRef.current === 'audio');
      }
    });

    // Lista de participantes enviada a quem acabou de aceitar (cria PCs chamadores)
    socket.on('call_participants', ({ participants }) => {
      const roomId = activeCallRoomRef.current;
      if (!roomId) return;
      participants.forEach(pid => {
        if (pid !== user.id) {
          getOrCreatePC(pid, roomId, 'caller', callTypeRef.current === 'audio');
        }
      });
    });

    socket.on('receive_friend_msg', (msg) => {
      const activeFriend = selectedFriendRef.current;
      if (activeFriend && (msg.senderId === activeFriend.friendId || msg.receiverId === activeFriend.friendId)) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (msg.senderId === activeFriend.friendId) {
          markMessagesRead(activeFriend.friendId);
        }
      } else {
        addToast('Nova mensagem de amizade!', 'info');
        playBeep();
        setLocalUnread(prev => ({ ...prev, [msg.senderId]: (prev[msg.senderId] || 0) + 1 }));
      }
    });

    socket.on('friend_msg_edited', (msg) => {
      if (!msg || !msg.id) return;
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
    });

    socket.on('friend_call_logged', (msg) => {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    });

    socket.on('receive_group_msg', (msg) => {
      const activeGroup = selectedGroupRef.current;
      if (activeGroup && msg.groupId === activeGroup.id) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      } else {
        addToast('Nova mensagem em grupo!', 'info');
        playBeep();
        setGroupsList(prev => prev.map(g => g.id === msg.groupId ? { ...g, unreadCount: (g.unreadCount || 0) + 1 } : g));
        loadGroups();
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

    socket.on('friend_msg_deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
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
      if (callStateRef.current !== 'connected') return;
      addToast('Chamada encerrada pelo amigo.', 'warning');
      const t = callTypeRef.current;
      cleanupCall();
      logCall(t, 0);
    });

    const queueLoad = setTimeout(loadFriends, 0);
    const queueLoadGroups = setTimeout(loadGroups, 0);
    const queueLoadBlocks = setTimeout(loadBlocks, 0);

    return () => {
      clearTimeout(queueLoad);
      clearTimeout(queueLoadGroups);
      clearTimeout(queueLoadBlocks);
      removeCallListeners();
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user, loadFriends, addToast, getOrCreatePC, cleanupCall, removeCallListeners, markMessagesRead, logCall, loadGroups, loadBlocks, playBeep]);

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
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setSelectedFriend(null);
    setFriendsList([]);
    setPendingReceived([]);
    setPendingSent([]);
    setGroupsList([]);
    setSelectedGroup(null);
    setBlockedIds({});
    setEditProfileMode(false);
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

  // --- Apagar mensagem direta (apenas remetente) ---
  const handleDeleteMessage = async (msgId) => {
    if (!user || !selectedFriend) return;
    const msg = messages.find(m => m.id === msgId);
    if (msg && msg.type === 'call') {
      if (!confirm('Apagar o registro desta chamada?')) return;
    } else if (!confirm('Apagar esta mensagem para todos?')) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', messageId: msgId })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        const sortedIds = [user.id, selectedFriend.friendId].sort();
        const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
        socket.emit('delete_friend_msg', { roomId: chatRoomId, messageId: msgId, friendId: selectedFriend.friendId });
      } else {
        addToast(data.error || 'Não foi possível apagar a mensagem', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Editar mensagem (apenas remetente, marca "editada") ---
  const startEditMessage = (msg) => {
    setEditingMsgId(msg.id);
    setEditText(msg.content);
  };

  const cancelEditMessage = () => {
    setEditingMsgId(null);
    setEditText('');
  };

  const saveEditMessage = async () => {
    if (!editingMsgId || !editText.trim() || !user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', messageId: editingMsgId, content: editText.trim() })
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
        if (selectedFriend) {
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('edit_friend_msg', { roomId: chatRoomId, message: data.message, friendId: selectedFriend.friendId });
        }
        cancelEditMessage();
      } else {
        addToast(data.error || 'Não foi possível editar a mensagem', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Bloquear / desbloquear usuário ---
  const toggleBlock = async (target) => {
    if (!user || !target) return;
    const isBlocked = !!blockedIds[target.id];
    try {
      const res = await authedFetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isBlocked ? 'unblock' : 'block', targetId: target.id })
      });
      const data = await res.json();
      if (data.success) {
        setBlockedIds(prev => {
          const n = { ...prev };
          if (data.blocked) n[target.id] = true; else delete n[target.id];
          return n;
        });
        addToast(isBlocked ? `${target.username} desbloqueado.` : `${target.username} bloqueado.`, isBlocked ? 'success' : 'warning');
        if (!isBlocked && selectedFriend?.friendId === target.id) {
          setSelectedFriend(null);
          setMessages([]);
        }
      } else {
        addToast(data.error || 'Erro ao bloquear usuário', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Editar perfil (bio/status) ---
  const openEditProfile = () => {
    setEditBio(user.bio || '');
    setEditStatus(user.status || '');
    setEditProfileMode(true);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: editBio, status: editStatus })
      });
      const data = await res.json();
      if (data.success) {
        const updated = { ...user, bio: data.user.bio, status: data.user.status };
        setUser(updated);
        localStorage.setItem('nexchat_user', JSON.stringify(updated));
        if (profileUser && profileUser.id === user.id) setProfileUser({ ...profileUser, bio: data.user.bio, status: data.user.status });
        setEditProfileMode(false);
        addToast('Perfil atualizado!', 'success');
      } else {
        addToast(data.error || 'Erro ao salvar perfil', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', 'avatar');
    try {
      const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        const res2 = await authedFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: data.file.url })
        });
        const d2 = await res2.json();
        if (d2.success) {
          const updated = { ...user, avatarUrl: data.file.url };
          setUser(updated);
          localStorage.setItem('nexchat_user', JSON.stringify(updated));
          if (profileUser && profileUser.id === user.id) setProfileUser({ ...profileUser, avatarUrl: data.file.url });
          addToast('Avatar atualizado!', 'success');
        }
      } else {
        addToast(data.error || 'Erro ao enviar avatar', 'error');
      }
    } catch (err) {
      console.error(err);
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
        getOrCreatePC(selectedFriendRef.current.friendId, callRoomId, 'caller', type === 'audio');
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
    const { callRoomId, type } = incomingCall;

    setCallState('connected');
    setCallType(type);
    setActiveCallRoom(callRoomId);
    setIncomingCall(null);
    setActiveView('chat');

    socket.emit('accept_friend_call', { callRoomId });
    if (useMedia) {
      // O servidor responde com call_participants (lista de participantes já na sala);
      // nele criamos os PCs chamadores. Em chamada de grupo não há peer para o host (só via eventos).
      if (!incomingCall.isGroup) {
        getOrCreatePC(incomingCall.callerId, callRoomId, 'caller', type === 'audio');
      }
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
    const t = callType;
    const duration = callStartedAtRef.current ? Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000)) : 0;
    if (roomId) {
      socket.emit('end_friend_call', { callRoomId: roomId });
    }
    cleanupCall();
    addToast('Chamada encerrada.', 'info');
    logCall(t, duration);
  };

  // --- Grupos ---
  const selectGroup = async (groupId) => {
    setSelectedFriend(null);
    setMessages([]);
    setActiveView('chat');
    try {
      const res = await authedFetch(`/api/groups?groupId=${groupId}`);
      const data = await res.json();
      if (data.success) {
        const group = { ...data.group, members: data.members || [] };
        setSelectedGroup(group);
        setGroupsList(prev => prev.map(g => g.id === groupId ? { ...g, unreadCount: 0 } : g));
        socket.emit('join_group_chat', { groupId });
        if (data.messages?.length) {
          setMessages(data.messages);
        }
      }
    } catch (err) {
      console.error('Erro ao abrir grupo:', err);
    }
  };

  // Entra/sai da sala do grupo conforme o chat ativo
  useEffect(() => {
    if (selectedGroup && socket) {
      socket.emit('join_group_chat', { groupId: selectedGroup.id });
      return () => {
        socket.emit('leave_group_chat', { groupId: selectedGroup.id });
      };
    }
  }, [selectedGroup, socket]);

  // Abre a conversa com o amigo vinda de um grupo (via perfil)
  const startChatFromGroupProfile = async (target) => {
    const friend = friendsList.find(f => f.friendId === target.id) || friendsList.find(f => f.customId === target.customId);
    if (friend) {
      setSelectedGroup(null);
      setSelectedFriend(friend);
      setMessages([]);
      setActiveView('chat');
      loadMessages(friend.friendId);
    } else {
      addToast('Adicione este usuário como amigo para conversar.', 'warning');
    }
  };

  const sendGroupMessage = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !groupInput.trim()) return;
    const content = groupInput.trim();
    setGroupInput('');
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', groupId: selectedGroup.id, content })
      });
      const data = await res.json();
      if (data.success && data.message) {
        socket.emit('send_group_msg', { groupId: selectedGroup.id, message: data.message });
        setMessages(prev => [...prev, data.message]);
      } else {
        addToast(data.error || 'Erro ao enviar mensagem no grupo.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: groupName.trim(), memberIds: groupMembers })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateGroupModal(false);
        setGroupName('');
        setGroupMembers([]);
        loadGroups();
        addToast('Grupo criado!', 'success');
      } else {
        addToast(data.error || 'Erro ao criar grupo.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addMemberToGroup = async (userId) => {
    if (!selectedGroup) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_member', groupId: selectedGroup.id, userId })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddMemberModal(false);
        addToast('Participante adicionado ao grupo.', 'success');
        selectGroup(selectedGroup.id);
      } else {
        addToast(data.error || 'Erro ao adicionar participante.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Adicionar amigo à chamada em andamento ---
  const addToCall = async (friend) => {
    if (!activeCallRoom) return;
    setShowAddToCallModal(false);
    socket.emit('add_friend_to_call', {
      callRoomId: activeCallRoom,
      friendUserId: friend.friendId,
      inviterName: user.username
    });
    if (onlineUsers[friend.friendId]) {
      addToast(`Convite de chamada enviado para ${friend.username}.`, 'info');
    } else {
      addToast(`${friend.username} está offline — receberá o convite ao entrar.`, 'info');
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, cursor: 'pointer' }} onClick={() => openProfile({ friendId: user.id })}>
            <Avatar url={user.avatarUrl} name={user.username} size={38} border="1px solid var(--gold)" />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '15px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</h3>
              <span style={{ fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{user.customId}</span>
              {user.status && <div style={{ fontSize: '10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.status}</div>}
            </div>
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
                  setSelectedGroup(null);
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
                  <Avatar url={f.avatarUrl} name={f.username} size={36} />
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

        {/* Lista de Grupos (Discord style) */}
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>
              GRUPOS ({groupsList.length})
            </span>
            <button onClick={() => setShowCreateGroupModal(true)} title="Criar grupo" style={{ color: 'var(--gold)', padding: '4px', display: 'flex' }}>
              <UserPlus size={15} />
            </button>
          </div>
          {groupsList.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '12px', padding: '0 16px', fontStyle: 'italic' }}>Nenhum grupo ainda.</p>
          ) : (
            groupsList.map(g => (
              <div
                key={g.id}
                onClick={() => {
                  setSelectedFriend(null);
                  setShowAdminPanel(false);
                  selectGroup(g.id);
                }}
                className="friend-item-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: selectedGroup?.id === g.id ? 'rgba(234, 200, 71, 0.08)' : 'transparent',
                  borderLeft: selectedGroup?.id === g.id ? '3px solid var(--gold)' : '3px solid transparent',
                  minHeight: '52px'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={15} style={{ color: 'var(--gold)' }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.memberCount} participantes</span>
                    {(g.unreadCount || 0) > 0 && (
                      <span style={{ background: 'var(--gold)', color: '#111', fontSize: '9px', fontWeight: '700', borderRadius: '8px', padding: '1px 6px', flexShrink: 0 }}>
                        {g.unreadCount}
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
        ) : selectedFriend || selectedGroup || inRandomChat ? (
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
                        setSelectedGroup(null);
                        setMessages([]);
                        setActiveView('sidebar');
                      }
                    }} 
                    style={{ color: 'var(--muted)', padding: '8px', marginRight: '-4px' }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}
                
                <div style={{ width: isMobile ? '30px' : '36px', height: isMobile ? '30px' : '36px', flexShrink: 0, cursor: selectedGroup ? 'default' : inRandomChat ? 'default' : 'pointer' }} onClick={() => { if (!inRandomChat && !selectedGroup) openProfile(selectedFriend); }}>
                  {selectedGroup ? (
                    <Avatar name="Grupo" size={isMobile ? 30 : 36} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" />
                  ) : inRandomChat ? (
                    <Avatar name="?" size={isMobile ? 30 : 36} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" />
                  ) : (
                    <Avatar url={selectedFriend.avatarUrl} name={selectedFriend.username} size={isMobile ? 30 : 36} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedGroup ? selectedGroup.name : inRandomChat ? `Parceiro (${randomPartner?.country})` : selectedFriend.username}
                  </h4>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedGroup
                      ? `${selectedGroup.members?.length || 0} participantes`
                      : inRandomChat
                        ? `Filtro: ${randomPartner?.gender === 'male' ? 'Homem' : 'Mulher'}`
                        : typingStatus.isTyping && typingStatus.friendId === selectedFriend.friendId
                          ? <span style={{ color: 'var(--gold)' }}>digitando...</span>
                          : selectedFriend.customId}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px' }}>
                {selectedGroup ? (
                  <button className="btn-primary" onClick={() => setShowAddMemberModal(true)} title="Adicionar participante" style={{ padding: isMobile ? '6px 10px' : '8px 12px', minHeight: isMobile ? '32px' : '36px', fontSize: isMobile ? '11px' : '12px' }}>
                    <UserPlus size={isMobile ? 13 : 15} /> {isMobile ? '' : 'Adicionar'}
                  </button>
                ) : inRandomChat ? (
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
              <div style={{ height: isMobile ? '56px' : '64px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap', padding: '0 8px' }}>
                {Object.entries(remoteStreams).map(([peerId]) => (
                  <audio
                    key={peerId}
                    ref={el => { remoteAudioElsRef.current[peerId] = el; }}
                    autoPlay
                    playsInline
                    style={{ display: 'none' }}
                  />
                ))}
                <span style={{ fontSize: '13px', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} /> Em chamada de áudio... <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>{formatDuration(callElapsed)}</span>
                </span>
                {selectedFriend && (
                  <button onClick={() => setShowAddToCallModal(true)} title="Adicionar à chamada" style={{ padding: '8px', borderRadius: '50%', background: 'var(--gold-soft)', color: 'var(--gold)', border: '1px solid var(--gold)', minHeight: isMobile ? '32px' : '36px' }}>
                    <UserPlus size={13} />
                  </button>
                )}
                <button onClick={toggleAudio} title="Mudo" style={{ padding: '8px', borderRadius: '50%', background: 'var(--bg-3)', color: '#fff', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                  {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                </button>
                <button onClick={endCall} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px', border: 'none', minHeight: isMobile ? '32px' : '36px' }}>
                  Encerrar
                </button>
              </div>
            )}

            {/* Video Box (WebRTC P2P/mesh com layout responsivo mobile corrigido) */}
            {((inRandomChat && matchMode === 'video') || (callState === 'connected' && callType === 'video')) && (
              <div 
                style={{ 
                  height: isMobile ? '180px' : '280px', 
                  background: '#000', 
                  display: 'flex', 
                  flexWrap: 'wrap',
                  position: 'relative', 
                  borderBottom: '1px solid var(--line)',
                  flexShrink: 0
                }}
              >
                {/* Remotos (um por participante; em chamada em grupo vira grade) */}
                {Object.entries(remoteStreams).map(([peerId], idx) => {
                  const count = Object.keys(remoteStreams).length;
                  return (
                    <video
                      key={peerId}
                      ref={el => { remoteVideoElsRef.current[peerId] = el; }}
                      autoPlay
                      playsInline
                      style={{
                        width: count === 1 ? '100%' : count === 2 ? '50%' : '33.33%',
                        height: '100%',
                        objectFit: 'cover',
                        background: '#000',
                        borderRight: idx < count - 1 ? '1px solid var(--line)' : 'none'
                      }}
                    />
                  );
                })}
                
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
                  {callState === 'connected' && (
                    <span style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '12px', fontFamily: 'var(--font-mono)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                      {formatDuration(callElapsed)}
                    </span>
                  )}
                  <button onClick={toggleAudio} style={{ padding: '8px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid var(--line)' }}>
                    {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                  </button>
                  <button onClick={toggleVideo} style={{ padding: '8px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid var(--line)' }}>
                    {videoEnabled ? <Video size={12} /> : <VideoOff size={12} />}
                  </button>
                  {callState === 'connected' && selectedFriend && (
                    <button onClick={() => setShowAddToCallModal(true)} title="Adicionar à chamada" style={{ padding: '8px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: 'var(--gold)', border: '1px solid var(--gold)' }}>
                      <UserPlus size={13} />
                    </button>
                  )}
                  {callState === 'connected' && !inRandomChat && (
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
                const liked = (msg.likedBy || []).includes(user.id);

                // Registro de chamada: chip centralizado (fica salvo no chat)
                if (msg.type === 'call') {
                  return (
                    <div key={msg.id} style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} className="animate-slide-in">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '10px', padding: '6px 12px', color: 'var(--muted)', fontSize: '11px' }}>
                        {msg.content === 'Chamada de vídeo' ? (
                          <Video size={12} style={{ color: 'var(--gold)' }} />
                        ) : (
                          <Phone size={12} style={{ color: 'var(--gold)' }} />
                        )}
                        <span>{msg.content}</span>
                        {msg.durationSeconds > 0 && (
                          <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>{formatDuration(msg.durationSeconds)}</span>
                        )}
                      </div>
                      <span style={{ fontSize: '9px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {isMe && selectedFriend && (msg.readAt
                          ? <CheckCheck size={11} style={{ color: 'var(--gold)' }} title="Visto" />
                          : <Check size={11} style={{ color: 'var(--muted)' }} title="Enviado" />)}
                        {isMe && selectedFriend && (
                          <button onClick={() => handleDeleteMessage(msg.id)} style={{ color: 'var(--red)', border: 'none', background: 'none' }}>Apagar</button>
                        )}
                      </span>
                    </div>
                  );
                }

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
                    {selectedGroup && !isMe && (
                      <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--gold)', padding: '0 4px' }}>{msg.senderName || 'Membro'}</span>
                    )}
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

                    {editingMsgId === msg.id ? (
                      <div style={{ background: isMe ? 'var(--gold-soft)' : 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '14px', padding: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditMessage(); if (e.key === 'Escape') cancelEditMessage(); }}
                          autoFocus
                          style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none' }}
                        />
                        <button onClick={saveEditMessage} style={{ color: 'var(--gold)', border: 'none', background: 'none', fontSize: '11px' }}>Salvar</button>
                        <button onClick={cancelEditMessage} style={{ color: 'var(--muted)', border: 'none', background: 'none', fontSize: '11px' }}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ 
                        background: isMe ? 'var(--gold-soft)' : 'var(--bg-3)', 
                        border: isMe ? '1px solid var(--gold)' : '1px solid var(--line)', 
                        color: isMe ? '#fff' : 'var(--text)', 
                        padding: '8px 12px', 
                        borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        position: 'relative'
                      }}>
                        <p style={{ fontSize: '13px', lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.content}
                          {msg.editedAt && (
                            <span style={{ fontSize: '9px', color: 'var(--muted)', fontStyle: 'italic', marginLeft: '6px' }}>editada</span>
                          )}
                        </p>
                        
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
                    )}

                    <div style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      alignSelf: isMe ? 'flex-end' : 'flex-start', 
                      fontSize: '9px', 
                      color: 'var(--muted)',
                      padding: '0 4px'
                    }}>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && selectedFriend && !selectedGroup && (
                        msg.readAt
                          ? <CheckCheck size={11} style={{ color: 'var(--gold)' }} title="Visto" />
                          : <Check size={11} style={{ color: 'var(--muted)' }} title="Enviado" />
                      )}
                      <button onClick={() => setReplyingTo(msg)} style={{ color: 'var(--muted)', border: 'none', background: 'none' }}>Resp</button>
                      <button onClick={() => handleLikeMessage(msg.id)} style={{ color: liked ? 'var(--gold)' : 'var(--muted)', border: 'none', background: 'none' }}>
                        {liked ? 'Descurtir' : 'Curtir'}
                      </button>
                      {isMe && selectedFriend && !inRandomChat && msg.type !== 'call' && (
                        <button onClick={() => startEditMessage(msg)} style={{ color: 'var(--gold)', border: 'none', background: 'none' }}>Editar</button>
                      )}
                      {isMe && selectedFriend && !inRandomChat && (
                        <button onClick={() => handleDeleteMessage(msg.id)} style={{ color: 'var(--red)', border: 'none', background: 'none' }}>Apagar</button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={selectedGroup ? sendGroupMessage : handleSendMessage} style={{ padding: isMobile ? '8px' : '12px', background: 'var(--bg-2)', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-3)', borderLeft: '3px solid var(--gold)', padding: '6px 12px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', minWidth: 0 }}>
                    <span style={{ color: 'var(--gold)', fontWeight: '600', display: 'block', fontSize: '9px' }}>RESPONDENDO A:</span>
                    <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{replyingTo.content}</span>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} style={{ color: 'var(--muted)', background: 'none', border: 'none' }}><X size={14} /></button>
                </div>
              )}

              {showEmojiPicker && (
                <div style={{ position: 'relative', zIndex: 20 }}>
                  <div style={{ position: 'absolute', bottom: '6px', left: '0', background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '10px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px', maxHeight: '160px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {EMOJIS.map((em, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setMessageText(prev => prev + em);
                          if (!selectedGroup) handleTypingChange();
                        }}
                        style={{ fontSize: '16px', padding: '4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                        className="friend-item-hover"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setShowEmojiPicker(v => !v)} title="Emojis" style={{ color: showEmojiPicker ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                  <Smile size={16} />
                </button>
                <input 
                  type="text" 
                  placeholder="Escreva..." 
                  value={messageText}
                  onChange={e => { setMessageText(e.target.value); if (!selectedGroup) handleTypingChange(); }}
                  onBlur={() => { if (!selectedGroup) stopTyping(); }}
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
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                {incomingCall.isGroup ? 'Chamada em grupo' : `Chamando você`} ({incomingCall.type === 'video' ? 'Vídeo' : 'Áudio'})...
              </span>
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
                <div style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 12px' }}>
                  <Avatar url={profileUser.avatarUrl} name={profileUser.username} size={72} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" />
                </div>
                <h3 style={{ fontSize: '18px', color: 'var(--text)' }}>{profileUser.username}</h3>
                <p style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>{profileUser.customId}</p>
                {profileUser.status && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Status: <span style={{ color: 'var(--gold)' }}>{profileUser.status}</span></div>
                )}

                {editProfileMode ? (
                  <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', textAlign: 'left' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Avatar</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Avatar url={user.avatarUrl} name={user.username} size={40} />
                        <label className="btn-secondary" style={{ fontSize: '11px', padding: '6px 10px', cursor: 'pointer' }}>
                          Enviar foto
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Status (ex: no trabalho)</label>
                      <input type="text" maxLength="40" value={editStatus} onChange={e => setEditStatus(e.target.value)} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Bio</label>
                      <textarea rows="3" maxLength="160" value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Conte algo sobre você..." style={{ width: '100%', resize: 'none', background: 'var(--bg-3)', border: '1px solid var(--line)', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '12px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center', minHeight: '38px', fontSize: '13px' }}>Salvar</button>
                      <button type="button" onClick={() => setEditProfileMode(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', minHeight: '38px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
                      <span><MapPin size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} /> {profileUser.country || 'Desconhecido'}</span>
                      <span>Gênero: {profileUser.gender === 'male' ? 'Masculino' : profileUser.gender === 'female' ? 'Feminino' : 'Outro'}</span>
                      <span style={{ color: onlineUsers[profileUser.id] ? 'var(--green)' : 'var(--muted)' }}>
                        {onlineUsers[profileUser.id] ? 'Online' : profileUser.lastSeen ? `Visto por último às ${new Date(profileUser.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'}
                      </span>
                      {profileUser.bio && <span style={{ fontStyle: 'italic', color: 'var(--text)' }}>&ldquo;{profileUser.bio}&rdquo;</span>}
                    </div>

                    {profileUser.id === user.id ? (
                      <button className="btn-secondary" onClick={openEditProfile} style={{ width: '100%', justifyContent: 'center', minHeight: '40px' }}>
                        <Settings size={14} /> Editar perfil
                      </button>
                    ) : (
                      <>
                        <button className="btn-primary" onClick={startChatFromProfile} style={{ width: '100%', justifyContent: 'center', minHeight: '40px', marginBottom: '8px' }}>
                          <MessageSquare size={14} /> Conversar
                        </button>
                        <button
                          onClick={() => toggleBlock(profileUser)}
                          style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px', background: blockedIds[profileUser.id] ? 'var(--green-soft, rgba(34,197,94,0.1))' : 'var(--red)', color: blockedIds[profileUser.id] ? 'var(--green)' : '#fff', border: blockedIds[profileUser.id] ? '1px solid var(--green)' : 'none', borderRadius: '6px' }}
                        >
                          {blockedIds[profileUser.id] ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. MODAL CRIAR GRUPO */}
      {showCreateGroupModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <form onSubmit={createGroup} className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>Criar Grupo</h3>
              <button type="button" onClick={() => setShowCreateGroupModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Nome do grupo</label>
            <input
              type="text"
              placeholder="Ex: Amigos do Futebol"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              style={{ width: '100%', fontSize: '13px', padding: '8px 12px', minHeight: '38px', marginBottom: '12px' }}
            />
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Selecionar amigos</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px' }}>
              {friendsList.map(f => {
                const selected = groupMembers.includes(f.friendId);
                return (
                  <label key={f.friendId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: selected ? 'var(--gold-soft)' : 'var(--bg-3)', border: selected ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setGroupMembers(prev => selected ? prev.filter(id => id !== f.friendId) : [...prev, f.friendId])}
                      style={{ accentColor: 'var(--gold)' }}
                    />
                    <span>{f.username}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--muted)' }}>{f.customId}</span>
                  </label>
                );
              })}
              {friendsList.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>Você ainda não tem amigos para adicionar.</p>}
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '40px' }}>
              <UserPlus size={14} /> Criar Grupo
            </button>
          </form>
        </div>
      )}

      {/* 4.1 MODAL ADICIONAR PARTICIPANTE AO GRUPO */}
      {showAddMemberModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>Adicionar ao Grupo</h3>
              <button onClick={() => setShowAddMemberModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
              {friendsList
                .filter(f => !(selectedGroup?.members || []).some(m => m.userId === f.friendId))
                .map(f => (
                  <div key={f.friendId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--gold)', flexShrink: 0 }}>
                      {f.username[0].toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px' }}>{f.username}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{f.customId}</div>
                    </div>
                    <button onClick={() => addMemberToGroup(f.friendId)} className="btn-primary" style={{ padding: '6px 10px', fontSize: '11px', minHeight: '32px' }}>
                      <UserPlus size={12} /> Adicionar
                    </button>
                  </div>
                ))}
              {friendsList.every(f => (selectedGroup?.members || []).some(m => m.userId === f.friendId)) && (
                <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>Todos os seus amigos já estão no grupo.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4.2 MODAL ADICIONAR À CHAMADA */}
      {showAddToCallModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>Adicionar à Chamada</h3>
              <button onClick={() => setShowAddToCallModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
              {friendsList.map(f => (
                <div key={f.friendId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--gold)', flexShrink: 0 }}>
                      {f.username[0].toUpperCase()}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '8px', height: '8px', borderRadius: '50%', background: onlineUsers[f.friendId] ? 'var(--green)' : 'var(--bg-3)', border: '1px solid var(--bg-2)' }}></div>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '13px' }}>{f.username}</div>
                    <div style={{ fontSize: '10px', color: onlineUsers[f.friendId] ? 'var(--green)' : 'var(--muted)' }}>
                      {onlineUsers[f.friendId] ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  <button onClick={() => addToCall(f)} className="btn-primary" style={{ padding: '6px 10px', fontSize: '11px', minHeight: '32px' }}>
                    <UserPlus size={12} /> Chamar
                  </button>
                </div>
              ))}
              {friendsList.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>Nenhum amigo para adicionar.</p>}
            </div>
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
