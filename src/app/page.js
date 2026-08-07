"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { 
  Video, Phone, UserPlus, Send, Heart, Smile, Shield, Flag, X, 
  MessageSquare, LogOut, MapPin, User, Users, Check, Trash, ShieldAlert,
  Moon, CheckSquare, Settings, AlertCircle, VolumeX, Mic, MicOff, VideoOff, Play,
  Pause,
  Plus, CheckCircle, Clock, Info, ChevronLeft, SkipForward, CheckCheck, FileText, Paperclip, Eye,
  BarChart3, Megaphone, Search, History, Crown, ToggleLeft, Palette, Bell, ShieldCheck
} from 'lucide-react';
import { PREMIUM_PRICE, formatPremiumPrice } from '@/lib/premium-config';

let socket;

const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤔','😅','😭','😡','🥺','😴','🤯','👍','👎','👏','🙏','💪','🔥','❤️','💔','✨','🎉','🎂','👀','💯','✅','❌','⚠️','🚀','🐱','🐶','🍕','⚽','🎮','🌹','☕','😂','😉','🤝','😇','🥳','😬','🙄','😜','🤗','😷'];

function formatDuration(secs) {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `(${m}:${String(s).padStart(2, '0')})`;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getTs() {
  return Date.now();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const THEMES = {
  default: {
    name: 'Dourado',
    vars: {
      '--gold': '#EAC847', '--amber': '#D97706', '--gold-soft': 'rgba(234, 200, 71, 0.12)', '--gold-glow': 'rgba(234, 200, 71, 0.35)'
    }
  },
  midnight: {
    name: 'Meia-noite',
    vars: {
      '--gold': '#818CF8', '--amber': '#6366F1', '--gold-soft': 'rgba(129, 140, 248, 0.12)', '--gold-glow': 'rgba(129, 140, 248, 0.35)'
    }
  },
  forest: {
    name: 'Floresta',
    vars: {
      '--gold': '#4ADE80', '--amber': '#16A34A', '--gold-soft': 'rgba(74, 222, 128, 0.12)', '--gold-glow': 'rgba(74, 222, 128, 0.35)'
    }
  },
  rose: {
    name: 'Rosa',
    vars: {
      '--gold': '#FB7185', '--amber': '#E11D48', '--gold-soft': 'rgba(251, 113, 133, 0.12)', '--gold-glow': 'rgba(251, 113, 133, 0.35)'
    }
  },
  ocean: {
    name: 'Oceano',
    vars: {
      '--gold': '#22D3EE', '--amber': '#0891B2', '--gold-soft': 'rgba(34, 211, 238, 0.12)', '--gold-glow': 'rgba(34, 211, 238, 0.35)'
    }
  }
};

function applyTheme(themeKey) {
  const root = document.documentElement;
  const theme = THEMES[themeKey] || THEMES.default;
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  localStorage.setItem('nexchat_theme', themeKey);
}

// Preview de mídia dentro da mensagem
function MediaPreview({ msg }) {
  const mime = msg.attach?.mime || msg.attachMime;
  const url = msg.attach?.url || (msg.attachmentId ? `/api/files/${msg.attachmentId}` : null);
  const viewOnce = msg.attach?.viewOnce || msg.attachViewOnce;
  const name = msg.attach?.filename || msg.attachFilename;
  const [opened, setOpened] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Countdown: quanto falta para a visualização única sumir (15s após abrir)
  useEffect(() => {
    if (!viewOnce || !opened) return;
    const t = setInterval(() => setRemaining(prev => (prev === null ? prev : Math.max(0, prev - 1))), 1000);
    return () => clearInterval(t);
  }, [viewOnce, opened]);

  // Arquivo não existe mais (registro órfão): não renderiza nada
  if (!url || (!mime && !name)) return null;

  const isImage = mime && mime.startsWith('image/');
  const isVideo = mime && mime.startsWith('video/');
  const isAudio = mime && mime.startsWith('audio/');

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };

  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Visualização única ainda não aberta: card clicável, sem nome de arquivo
  if (viewOnce && !opened) {
    const label = isVideo ? 'Vídeo' : isAudio ? 'Áudio' : 'Foto';
    const Icon = isVideo ? Video : isAudio ? Mic : Eye;
    return (
      <button
        onClick={() => { setOpened(true); setRemaining(15); }}
        title={label}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '8px', width: '160px', padding: '18px 12px', cursor: 'pointer',
          background: 'var(--bg-2)', border: '1px solid var(--gold)', borderRadius: '12px'
        }}
      >
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(234,200,71,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} style={{ color: 'var(--gold)' }} />
        </div>
        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>Visualizar {label}</span>
        <span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--gold)', background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>
          VISUALIZAÇÃO ÚNICA
        </span>
      </button>
    );
  }

  // Visualização única: bloqueia salvar/baixar (menu de contexto, arrastar), mantém replay
  const protect = viewOnce ? {
    onContextMenu: (e) => e.preventDefault(),
    onDragStart: (e) => e.preventDefault(),
    draggable: false
  } : {};

  let preview = null;
  if (isImage) {
    preview = <img src={url} alt={name || 'imagem'} {...protect} style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '10px', display: 'block', ...(viewOnce ? { userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'auto' } : {}) }} />;
  } else if (isVideo) {
    preview = <video src={url} controls autoPlay={viewOnce} playsInline controlsList={viewOnce ? 'nodownload' : undefined} disablePictureInPicture={viewOnce} {...protect} style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '10px', display: 'block' }} />;
  } else if (isAudio) {
    if (viewOnce) {
      // Áudio de visualização única: somente escutar (sem download, sem seek, sem controls)
      preview = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px', ...protect }} onContextMenu={(e) => e.preventDefault()}>
          <button
            onClick={toggleAudio}
            title={playing ? 'Pausar' : 'Ouvir'}
            style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            {playing ? <Pause size={16} color="#111" /> : <Play size={16} color="#111" />}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>Áudio</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtTime(curTime)} / {fmtTime(duration)}
            </span>
          </div>
          <audio
            ref={audioRef}
            src={url}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onSeeked={(e) => e.currentTarget.currentTime = curTime}
            style={{ display: 'none' }}
          />
        </div>
      );
    } else {
      preview = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mic size={16} color="#111" />
          </div>
          <audio src={url} controls autoPlay={viewOnce} controlsList="nodownload" style={{ width: '200px', maxWidth: '100%', height: '34px' }} />
        </div>
      );
    }
  } else {
    preview = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)' }}>
        <FileText size={14} style={{ color: 'var(--gold)' }} />
        <span>Arquivo</span>
        <span style={{ color: 'var(--muted)', fontSize: '10px' }}>{formatFileSize(msg.attach?.size || msg.attachSize)}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', marginBottom: msg.content ? '6px' : 0 }}>
      {preview}
      {viewOnce && (
        <span style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.75)', color: 'var(--gold)', fontSize: '9px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>
          {opened ? `SOME EM ${remaining ?? 15}s` : 'VISUALIZAÇÃO ÚNICA'}
        </span>
      )}
    </div>
  );
}

function Avatar({ url, name, size = 36, fontSize, border = '1px solid var(--line)', bg = 'var(--bg-3)', color }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setBroken(true)}
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
  const [consentGranted, setConsentGranted] = useState(() => {
    try {
      return document.cookie.split(';').some(c => c.trim().startsWith('nexchat_consent=accepted'));
    } catch {
      return false;
    }
  });
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
    const id = getTs() + Math.random().toString(36).substr(2, 5);
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

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Erro ao registrar service worker:', err);
      });
    }

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Efeito: Carregar Sessão Local ou Parâmetros da URL ---
  useEffect(() => {
    const timer = setTimeout(async () => {
      const query = new URLSearchParams(window.location.search);
      const loginSuccess = query.get('login') === 'success';
      const authErrorParam = query.get('auth_error');

      if (loginSuccess) {
        try {
          const res = await authedFetch('/api/users?id=self');
          const data = await res.json();
          if (data.success) {
            const parsedUser = data.user;
            setUser(parsedUser);
            localStorage.setItem('nexchat_user', JSON.stringify(parsedUser));
            addToast(`Conectado com sucesso! Bem-vindo, ${parsedUser.username}!`, 'success');
          }
        } catch (err) {
          console.error('Erro ao ler dados do self:', err);
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
            const parsed = JSON.parse(savedUser);
            setUser(parsed);
          } catch (e) {
            localStorage.removeItem('nexchat_user');
          }
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [addToast]);

  // --- Registrar Service Worker (PWA) ---
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

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
  const [adminTab, setAdminTab] = useState('stats');
  const [adminUsers, setAdminUsers] = useState(null);
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [adminHistory, setAdminHistory] = useState({});
  const [adminFiles, setAdminFiles] = useState(null);
  const [adminWarnings, setAdminWarnings] = useState(null);
  const [adminLogs, setAdminLogs] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [announcement, setAnnouncement] = useState(null);

  // --- Premium ---
  const [premiumStatus, setPremiumStatus] = useState(null);
  const [showPremiumScreen, setShowPremiumScreen] = useState(false);
  const [chatTheme, setChatTheme] = useState('default');
  const [invisibleMode, setInvisibleMode] = useState(false);
  const [buying, setBuying] = useState(false);
  const [pendingPremiumCheck, setPendingPremiumCheck] = useState(false);

  // --- Cookie Consent ---
  const [cookieConsent, setCookieConsent] = useState(() => {
    try {
      return document.cookie.split(';').some(c => c.trim().startsWith('nexchat_cookie_consent=accepted'));
    } catch {
      return false;
    }
  });

  const acceptCookies = () => {
    setCookieConsent(true);
    try {
      document.cookie = 'nexchat_cookie_consent=accepted; path=/; SameSite=Lax';
    } catch (e) {
      console.warn('Erro ao salvar consentimento:', e);
    }
  };

  // --- Push Notifications ---
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const requestPushPermission = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      addToast('Notificações não suportadas neste navegador.', 'error');
      return;
    }
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        addToast('Permissão de notificação negada.', 'error');
        setPushLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '')
      });

      const userAgent = navigator.userAgent;
      const res = await authedFetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: arrayBufferToBase64(subscription.getKey('auth')),
          userAgent
        })
      });

      if (res.ok) {
        setPushEnabled(true);
        addToast('Notificações ativadas!', 'success');
      } else {
        addToast('Erro ao ativar notificações.', 'error');
      }
    } catch (err) {
      console.error('Erro ao solicitar notificação:', err);
      addToast('Erro ao ativar notificações.', 'error');
    } finally {
      setPushLoading(false);
    }
  };

  const disablePush = async () => {
    setPushLoading(true);
    try {
      const res = await authedFetch('/api/push/subscription', { method: 'DELETE' });
      if (res.ok) {
        setPushEnabled(false);
        addToast('Notificações desativadas.', 'info');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPushLoading(false);
    }
  };

  useEffect(() => {
    const checkPush = async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          setPushEnabled(true);
        }
      } catch (err) {
        console.error('Erro ao verificar push:', err);
      }
    };
    checkPush();
  }, []);

  useEffect(() => {
    if (!cookieConsent) return;
    try {
      const existing = document.cookie.split(';').find(c => c.trim().startsWith('nexchat_cookie_consent='));
      if (!existing) {
        document.cookie = 'nexchat_cookie_consent=accepted; path=/; SameSite=Lax';
      }
    } catch (e) {
      console.error('Erro ao setar cookie:', e);
    }
  }, [cookieConsent]);

  useEffect(() => {
    const saved = localStorage.getItem('nexchat_theme');
    if (saved && THEMES[saved]) {
      applyTheme(saved);
    }
  }, []);

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
  const [showGroupManageModal, setShowGroupManageModal] = useState(false);
  const [showAddToCallModal, setShowAddToCallModal] = useState(false);

  // --- Edição de mensagem ---
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState('');

  // --- Emoji picker ---
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // --- Busca no chat ---
  const [chatSearch, setChatSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- Reações ---
  const [reactions, setReactions] = useState({}); // messageId -> grouped reactions
  const [reactionPicker, setReactionPicker] = useState(null); // { messageId, x, y }

  // --- Anexos / mídia ---
  const [attachment, setAttachment] = useState(null); // File selecionado
  const [viewOnce, setViewOnce] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const fileInputRef = useRef(null);

  // --- Gravação de voz ---
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const voiceMediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceTimerRef = useRef(null);
  const voiceStartTimeRef = useRef(null);

  // --- Cronômetro de chamada ---
  const callStartedAtRef = useRef(null);
  const [callElapsed, setCallElapsed] = useState(0);

  // --- Bloqueios ---
  const [blockedIds, setBlockedIds] = useState({});

  // --- Edição de perfil próprio ---
  const [editProfileMode, setEditProfileMode] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // --- Referências de Elementos e WebRTC ---
  const localVideoRef = useRef(null);
  const remoteVideoElsRef = useRef({}); // peerId -> <video>
  const remoteAudioElsRef = useRef({}); // peerId -> <audio> (chamadas sem vídeo)
  const messagesEndRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef({}); // peerId -> [candidatos ICE antes do remote description]

  // WebRTC mesh: um RTCPeerConnection por participante (peerId -> pc)
  const pcsRef = useRef({});

  // --- Badge na aba + som de mensagem ---
  const [unreadBadge, setUnreadBadge] = useState(0);
  const originalTitleRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    originalTitleRef.current = document.title;
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error('Erro ao tocar som:', e);
    }
  }, []);

  useEffect(() => {
    if (unreadBadge > 0) {
      document.title = `(${unreadBadge}) NexChat`;
    } else {
      document.title = originalTitleRef.current;
    }
  }, [unreadBadge]);

  const resetUnreadBadge = useCallback(() => {
    setUnreadBadge(0);
  }, []);
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream

  // --- Premium ---
  const loadPremiumStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/premium/status');
      const data = await res.json();
      console.log('[Premium] status API:', data);
      if (data.success) {
        setPremiumStatus(data);
        setChatTheme(data.chatTheme || 'default');
        setInvisibleMode(data.invisibleMode || false);
      }
    } catch (e) {
      console.error('[Premium] status error:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadPremiumStatus();
    }
  }, [user, loadPremiumStatus]);

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
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
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
  }, [remoteStreams]);

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
    playNotificationSound();
  }, [playNotificationSound]);

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
    callStartedAtRef.current = getTs();
    const iv = setInterval(() => {
      setCallElapsed(Math.floor((getTs() - callStartedAtRef.current) / 1000));
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
      handleEndCallIfActive();
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

  const loadReactions = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;
    try {
      const res = await authedFetch(`/api/reactions?messageId=${messageIds[0]}`);
      // For now, load one by one (can be optimized with batch endpoint)
      const results = {};
      for (const mid of messageIds) {
        const r = await authedFetch(`/api/reactions?messageId=${mid}`);
        const d = await r.json();
        if (d.success) {
          const grouped = {};
          d.reactions.forEach(r => {
            if (!grouped[r.emoji]) grouped[r.emoji] = [];
            grouped[r.emoji].push(r);
          });
          results[mid] = grouped;
        }
      }
      setReactions(prev => ({ ...prev, ...results }));
    } catch (err) {
      console.error(err);
    }
  }, []);

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
          const msgIds = (data.messages || []).map(m => m.id).filter(Boolean);
          if (msgIds.length) loadReactions(msgIds);
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
    let mediaOk = false;
    if (wantsMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setUseMedia(true);
        mediaOk = true;
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
    setCookieConsent(true);
    try {
      document.cookie = `nexchat_consent=${mediaOk ? 'accepted_media' : 'accepted_text'}; path=/; SameSite=Lax`;
    } catch (e) {
      console.warn('Não foi possível salvar consentimento da sessão:', e);
    }
  };

  // Reativa câmera/microfone quando a tela de consentimento é pulada (mesma sessão do cookie)
  useEffect(() => {
    let cancelled = false;
    try {
      const choseMedia = document.cookie.split(';').some(c => c.trim().startsWith('nexchat_consent=accepted_media'));
      if (!choseMedia || localStreamRef.current) return;
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (cancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setUseMedia(true);
        })
        .catch(() => {});
    } catch (e) {
      console.warn('Não foi possível reativar câmera:', e);
    }
    return () => { cancelled = true; };
  }, []);

  // Garante que o stream local exista antes de criar o PeerConnection
  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!useMediaRef.current) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setUseMedia(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log(e));
      }
      return stream;
    } catch (err) {
      console.warn('Falha ao obter stream local:', err.message);
      return null;
    }
  }, []);

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
    } else if (useMediaRef.current) {
      // Stream ainda não carregou: pega quando chegar e renova a oferta
      ensureLocalStream().then(stream => {
        if (!stream || !pcsRef.current[peerId]) return;
        const tracks = isAudioOnly ? stream.getAudioTracks() : stream.getTracks();
        tracks.forEach(track => {
          try { pcsRef.current[peerId].addTrack(track, stream); } catch { /* já adicionada */ }
        });
        // Renegocia para o parceiro receber a câmera recém-adicionada
        const myPc = pcsRef.current[peerId];
        myPc.onnegotiationneeded = () => {
          if (myPc.signalingState === 'stable') {
            myPc.createOffer().then(o => myPc.setLocalDescription(o)).then(() => {
              socket.emit('webrtc_offer', { roomId, from: userRef.current?.id, to: peerId, offer: myPc.localDescription });
            }).catch(() => {});
          }
        };
        try { myPc.onnegotiationneeded(); } catch { /* sem fire manual */ }
      });
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setRemoteStreams(prev => ({ ...prev, [peerId]: event.streams[0] }));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', { roomId, from: userRef.current?.id, to: peerId, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[webrtc] ICE ${pc.iceConnectionState} com ${peerId}`);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[webrtc] connection ${pc.connectionState} com ${peerId}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    if (role === 'caller') {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { roomId, from: userRef.current?.id, to: peerId, offer });
      })().catch(err => console.error('Erro ao criar oferta WebRTC:', err));
    }

    return pc;
  }, [cleanupPeer, ensureLocalStream]);

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
        await ensureLocalStream();
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
      const { roomId, from, to, offer } = data;
      if (!from || !roomId || to !== user.id) return;
      const rId = randomRoomIdRef.current || activeCallRoomRef.current;
      if (rId !== roomId) return;
      const pc = getOrCreatePC(from, roomId, 'receiver', callTypeRef.current === 'audio');
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        // Descarrega candidatos ICE que chegaram antes do remote description
        const buffered = pendingIceRef.current[from] || [];
        delete pendingIceRef.current[from];
        for (const c of buffered) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* inválido/duplicado */ }
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', { roomId, from: user.id, to: from, answer });
      } catch (err) {
        console.error('Erro ao processar webrtc_offer:', err);
      }
    });

    socket.on('webrtc_answer', async (data) => {
      const { from, to, answer } = data;
      if (!from || to !== user.id) return;
      const pc = pcsRef.current[from];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          // Descarrega candidatos ICE que chegaram antes do remote description
          const buffered = pendingIceRef.current[from] || [];
          delete pendingIceRef.current[from];
          for (const c of buffered) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* inválido/duplicado */ }
          }
        } catch (err) {
          console.error('Erro ao processar webrtc_answer:', err);
        }
      }
    });

    socket.on('webrtc_ice_candidate', async (data) => {
      const { from, to, candidate } = data;
      if (!from || to !== user.id) return;
      const pc = pcsRef.current[from];
      if (!pc || !candidate) return;
      // Se o remote description ainda não foi aplicado, guarda para depois
      if (!pc.remoteDescription) {
        (pendingIceRef.current[from] = pendingIceRef.current[from] || []).push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Erro ao adicionar ICE Candidate:', e);
      }
    });

    // Novo participante entrou na chamada (cria PC receptor para ele)
    socket.on('participant_joined', async ({ userId }) => {
      if (userId !== user.id && activeCallRoomRef.current) {
        await ensureLocalStream();
        getOrCreatePC(userId, activeCallRoomRef.current, 'receiver', callTypeRef.current === 'audio');
      }
    });

    // Lista de participantes enviada a quem acabou de aceitar (cria PCs chamadores)
    socket.on('call_participants', async ({ participants }) => {
      const roomId = activeCallRoomRef.current;
      if (!roomId) return;
      await ensureLocalStream();
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

    // Mídia de visualização única foi aberta: carrega e some da conversa após 15s
    socket.on('view_once_viewed', (data) => {
      if (data && data.messageId) {
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }, 15_000);
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

    // --- Eventos administrativos em tempo real ---
    socket.on('global_announcement', (data) => {
      setAnnouncement({ message: data.message, adminName: data.adminName, createdAt: data.createdAt });
    });

    socket.on('force_logout', ({ reason } = {}) => {
      if (reason) addToast(reason, 'error');
      setAnnouncement(null);
      handleLogout();
    });

    socket.on('admin_msg_deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    });

    socket.on('media_uploaded', (data) => {
      setAdminFiles(prev => (prev === null ? prev : [data, ...prev].slice(0, 30)));
    });

    socket.on('media_deleted', ({ id }) => {
      setAdminFiles(prev => (prev === null ? prev : prev.filter(f => f.id !== id)));
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

    socket.on('friend_msg_reacted', (data) => {
      const { messageId, emoji, userId } = data;
      setReactions(prev => {
        const current = prev[messageId] || {};
        const list = current[emoji] || [];
        if (list.some(u => u.id === userId)) return prev;
        return {
          ...prev,
          [messageId]: {
            ...current,
            [emoji]: [...list, { id: userId, username: data.username }]
          }
        };
      });
    });

    socket.on('friend_msg_unreacted', (data) => {
      const { messageId, emoji, userId } = data;
      setReactions(prev => {
        const current = prev[messageId] || {};
        const list = (current[emoji] || []).filter(u => u.id !== userId);
        if (list.length === 0) {
          const next = { ...current };
          delete next[emoji];
          return { ...prev, [messageId]: next };
        }
        return { ...prev, [messageId]: { ...current, [emoji]: list } };
      });
    });

    socket.on('group_msg_reacted', (data) => {
      const { messageId, emoji, userId } = data;
      setReactions(prev => {
        const current = prev[messageId] || {};
        const list = current[emoji] || [];
        if (list.some(u => u.id === userId)) return prev;
        return {
          ...prev,
          [messageId]: {
            ...current,
            [emoji]: [...list, { id: userId, username: data.username }]
          }
        };
      });
    });

    socket.on('group_msg_unreacted', (data) => {
      const { messageId, emoji, userId } = data;
      setReactions(prev => {
        const current = prev[messageId] || {};
        const list = (current[emoji] || []).filter(u => u.id !== userId);
        if (list.length === 0) {
          const next = { ...current };
          delete next[emoji];
          return { ...prev, [messageId]: next };
        }
        return { ...prev, [messageId]: { ...current, [emoji]: list } };
      });
    });

    socket.on('random_msg_reacted', (data) => {
      const { messageId, emoji, userId } = data;
      setReactions(prev => {
        const current = prev[messageId] || {};
        const list = current[emoji] || [];
        if (list.some(u => u.id === userId)) return prev;
        return {
          ...prev,
          [messageId]: {
            ...current,
            [emoji]: [...list, { id: userId, username: data.username }]
          }
        };
      });
    });

    socket.on('random_msg_unreacted', (data) => {
      const { messageId, emoji, userId } = data;
      setReactions(prev => {
        const current = prev[messageId] || {};
        const list = (current[emoji] || []).filter(u => u.id !== userId);
        if (list.length === 0) {
          const next = { ...current };
          delete next[emoji];
          return { ...prev, [messageId]: next };
        }
        return { ...prev, [messageId]: { ...current, [emoji]: list } };
      });
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
  }, [user, loadFriends, addToast, getOrCreatePC, cleanupCall, removeCallListeners, markMessagesRead, logCall, loadGroups, loadBlocks, playBeep, ensureLocalStream]);

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
  function handleLogout() {
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
  }

  // --- Ações de Matchmaking ---
  const startRandomMatch = () => {
    if (!user) return;
    handleEndCallIfActive();
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

    const tempMsgId = `temp_${getTs()}`;
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
    setEditingUsername(false);
    setNewUsername('');
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

  const changeUsername = async () => {
    if (!newUsername || !newUsername.trim()) return;
    try {
      const res = await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() })
      });
      const data = await res.json();
      if (data.success) {
        const updated = { ...user, username: data.user.username };
        setUser(updated);
        localStorage.setItem('nexchat_user', JSON.stringify(updated));
        if (profileUser && profileUser.id === user.id) setProfileUser({ ...profileUser, username: data.user.username });
        setEditingUsername(false);
        setNewUsername('');
        addToast('Nome alterado com sucesso!', 'success');
      } else {
        addToast(data.error || 'Erro ao alterar nome', 'error');
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

  // --- Anexos: selecionar/validar/enviar ---
  const handleAttachmentSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    if (!isImage && !isVideo && !isAudio) {
      addToast('Envie apenas imagens, vídeos ou áudios.', 'error');
      return;
    }
    const max = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      addToast(`Arquivo muito grande (máx ${Math.round(max / 1024 / 1024)} MB).`, 'error');
      return;
    }
    setAttachment(file);
    setViewOnce(false);
  };

  const clearAttachment = () => {
    setAttachment(null);
    setViewOnce(false);
  };

  const sendMediaMessage = async () => {
    if (!attachment || sendingMedia) return;
    setSendingMedia(true);
    try {
      const fd = new FormData();
      fd.append('file', attachment);
      fd.append('purpose', 'media');
      fd.append('viewOnce', viewOnce ? 'true' : 'false');
      const up = await authedFetch('/api/upload', { method: 'POST', body: fd });
      const upData = await up.json();
      if (!upData.success) {
        addToast(upData.error || 'Erro no upload.', 'error');
        return;
      }
      const caption = messageText.trim();
      if (selectedGroup) {
        const res = await authedFetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', groupId: selectedGroup.id, content: caption, attachmentId: upData.file.id })
        });
        const data = await res.json();
        if (data.success) {
          socket.emit('send_group_msg', { groupId: selectedGroup.id, message: data.message });
          setMessages(prev => [...prev, data.message]);
          clearAttachment();
          setMessageText('');
        } else {
          addToast(data.error || 'Erro ao enviar mídia no grupo.', 'warning');
        }
      } else if (selectedFriend) {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', receiverId: selectedFriend.friendId, content: caption, attachmentId: upData.file.id })
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => [...prev, data.message]);
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: data.message });
          clearAttachment();
          setMessageText('');
          stopTyping();
        } else {
          addToast(data.error || 'Erro ao enviar mídia.', 'warning');
        }
      }
    } catch (err) {
      console.error(err);
      addToast('Erro ao enviar mídia.', 'error');
    } finally {
      setSendingMedia(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      voiceChunksRef.current = [];
      voiceStartTimeRef.current = getTs();
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start(250);
      voiceMediaRecorderRef.current = mediaRecorder;
      setIsRecordingVoice(true);
      setVoiceDuration(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceDuration(Math.floor((getTs() - voiceStartTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error(err);
      addToast('Não foi possível acessar o microfone.', 'error');
    }
  };

  const stopVoiceRecording = () => {
    return new Promise((resolve) => {
      const recorder = voiceMediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      const finalChunks = voiceChunksRef.current;
      recorder.onstop = () => {
        const mime = recorder.mimeType && recorder.mimeType.includes('/') ? recorder.mimeType.split(';')[0] : 'audio/webm';
        const blob = new Blob(finalChunks, { type: mime });
        // Gravação praticamente vazia: descarta
        if (blob.size < 1000 || Math.floor((getTs() - voiceStartTimeRef.current) / 1000) < 1) {
          resolve(null);
          addToast('Gravação muito curta. Fale por pelo menos 1 segundo.', 'warning');
          return;
        }
        resolve(blob);
      };
      recorder.stop();
      clearInterval(voiceTimerRef.current);
      setIsRecordingVoice(false);
    });
  };

  const cancelVoiceRecording = () => {
    const recorder = voiceMediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {};
      recorder.stop();
    }
    clearInterval(voiceTimerRef.current);
    voiceChunksRef.current = [];
    voiceMediaRecorderRef.current = null;
    setIsRecordingVoice(false);
    setVoiceDuration(0);
  };

  const sendVoiceMessage = async () => {
    const blob = await stopVoiceRecording();
    if (!blob) return;
    setSendingMedia(true);
    try {
      const fd = new FormData();
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `voice_${getTs()}.${ext}`, { type: blob.type });
      fd.append('file', file);
      fd.append('purpose', 'voice');
      const up = await authedFetch('/api/upload', { method: 'POST', body: fd });
      const upData = await up.json();
      if (!upData.success) {
        addToast(upData.error || 'Erro no upload do áudio.', 'error');
        return;
      }
      if (selectedGroup) {
        const res = await authedFetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', groupId: selectedGroup.id, content: '', attachmentId: upData.file.id })
        });
        const data = await res.json();
        if (data.success) {
          socket.emit('send_group_msg', { groupId: selectedGroup.id, message: data.message });
          setMessages(prev => [...prev, data.message]);
        } else {
          addToast(data.error || 'Erro ao enviar áudio.', 'warning');
        }
      } else if (selectedFriend) {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', receiverId: selectedFriend.friendId, content: '', attachmentId: upData.file.id, type: 'voice' })
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => [...prev, data.message]);
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: data.message });
        } else {
          addToast(data.error || 'Erro ao enviar áudio.', 'warning');
        }
      }
    } catch (err) {
      console.error(err);
      addToast('Erro ao enviar áudio.', 'error');
    } finally {
      setSendingMedia(false);
      voiceMediaRecorderRef.current = null;
      setVoiceDuration(0);
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

  const toggleReaction = async (messageId, emoji) => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji })
      });
      const data = await res.json();
      if (data.success) {
        if (data.removed) {
          setReactions(prev => {
            const current = prev[messageId] || {};
            const list = (current[emoji] || []).filter(u => u.id !== user.id);
            if (list.length === 0) {
              const next = { ...current };
              delete next[emoji];
              return { ...prev, [messageId]: next };
            }
            return { ...prev, [messageId]: { ...current, [emoji]: list } };
          });
        } else if (data.reaction) {
          setReactions(prev => {
            const current = prev[messageId] || {};
            const list = current[emoji] || [];
            return {
              ...prev,
              [messageId]: {
                ...current,
                [emoji]: [...list, { id: user.id, username: user.username }]
              }
            };
          });
        }
      }
    } catch (err) {
      console.error(err);
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
    
    const callRoomId = `call_${getTs()}_${user.id}`;
    setCallState('calling');
    setCallType(type);
    setActiveCallRoom(callRoomId);
    setActiveView('chat');

    const onAccepted = async () => {
      removeCallListeners();
      setCallState('connected');
      addToast('Chamada conectada!', 'success');
      if (useMediaRef.current) {
        await ensureLocalStream();
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
        // 'callee': não cria oferta (quem chama é quem oferece) -> evita glare de ofertas cruzadas
        await ensureLocalStream();
        getOrCreatePC(incomingCall.callerId, callRoomId, 'callee', type === 'audio');
      }
    }
  };

  const rejectIncomingCall = () => {
    if (!incomingCall) return;
    socket.emit('reject_friend_call', { callRoomId: incomingCall.callRoomId });
    setIncomingCall(null);
    addToast('Chamada recusada.', 'info');
  };

  const handleEndCall = useCallback(() => {
    const roomId = activeCallRoom;
    const t = callType;
    const duration = callStartedAtRef.current ? Math.max(0, Math.floor((getTs() - callStartedAtRef.current) / 1000)) : 0;
    if (roomId) {
      socket.emit('end_friend_call', { callRoomId: roomId });
    }
    cleanupCall();
    addToast('Chamada encerrada.', 'info');
    logCall(t, duration);
  }, [activeCallRoom, callType, cleanupCall, addToast, logCall]);

  // Se estiver em uma chamada (vídeo ou áudio), encerra antes de trocar de tela
  const handleEndCallIfActive = useCallback(() => {
    if (callStateRef.current === 'calling' || callStateRef.current === 'connected') {
      handleEndCall();
    }
  }, [handleEndCall]);

  // --- Grupos ---
  const selectGroup = async (groupId) => {
    handleEndCallIfActive();
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

  const searchChat = useCallback(async () => {
    if (!chatSearch.trim() || !selectedFriend) return;
    setIsSearching(true);
    try {
      const res = await authedFetch(`/api/messages?friendId=${selectedFriend.friendId}&search=${encodeURIComponent(chatSearch.trim())}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  }, [chatSearch, selectedFriend]);

  const pinMessage = async (messageId) => {
    if (!user || !selectedFriend) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pin', messageId })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt: new Date().toISOString() } : m));
        addToast('Mensagem fixada.', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const unpinMessage = async (messageId) => {
    if (!user || !selectedFriend) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpin', messageId })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt: null } : m));
        addToast('Mensagem desfixada.', 'info');
      }
    } catch (err) {
      console.error(err);
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

  const leaveGroup = async () => {
    if (!selectedGroup) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leave', groupId: selectedGroup.id })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Você saiu do grupo.', 'info');
        setSelectedGroup(null);
        setShowGroupManageModal(false);
        loadGroups();
      } else {
        addToast(data.error || 'Erro ao sair do grupo.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeGroupMember = async (targetUserId) => {
    if (!selectedGroup) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_member', groupId: selectedGroup.id, userId: targetUserId })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Membro removido do grupo.', 'success');
        selectGroup(selectedGroup.id);
      } else {
        addToast(data.error || 'Erro ao remover membro.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const transferGroupAdmin = async (targetUserId) => {
    if (!selectedGroup) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transfer_admin', groupId: selectedGroup.id, userId: targetUserId })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Propriedade do grupo transferida.', 'success');
        selectGroup(selectedGroup.id);
      } else {
        addToast(data.error || 'Erro ao transferir admin.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const savePremiumSettings = async (e, overrideChatTheme, overrideInvisibleMode) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!user) return;
    const ct = overrideChatTheme !== undefined ? overrideChatTheme : chatTheme;
    const im = overrideInvisibleMode !== undefined ? overrideInvisibleMode : invisibleMode;
    try {
      const res = await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatTheme: ct, invisibleMode: im })
      });
      const data = await res.json();
      if (data.success) {
        const updated = { ...user, ...data.user };
        setUser(updated);
        localStorage.setItem('nexchat_user', JSON.stringify(updated));
        setPremiumStatus(prev => ({ ...prev, chatTheme: ct, invisibleMode: im }));
        addToast('Configurações premium salvas!', 'success');
      } else {
        addToast(data.error || 'Erro ao salvar.', 'error');
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

  const [adminStats, setAdminStats] = useState(null);
  const loadAdminStats = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin?action=stats');
      const data = await res.json();
      if (data.success) {
        setAdminStats(data.stats);
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

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
        if (adminUsers !== null) loadAdminUsers(adminUserQuery);
      } else {
        addToast(`Erro: ${data.error}`, 'error');
      }
    } catch (err) {
      addToast('Erro ao contatar o servidor', 'error');
    }
  };

  const loadAdminUsers = useCallback(async (q) => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch(`/api/admin?action=users&q=${encodeURIComponent(q || '')}`);
      const data = await res.json();
      if (data.success) setAdminUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminUserHistory = async (userId) => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch(`/api/admin?action=user_history&userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setAdminHistory(prev => ({ ...prev, [userId]: data.history }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAdminFiles = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin?action=files');
      const data = await res.json();
      if (data.success) setAdminFiles(data.files || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminWarnings = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin?action=warnings');
      const data = await res.json();
      if (data.success) setAdminWarnings(data.warnings || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminLogs = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin?action=admin_logs');
      const data = await res.json();
      if (data.success) setAdminLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  useEffect(() => {
    if (!showAdminPanel) return;
    const timer = setTimeout(() => {
      loadAdminReports();
      loadAdminStats();
      if (adminTab === 'users') loadAdminUsers('');
      if (adminTab === 'files') loadAdminFiles();
      if (adminTab === 'warnings') loadAdminWarnings();
      if (adminTab === 'logs') loadAdminLogs();
    }, 0);
    return () => clearTimeout(timer);
  }, [showAdminPanel, adminTab, loadAdminReports, loadAdminStats, loadAdminUsers, loadAdminFiles, loadAdminWarnings, loadAdminLogs]);

  const handleAdminSetRole = async (targetUserId, role) => {
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', targetUserId, role })
      });
      const data = await res.json();
      addToast(data.success ? `Role alterado para ${role}.` : `Erro: ${data.error}`, data.success ? 'success' : 'error');
      if (data.success && adminUsers !== null) loadAdminUsers(adminUserQuery);
    } catch {
      addToast('Erro ao alterar role', 'error');
    }
  };

  const handleAdminKick = async (targetUserId, username) => {
    if (!confirm(`Desconectar ${username} do app?`)) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kick', targetUserId })
      });
      const data = await res.json();
      addToast(data.success ? 'Usuário desconectado.' : `Erro: ${data.error}`, data.success ? 'success' : 'error');
    } catch {
      addToast('Erro ao desconectar', 'error');
    }
  };

  const handleAdminRemoveWarning = async (warningId, targetUserId) => {
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_warning', targetUserId, warningId })
      });
      const data = await res.json();
      addToast(data.success ? 'Advertência removida.' : `Erro: ${data.error}`, data.success ? 'success' : 'error');
      if (data.success) {
        loadAdminWarnings();
        if (adminUsers !== null) loadAdminUsers(adminUserQuery);
      }
    } catch {
      addToast('Erro ao remover advertência', 'error');
    }
  };

  const handleAdminDeleteFile = async (fileId, ownerId) => {
    if (!confirm('Apagar esta mídia? (o arquivo será removido do storage)')) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_file', fileId, targetUserId: ownerId })
      });
      const data = await res.json();
      addToast(data.success ? 'Mídia removida.' : `Erro: ${data.error}`, data.success ? 'success' : 'error');
    } catch {
      addToast('Erro ao remover mídia', 'error');
    }
  };

  const handleAdminDeleteMessage = async (messageId, table, ownerId) => {
    if (!confirm('Apagar esta mensagem para todos os envolvidos?')) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_message', messageId, table, targetUserId: ownerId })
      });
      const data = await res.json();
      addToast(data.success ? 'Mensagem removida.' : `Erro: ${data.error}`, data.success ? 'success' : 'error');
    } catch {
      addToast('Erro ao remover mensagem', 'error');
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'broadcast', message: broadcastMsg.trim() })
      });
      const data = await res.json();
      addToast(data.success ? 'Anúncio enviado para todos.' : `Erro: ${data.error}`, data.success ? 'success' : 'error');
      if (data.success) setBroadcastMsg('');
    } catch {
      addToast('Erro ao enviar anúncio', 'error');
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
      
      {/* Banner de anúncio global (admin) */}
      {announcement && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: 'linear-gradient(90deg, var(--gold), #e0a800)', color: '#000', padding: '10px 44px 10px 16px', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Megaphone size={16} />
          <span style={{ flex: 1 }}>{announcement.message}</span>
          <span style={{ fontSize: '11px', opacity: 0.7, whiteSpace: 'nowrap' }}>{announcement.adminName}</span>
          <button onClick={() => setAnnouncement(null)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#000', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
      )}

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
            <div style={{ position: 'relative' }}>
              <Avatar url={user.avatarUrl} name={user.username} size={38} border="1px solid var(--gold)" />
              {premiumStatus?.premium && (
                <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--gold)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Crown size={10} color="#000" />
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ fontSize: '15px', color: premiumStatus?.premium ? 'var(--gold)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</h3>
                {premiumStatus?.premium && <Crown size={12} style={{ color: 'var(--gold)' }} />}
              </div>
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
              handleEndCallIfActive();
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
                  handleEndCallIfActive();
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
          {!premiumStatus?.premium && (
            <div style={{ padding: '0 16px', marginBottom: '10px' }}>
              <button onClick={() => setShowPremiumScreen(true)} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px', background: 'linear-gradient(135deg, #EAC847, #D97706)', color: '#000', fontWeight: '700' }}>
                <Crown size={14} /> Premium
              </button>
            </div>
          )}
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
                {(g.myRole === 'owner' || g.myRole === 'admin') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedGroup(g); setShowGroupManageModal(true); }}
                    title="Gerenciar grupo"
                    style={{ color: 'var(--gold)', background: 'none', border: 'none', padding: '4px', display: 'flex' }}
                  >
                    <Settings size={14} />
                  </button>
                )}
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

            {/* Abas */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[
                ['stats', 'Estatísticas'],
                ['reports', 'Denúncias'],
                ['users', 'Usuários'],
                ['files', 'Arquivos'],
                ['warnings', 'Avisos'],
                ['logs', 'Logs']
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAdminTab(key)}
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '12px', minHeight: '32px', background: adminTab === key ? 'var(--gold)' : 'transparent', color: adminTab === key ? '#000' : 'var(--muted)', border: '1px solid ' + (adminTab === key ? 'var(--gold)' : 'var(--line)') }}
                >
                  {label}
                </button>
              ))}
            </div>

            {adminTab === 'stats' && (
              <>
                {/* Anúncio Global */}
                <div className="glass-card" style={{ border: '1px solid var(--line)', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Megaphone size={16} /> Anúncio Global
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      value={broadcastMsg}
                      onChange={e => setBroadcastMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleBroadcast(); }}
                      placeholder="Mensagem para todos os usuários online..."
                      style={{ flex: 1, minWidth: '220px', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                    />
                    <button onClick={handleBroadcast} className="btn-primary" style={{ padding: '6px 16px', fontSize: '13px', minHeight: '38px' }}>
                      Enviar
                    </button>
                  </div>
                </div>

                <div className="glass-card" style={{ border: '1px solid var(--line)', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={16} /> Estatísticas
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.activeUsers ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Online agora</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalUsers ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Usuários</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalMessages ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Msgs privadas</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalGroupMessages ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Msgs em grupo</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalCalls ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Chamadas</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--red)' }}>{adminStats?.totalBans ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Bans ativos</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalFiles ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Arquivos</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalWarnings ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Advertências</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {adminTab === 'reports' && (
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
                              <button onClick={() => handleAdminAction(rep.reportedId, 'warn')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                                Advertir
                              </button>
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
            )}

            {adminTab === 'users' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={16} /> Buscar Usuário
                </h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <input
                    value={adminUserQuery}
                    onChange={e => setAdminUserQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadAdminUsers(adminUserQuery); }}
                    placeholder="Username, customId ou e-mail..."
                    style={{ flex: 1, minWidth: '220px', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                  />
                  <button onClick={() => loadAdminUsers(adminUserQuery)} className="btn-primary" style={{ padding: '6px 16px', fontSize: '13px', minHeight: '38px' }}>
                    Buscar
                  </button>
                </div>

                {adminUsers === null ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Digite algo acima para buscar usuários.</p>
                ) : adminUsers.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Nenhum usuário encontrado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {adminUsers.map(u => (
                      <div key={u.id} style={{ padding: '12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700' }}>
                            {u.username}
                            <span style={{ color: 'var(--muted)', fontWeight: '400', fontSize: '12px' }}> ({u.customId})</span>
                          </div>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: u.role === 'admin' ? 'var(--gold)' : u.role === 'moderator' ? '#4a90d9' : 'var(--bg-3)', color: u.role === 'user' ? 'var(--muted)' : '#000', fontWeight: '600' }}>
                            {u.role}
                          </span>
                          <span style={{ fontSize: '11px', color: u.isOnline ? 'var(--green)' : 'var(--muted)' }}>
                            {u.isOnline ? '● online' : 'offline'}
                          </span>
                          {u.lastSeen && !u.isOnline && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>últ. {new Date(u.lastSeen).toLocaleString()}</span>
                          )}
                          {u.lastIp && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>IP: {u.lastIp}</span>}
                          <span style={{ fontSize: '11px', color: u.warningCount > 0 ? 'var(--amber)' : 'var(--muted)' }}>{u.warningCount} aviso(s)</span>
                          {u.activeBanReason && (
                            <span style={{ fontSize: '11px', color: 'var(--red)' }}>BANIDO: {u.activeBanReason}</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {!u.activeBanReason ? (
                            <>
                              <button onClick={() => handleAdminAction(u.id, 'warn')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                                Advertir
                              </button>
                              <button onClick={() => handleAdminAction(u.id, 'ban', 1)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                                Banir 1D
                              </button>
                              <button onClick={() => handleAdminAction(u.id, 'ban', 0)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                                Banir Perm
                              </button>
                            </>
                          ) : (
                            <button onClick={() => handleAdminAction(u.id, 'unban')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                              Desbanir
                            </button>
                          )}
                          <button onClick={() => handleAdminKick(u.id, u.username)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                            Kick
                          </button>
                          <select
                            value={u.role}
                            onChange={e => handleAdminSetRole(u.id, e.target.value)}
                            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: '11px' }}
                          >
                            <option value="user">user</option>
                            <option value="moderator">moderator</option>
                            <option value="admin">admin</option>
                          </select>
                          <button
                            onClick={() => {
                              if (adminHistory[u.id]) {
                                setAdminHistory(prev => {
                                  const n = { ...prev };
                                  delete n[u.id];
                                  return n;
                                });
                              } else {
                                loadAdminUserHistory(u.id);
                              }
                            }}
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <History size={12} /> {adminHistory[u.id] ? 'Ocultar histórico' : 'Histórico'}
                          </button>
                        </div>

                        {adminHistory[u.id] && (
                          <div style={{ marginTop: '12px', background: 'var(--bg-2)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <strong style={{ fontSize: '12px' }}>Mensagens privadas:</strong>
                              {adminHistory[u.id].directMsgs.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Nenhuma.</p>
                              ) : adminHistory[u.id].directMsgs.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--muted)' }}>{m.type}: </span>{m.content || '(mídia)'} <span style={{ color: 'var(--muted)' }}>— {new Date(m.createdAt).toLocaleString()}</span>
                                  </span>
                                  <button onClick={() => handleAdminDeleteMessage(m.id, 'direct', u.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: '11px', padding: '2px' }}>
                                    Apagar
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12px' }}>Mensagens em grupo:</strong>
                              {adminHistory[u.id].groupMsgs.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Nenhuma.</p>
                              ) : adminHistory[u.id].groupMsgs.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--muted)' }}>[{m.groupName}] </span>{m.content || '(mídia)'} <span style={{ color: 'var(--muted)' }}>— {new Date(m.createdAt).toLocaleString()}</span>
                                  </span>
                                  <button onClick={() => handleAdminDeleteMessage(m.id, 'group', u.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: '11px', padding: '2px' }}>
                                    Apagar
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12px' }}>Arquivos enviados:</strong>
                              {adminHistory[u.id].files.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Nenhum.</p>
                              ) : adminHistory[u.id].files.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.filename} <span style={{ color: 'var(--muted)' }}>({formatFileSize(f.size)}){f.viewOnce ? ' [view-once]' : ''}</span>
                                  </span>
                                  <button onClick={() => handleAdminDeleteFile(f.id, u.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: '11px', padding: '2px' }}>
                                    Apagar
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12px' }}>Denúncias contra:</strong>
                              {adminHistory[u.id].reports.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Nenhuma.</p>
                              ) : adminHistory[u.id].reports.map(r => (
                                <div key={r.id} style={{ fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ color: 'var(--muted)' }}>{r.reporterName}: </span>{r.reason} <span style={{ color: 'var(--muted)' }}>({r.status})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {adminTab === 'files' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} /> Mídias Recentes <span style={{ fontSize: '11px', color: 'var(--green)' }}>● ao vivo</span>
                </h3>
                {adminFiles === null || adminFiles.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Nenhuma mídia.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {adminFiles.map(f => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                        {f.mime?.startsWith('image/') ? (
                          <img src={`/api/files/${f.id}`} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FileText size={18} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {f.ownerName} • {formatFileSize(f.size)} • {new Date(f.createdAt).toLocaleString()}
                            {f.viewOnce ? ' • [view-once]' : ''}
                          </div>
                        </div>
                        <button onClick={() => handleAdminDeleteFile(f.id, f.ownerId)} style={{ color: 'var(--red)', background: 'none', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}>
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {adminTab === 'warnings' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Advertências</h3>
                {adminWarnings === null || adminWarnings.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Nenhuma advertência registrada.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {adminWarnings.map(w => (
                      <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                        <ShieldAlert size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600' }}>{w.userName} <span style={{ color: 'var(--muted)', fontWeight: '400', fontSize: '11px' }}>({w.customId})</span></div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{w.reason} — {new Date(w.createdAt).toLocaleString()} por {w.issuedByName || 'sistema'}</div>
                        </div>
                        <button onClick={() => handleAdminRemoveWarning(w.id, w.userId)} style={{ color: 'var(--red)', background: 'none', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}>
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {adminTab === 'logs' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Log de Ações dos Admins</h3>
                {adminLogs === null || adminLogs.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Nenhuma ação registrada ainda.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {adminLogs.map(l => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--gold)', fontWeight: '600' }}>{l.action}</span>
                        <span>por <strong>{l.adminName || 'desconhecido'}</strong></span>
                        {l.targetName && <span>→ <strong>{l.targetName}</strong></span>}
                        <span style={{ color: 'var(--muted)' }}>{new Date(l.createdAt).toLocaleString()}</span>
                        {l.details && <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{typeof l.details === 'string' ? l.details : JSON.stringify(l.details)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                      handleEndCallIfActive();
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
                  <>
                    <button className="btn-primary" onClick={() => setShowAddMemberModal(true)} title="Adicionar participante" style={{ padding: isMobile ? '6px 10px' : '8px 12px', minHeight: isMobile ? '32px' : '36px', fontSize: isMobile ? '11px' : '12px' }}>
                      <UserPlus size={isMobile ? 13 : 15} /> {isMobile ? '' : 'Adicionar'}
                    </button>
                    <button onClick={() => setShowGroupManageModal(true)} title="Gerenciar grupo" style={{ color: 'var(--text)', background: 'var(--bg-3)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                      <Settings size={14} />
                    </button>
                  </>
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
                <button onClick={handleEndCall} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px', border: 'none', minHeight: isMobile ? '32px' : '36px' }}>
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
                    <button onClick={handleEndCall} style={{ padding: '6px 10px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px', border: 'none' }}>
                      Sair
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Histórico de Mensagens */}
            {selectedFriend && !selectedGroup && !inRandomChat && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <input
                  type="text"
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchChat(); }}
                  placeholder="Buscar no chat..."
                  style={{ flex: 1, fontSize: '12px', padding: '8px 10px', minHeight: '36px' }}
                />
                <button type="button" onClick={searchChat} className="btn-primary" style={{ padding: '8px 12px', minHeight: '36px', fontSize: '11px' }}>
                  Buscar
                </button>
                {chatSearch && (
                  <button type="button" onClick={() => { setChatSearch(''); setSearchResults([]); }} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '4px' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            {searchResults.length > 0 && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--gold)', background: 'var(--bg-3)', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', color: 'var(--gold)' }}>{searchResults.length} resultado(s) para &ldquo;{chatSearch}&rdquo;</span>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(chatSearch ? searchResults : messages).map((msg) => {
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
                        padding: msg.attachmentId ? '6px 6px 8px 6px' : '8px 12px', 
                        borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        position: 'relative'
                      }}>
                        {msg.attachmentId && <MediaPreview msg={msg} />}
                        {msg.content && (
                          <p style={{ fontSize: '13px', lineHeight: '1.4', wordBreak: 'break-word', padding: msg.attachmentId ? '2px 6px 0' : 0 }}>
                            {msg.content}
                            {msg.editedAt && (
                              <span style={{ fontSize: '9px', color: 'var(--muted)', fontStyle: 'italic', marginLeft: '6px' }}>editada</span>
                            )}
                          </p>
                        )}
                        
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

                         {reactions[msg.id] && Object.keys(reactions[msg.id]).length > 0 && (
                           <div style={{ 
                             position: 'absolute', 
                             bottom: '-22px', 
                             right: '8px', 
                             background: 'var(--bg-2)', 
                             border: '1px solid var(--line)', 
                             borderRadius: '10px', 
                             padding: '2px 6px', 
                             display: 'flex', 
                             alignItems: 'center', 
                             gap: '4px',
                             flexWrap: 'wrap',
                             maxWidth: '180px'
                           }}>
                             {Object.entries(reactions[msg.id]).map(([emoji, users]) => (
                               <button
                                 key={emoji}
                                 onClick={() => toggleReaction(msg.id, emoji)}
                                 style={{ 
                                   background: users.some(u => u.id === user.id) ? 'var(--gold-soft)' : 'transparent',
                                   border: '1px solid var(--line)',
                                   borderRadius: '8px',
                                   padding: '1px 4px',
                                   fontSize: '10px',
                                   cursor: 'pointer',
                                   display: 'flex',
                                   alignItems: 'center',
                                   gap: '2px'
                                 }}
                               >
                                 <span>{emoji}</span>
                                 <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{users.length}</span>
                               </button>
                             ))}
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
                      <button onClick={() => setReactionPicker(reactionPicker?.messageId === msg.id ? null : { messageId: msg.id })} style={{ color: 'var(--muted)', border: 'none', background: 'none' }}>
                        <Smile size={11} />
                      </button>
                      {msg.pinnedAt ? (
                        <button onClick={() => unpinMessage(msg.id)} style={{ color: 'var(--gold)', border: 'none', background: 'none', fontWeight: '700' }}>📌 Fixada</button>
                      ) : (
                        <button onClick={() => pinMessage(msg.id)} style={{ color: 'var(--muted)', border: 'none', background: 'none' }}>📌</button>
                      )}
                      {isMe && selectedFriend && !inRandomChat && msg.type !== 'call' && (
                        <button onClick={() => startEditMessage(msg)} style={{ color: 'var(--gold)', border: 'none', background: 'none' }}>Editar</button>
                      )}
                      {isMe && selectedFriend && !inRandomChat && (
                        <button onClick={() => handleDeleteMessage(msg.id)} style={{ color: 'var(--red)', border: 'none', background: 'none' }}>Apagar</button>
                      )}

                      {reactionPicker?.messageId === msg.id && (
                        <div style={{ position: 'absolute', bottom: '24px', right: '0', background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '10px', padding: '6px', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px', zIndex: 30, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                          {EMOJIS.slice(0, 32).map((em, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { toggleReaction(msg.id, em); setReactionPicker(null); }}
                              style={{ fontSize: '14px', padding: '3px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={(e) => { e.preventDefault(); if (isRecordingVoice) { sendVoiceMessage(); } else if (attachment) { sendMediaMessage(); } else if (selectedGroup) { sendGroupMessage(e); } else { handleSendMessage(e); } }} style={{ padding: isMobile ? '8px' : '12px', background: 'var(--bg-2)', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
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

              {attachment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-3)', border: '1px solid var(--gold)', padding: '6px 12px', borderRadius: '8px' }}>
                  {attachment.type.startsWith('image/') ? <Eye size={14} style={{ color: 'var(--gold)' }} /> : attachment.type.startsWith('video/') ? <Video size={14} style={{ color: 'var(--gold)' }} /> : <FileText size={14} style={{ color: 'var(--gold)' }} />}
                  <span style={{ fontSize: '12px', color: 'var(--text)' }}>{attachment.type.startsWith('video/') ? 'Vídeo' : attachment.type.startsWith('audio/') ? 'Áudio' : 'Foto'}</span>
                  <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{formatFileSize(attachment.size)}</span>
                  {selectedFriend && !selectedGroup && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: viewOnce ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={viewOnce} onChange={e => setViewOnce(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                      Visualização única
                    </label>
                  )}
                  {viewOnce && <span style={{ fontSize: '9px', color: 'var(--amber)', fontWeight: '700' }}>some após visto</span>}
                  <button type="button" onClick={clearAttachment} style={{ color: 'var(--red)', background: 'none', border: 'none', padding: '4px' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="file" ref={fileInputRef} accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={handleAttachmentSelect} />
                <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Enviar foto/vídeo/áudio" style={{ color: attachment ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                  <Paperclip size={16} />
                </button>
                {isRecordingVoice ? (
                  <button type="button" onClick={cancelVoiceRecording} title="Cancelar gravação" style={{ color: 'var(--red)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px', animation: 'pulse 1s infinite' }}>
                    <MicOff size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={startVoiceRecording} title="Mensagem de voz" style={{ color: 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                    <Mic size={16} />
                  </button>
                )}
                <button type="button" onClick={() => setShowEmojiPicker(v => !v)} title="Emojis" style={{ color: showEmojiPicker ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                  <Smile size={16} />
                </button>
                <input 
                  type="text" 
                  placeholder={isRecordingVoice ? `Gravando... ${voiceDuration}s` : attachment ? 'Legenda (opcional)...' : "Escreva..."} 
                  value={messageText}
                  onChange={e => { setMessageText(e.target.value); if (!selectedGroup) handleTypingChange(); }}
                  onBlur={() => { if (!selectedGroup) stopTyping(); }}
                  disabled={isRecordingVoice}
                  style={{ flex: 1, padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px', fontSize: '14px', opacity: isRecordingVoice ? 0.6 : 1 }}
                />
                {isRecordingVoice ? (
                  <button type="button" onClick={sendVoiceMessage} className="btn-primary" disabled={sendingMedia} style={{ padding: isMobile ? '8px 12px' : '10px 14px', minHeight: isMobile ? '36px' : '40px' }}>
                    <Send size={14} />
                  </button>
                ) : (
                  <button type="submit" className="btn-primary" disabled={sendingMedia} style={{ padding: isMobile ? '8px 12px' : '10px 14px', minHeight: isMobile ? '36px' : '40px', opacity: sendingMedia ? 0.6 : 1 }}>
                    {sendingMedia ? <Clock size={14} /> : attachment ? <Send size={14} /> : <Send size={14} />}
                  </button>
                )}
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
                      <>
                        {premiumStatus?.premium && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px', textAlign: 'left', padding: '12px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <Crown size={12} style={{ color: 'var(--gold)' }} />
                              <span style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: '600' }}>PREMIUM</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Modo invisível</span>
                              <button onClick={() => { const next = !invisibleMode; setInvisibleMode(next); savePremiumSettings({ preventDefault: () => {} }, chatTheme, next); }} style={{ background: invisibleMode ? 'var(--gold)' : 'var(--line)', border: 'none', borderRadius: '20px', width: '44px', height: '24px', position: 'relative', cursor: 'pointer', padding: 0 }}>
                                <div style={{ position: 'absolute', top: '2px', left: invisibleMode ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                              </button>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Tema do chat</label>
                              <select value={chatTheme} onChange={e => { const val = e.target.value; setChatTheme(val); savePremiumSettings({ preventDefault: () => {} }, val, invisibleMode); applyTheme(val); }} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--bg)', border: '1px solid var(--line)', color: '#fff', borderRadius: '6px' }}>
                                {Object.entries(THEMES).map(([key, t]) => (
                                  <option key={key} value={key}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                                <Crown size={10} style={{ color: 'var(--gold)' }} /> Nome de usuário
                              </label>
                              {editingUsername ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} maxLength={30} style={{ flex: 1, fontSize: '12px', padding: '8px' }} autoFocus />
                                  <button onClick={changeUsername} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px', minHeight: '32px' }}>Salvar</button>
                                  <button onClick={() => setEditingUsername(false)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', minHeight: '32px' }}>Cancelar</button>
                                </div>
                              ) : (
                                <button onClick={() => { setNewUsername(user.username); setEditingUsername(true); }} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--gold-soft)', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: '6px', cursor: 'pointer' }}>
                                  Alterar nome
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <button className="btn-secondary" onClick={openEditProfile} style={{ width: '100%', justifyContent: 'center', minHeight: '40px' }}>
                          <Settings size={14} /> Editar perfil
                        </button>
                        <button onClick={pushEnabled ? disablePush : requestPushPermission} disabled={pushLoading} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '40px', marginTop: '8px', background: pushEnabled ? 'var(--green-soft, rgba(74,222,128,0.1))' : 'var(--bg-3)', border: pushEnabled ? '1px solid var(--green)' : '1px solid var(--line)', color: pushEnabled ? 'var(--green)' : 'var(--text)' }}>
                          {pushLoading ? '...' : pushEnabled ? <><Bell size={14} /> Notificações ativadas</> : <><Bell size={14} /> Ativar notificações</>}
                        </button>
                      </>
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

      {/* 4.3 MODAL GERENCIAR GRUPO */}
      {showGroupManageModal && selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>Gerenciar Grupo</h3>
              <button onClick={() => setShowGroupManageModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', marginBottom: '14px' }}>
              {(selectedGroup.members || []).map(m => {
                const isOwner = m.role === 'owner';
                const isMe = m.userId === user.id;
                return (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--gold)', flexShrink: 0 }}>
                      {m.username[0].toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px' }}>{m.username} {isOwner && <span style={{ fontSize: '10px', color: 'var(--gold)' }}>(Dono)</span>}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{m.customId}</div>
                    </div>
                    {!isMe && !isOwner && (
                      <button onClick={() => { removeGroupMember(m.userId); }} style={{ color: 'var(--red)', background: 'none', border: 'none', padding: '4px', fontSize: '11px' }}>
                        <Trash size={13} />
                      </button>
                    )}
                    {!isMe && !isOwner && user.role === 'owner' && (
                      <button onClick={() => { transferGroupAdmin(m.userId); }} style={{ color: 'var(--gold)', background: 'none', border: 'none', padding: '4px', fontSize: '11px' }}>
                        <ShieldAlert size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={leaveGroup} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '40px', background: 'var(--red)', color: '#fff', border: 'none' }}>
              <LogOut size={14} /> Sair do Grupo
            </button>
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

      {/* Tela Premium */}
      {showPremiumScreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '460px', width: '100%', border: '1px solid var(--gold)', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--gold-soft)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Crown size={32} style={{ color: 'var(--gold)' }} />
            </div>
            <h2 style={{ fontSize: '22px', color: 'var(--gold)', marginBottom: '8px' }}>NexChat Premium</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px', lineHeight: '1.5' }}>
              Desbloqueie recursos exclusivos e aproveite sem limites.
            </p>

            {premiumStatus?.premium ? (
              <div style={{ background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)' }}>Plano Ativo</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>Expira em: {premiumStatus.premiumExpiresAt ? new Date(premiumStatus.premiumExpiresAt).toLocaleString('pt-BR') : '-'}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>Modo invisível</span>
                    <button onClick={() => { const next = !invisibleMode; setInvisibleMode(next); savePremiumSettings({ preventDefault: () => {} }, chatTheme, next); }} style={{ background: invisibleMode ? 'var(--gold)' : 'var(--line)', border: 'none', borderRadius: '20px', width: '44px', height: '24px', position: 'relative', cursor: 'pointer', padding: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: invisibleMode ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Tema do chat</label>
                    <select value={chatTheme} onChange={e => { const val = e.target.value; setChatTheme(val); savePremiumSettings({ preventDefault: () => {} }, val, invisibleMode); applyTheme(val); }} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--bg)', border: '1px solid var(--line)', color: '#fff', borderRadius: '6px' }}>
                      {Object.entries(THEMES).map(([key, t]) => (
                        <option key={key} value={key}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                   <span style={{ fontSize: '22px', fontWeight: '700', color: '#fff' }}>R$ {formatPremiumPrice()}</span>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>/mês</span>
                </div>
                <ul style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.7', paddingLeft: '18px', margin: 0 }}>
                  <li>Upload até 50 MB</li>
                  <li>Grupos ilimitados + até 100 membros</li>
                  <li>Mensagens de até 5000 caracteres</li>
                  <li>Até 50 mensagens fixadas</li>
                  <li>Prioridade no matchmaking</li>
                  <li>Chamadas em grupo com até 8 pessoas</li>
                  <li>Mudar nome a qualquer momento</li>
                  <li>Modo invisível + temas personalizados</li>
                  <li>Exportar histórico do chat</li>
                </ul>
                <button onClick={async () => {
                  setBuying(true);
                  try {
                    const res = await authedFetch('/api/premium/checkout', { method: 'POST' });
                    const data = await res.json();
                    if (data.success && data.approveUrl) {
                      window.location.href = data.approveUrl;
                    } else {
                      addToast(data.error || 'Erro ao iniciar pagamento', 'error');
                      setBuying(false);
                    }
                  } catch (e) {
                    addToast('Erro ao conectar', 'error');
                    setBuying(false);
                  }
                }} disabled={buying} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '16px', minHeight: '44px', background: 'var(--gold)', color: '#000', fontWeight: '700' }}>
                  {buying ? 'Redirecionando...' : 'Assinar Premium'}
                </button>
              </div>
            )}

            <button onClick={() => setShowPremiumScreen(false)} className="btn-secondary" style={{ minHeight: '40px' }}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Cookie Consent Banner */}
      {!cookieConsent && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1500, background: 'var(--bg-2)', borderTop: '1px solid var(--line)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>
            Utilizamos cookies para melhorar sua experiência. Ao continuar, você concorda com nossa política de privacidade.
          </span>
          <button onClick={acceptCookies} className="btn-primary" style={{ whiteSpace: 'nowrap', minHeight: '36px', fontSize: '12px', padding: '8px 16px' }}>
            Aceitar
          </button>
        </div>
      )}

    </div>
  );
}
