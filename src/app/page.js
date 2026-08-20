"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { rt } from '@/lib/realtime-client';
import { 
  Video, Phone, UserPlus, Send, Heart, Smile, Shield, Flag, X, 
  MessageSquare, MapPin, User, Users, Check, Trash, ShieldAlert,
  Moon, CheckSquare, Settings, AlertCircle, VolumeX, Mic, MicOff, VideoOff, Play,
  Pause,
  Plus, CheckCircle, Clock, Info, ChevronLeft, SkipForward, CheckCheck, FileText, Paperclip, Eye,
  BarChart3, Megaphone, Search, History, Crown, ToggleLeft, Palette, Bell, ShieldCheck, UserCheck,
  Timer, Languages, Sticker, Headset, Gift, Zap, Flame, Globe, Pin, Bot
} from 'lucide-react';
import { getPlansForLocale } from '@/lib/premium-config';
import { STICKERS, getSticker } from '@/lib/stickers';
import { COUNTRIES, getCountryName } from '@/lib/countries';
import { useLanguage } from '@/components/LanguageProvider';
import { translations } from '@/lib/i18n';
import { APP_VERSION } from '@/lib/version';
import ScrollHint from '@/components/ScrollHint';
import GiftPanel from '@/components/GiftPanel';

let socket;

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

let recaptchaLoadPromise = null;

function ensureRecaptchaLoaded() {
  if (!RECAPTCHA_SITE_KEY || typeof window === 'undefined') return Promise.resolve(null);
  if (recaptchaLoadPromise) return recaptchaLoadPromise;
  recaptchaLoadPromise = new Promise((resolve) => {
    if (window.grecaptcha && typeof window.grecaptcha.execute === 'function') {
      return resolve();
    }
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    s.async = true;
    s.onload = () => {
      if (window.grecaptcha && typeof window.grecaptcha.ready === 'function') {
        window.grecaptcha.ready(resolve);
      } else {
        resolve();
      }
    };
    s.onerror = () => {
      recaptchaLoadPromise = null;
      resolve();
    };
    document.head.appendChild(s);
  });
  return recaptchaLoadPromise;
}

async function getRecaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY || typeof window === 'undefined') return null;
  await ensureRecaptchaLoaded();
  try {
    if (!window.grecaptcha || typeof window.grecaptcha.execute !== 'function') return null;
    const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch (e) {
    console.error('reCAPTCHA execute error:', e);
    return null;
  }
}

const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤔','😅','😭','😡','🥺','😴','🤯','👍','👎','👏','🙏','💪','🔥','❤️','💔','✨','🎉','🎂','👀','💯','✅','❌','⚠️','🚀','🐱','🐶','🍕','⚽','🎮','🌹','☕','😂','😉','🤝','😇','🥳','😬','🙄','😜','🤗','😷'];

function formatDuration(secs) {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `(${m}:${String(s).padStart(2, '0')})`;
}

function ExpiryBadge({ expiresAt, onExpired }) {
  const [left, setLeft] = useState(Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    let iv;
    const tick = () => {
      const rem = Math.max(0, new Date(expiresAt) - Date.now());
      setLeft(rem);
      if (rem <= 0) {
        clearInterval(iv);
        onExpired && onExpired();
      }
    };
    iv = setInterval(tick, 1000);
    const t0 = setTimeout(tick, 0);
    return () => { clearInterval(iv); clearTimeout(t0); };
  }, [expiresAt, onExpired]);
  if (left <= 0) return null;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return (
    <span style={{ fontSize: '9px', color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>
      <Timer size={10} /> {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getDayLabel(iso, lang = 'pt') {
  const date = new Date(iso);
  const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  const tr = translations[lang] || translations.en;
  if (diffDays === 0) return tr.msgToday;
  if (diffDays === 1) return tr.msgYesterday;
  return date.toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'it' ? 'it-IT' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      '--gold': '#EAC847',
      '--amber': '#D97706',
      '--gold-soft': 'rgba(234, 200, 71, 0.12)',
      '--gold-glow': 'rgba(234, 200, 71, 0.35)',
      '--gold-grad': 'linear-gradient(135deg, #F5DE7A 0%, #EAC847 45%, #D97706 100%)',
      '--shadow-gold': '0 8px 30px rgba(234, 200, 71, 0.25)'
    }
  },
  midnight: {
    name: 'Meia-noite',
    vars: {
      '--gold': '#818CF8',
      '--amber': '#6366F1',
      '--gold-soft': 'rgba(129, 140, 248, 0.12)',
      '--gold-glow': 'rgba(129, 140, 248, 0.35)',
      '--gold-grad': 'linear-gradient(135deg, #A5B4FC 0%, #818CF8 45%, #4F46E5 100%)',
      '--shadow-gold': '0 8px 30px rgba(129, 140, 248, 0.25)'
    }
  },
  forest: {
    name: 'Floresta',
    vars: {
      '--gold': '#4ADE80',
      '--amber': '#16A34A',
      '--gold-soft': 'rgba(74, 222, 128, 0.12)',
      '--gold-glow': 'rgba(74, 222, 128, 0.35)',
      '--gold-grad': 'linear-gradient(135deg, #86EFAC 0%, #4ADE80 45%, #15803D 100%)',
      '--shadow-gold': '0 8px 30px rgba(74, 222, 128, 0.25)'
    }
  },
  rose: {
    name: 'Rosa',
    vars: {
      '--gold': '#FB7185',
      '--amber': '#E11D48',
      '--gold-soft': 'rgba(251, 113, 133, 0.12)',
      '--gold-glow': 'rgba(251, 113, 133, 0.35)',
      '--gold-grad': 'linear-gradient(135deg, #FDA4AF 0%, #FB7185 45%, #BE123C 100%)',
      '--shadow-gold': '0 8px 30px rgba(251, 113, 133, 0.25)'
    }
  },
  ocean: {
    name: 'Oceano',
    vars: {
      '--gold': '#22D3EE',
      '--amber': '#0891B2',
      '--gold-soft': 'rgba(34, 211, 238, 0.12)',
      '--gold-glow': 'rgba(34, 211, 238, 0.35)',
      '--gold-grad': 'linear-gradient(135deg, #67E8F9 0%, #22D3EE 45%, #0E7490 100%)',
      '--shadow-gold': '0 8px 30px rgba(34, 211, 238, 0.25)'
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

function MediaPreview({ msg }) {
  const { lang } = useLanguage();
  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;
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

  useEffect(() => {
    if (!viewOnce || !opened) return;
    const t = setInterval(() => setRemaining(prev => (prev === null ? prev : Math.max(0, prev - 1))), 1000);
    return () => clearInterval(t);
  }, [viewOnce, opened]);

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

  if (viewOnce && !opened) {
    const label = isVideo ? t('video') : isAudio ? t('audio') : t('photo');
    const Icon = isVideo ? Video : isAudio ? Mic : Eye;
    return (
      <button
        onClick={() => { setOpened(true); setRemaining(15); if (msg.senderId) socket.emit('view_once_viewed', { messageId: msg.id, senderId: msg.senderId }); }}
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
        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>{t('viewPrefix')} {label}</span>
        <span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--gold)', background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>
          {t('viewOnceBadge')}
        </span>
      </button>
    );
  }

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
      
      preview = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px', ...protect }} onContextMenu={(e) => e.preventDefault()}>
          <button
            onClick={toggleAudio}
            title={playing ? t('pauseBtn') : t('listen')}
            style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            {playing ? <Pause size={16} color="#111" /> : <Play size={16} color="#111" />}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>{t('audioLabel')}</span>
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
        <span>{t('fileLabel')}</span>
        <span style={{ color: 'var(--muted)', fontSize: '10px' }}>{formatFileSize(msg.attach?.size || msg.attachSize)}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', marginBottom: msg.content ? '6px' : 0 }}>
      {preview}
      {viewOnce && (
        <span style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.75)', color: 'var(--gold)', fontSize: '9px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>
          {opened ? t('expiresInSecs').replace('{s}', remaining ?? 15) : t('viewOnceBadge')}
        </span>
      )}
    </div>
  );
}

function Avatar({ url, name, size = 36, fontSize, border = '1px solid var(--line)', bg = 'var(--bg-3)', color, premium }) {
  const [broken, setBroken] = useState(false);
  const finalBorder = premium ? `2px solid var(--gold)` : border;
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: finalBorder, flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: finalBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontSize || Math.round(size * 0.4), fontWeight: 'bold', color: color || 'var(--gold)', flexShrink: 0 }}>
      {name ? name[0].toUpperCase() : '?'}
    </div>
  );
}

function isPremiumActive(user) {
  if (!user) return false;
  if (user.premiumTier !== 'premium' || !user.premiumExpiresAt) return false;
  try {
    return new Date(user.premiumExpiresAt) > new Date();
  } catch {
    return false;
  }
}

function PremiumBadge({ user, size = 12 }) {
  if (!isPremiumActive(user)) return null;
  return <Crown size={size} fill="var(--gold)" style={{ color: 'var(--gold)', flexShrink: 0 }} title="Premium" />;
}

function VerifiedBadge({ user, size = 12 }) {
  if (!user || !user.verified) return null;
  return <ShieldCheck size={size} fill="#3B82F6" style={{ color: '#3B82F6', flexShrink: 0 }} title="Verified" />;
}

function UserBadges({ user, size = 12 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
      <PremiumBadge user={user} size={size} />
      <VerifiedBadge user={user} size={size} />
    </span>
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

const USER_STORE_KEY = 'nexchat_user';
const USER_STORE_PREFIX = 'enc:v1:';
const USER_STORE_XOR_KEY = 'Nx9$Lm2#Qp7!Zv4@Rt8^';

function xorObfuscate(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ USER_STORE_XOR_KEY.charCodeAt(i % USER_STORE_XOR_KEY.length));
  }
  return typeof btoa !== 'undefined' ? btoa(out) : out;
}

function xorDeobfuscate(b64) {
  const raw = typeof atob !== 'undefined' ? atob(b64) : b64;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    out += String.fromCharCode(raw.charCodeAt(i) ^ USER_STORE_XOR_KEY.charCodeAt(i % USER_STORE_XOR_KEY.length));
  }
  return out;
}

function saveUserLocal(user) {
  try {
    const json = JSON.stringify(user);
    localStorage.setItem(USER_STORE_KEY, USER_STORE_PREFIX + xorObfuscate(json));
  } catch (e) {}
}

function loadUserLocal() {
  try {
    const raw = localStorage.getItem(USER_STORE_KEY);
    if (!raw) return null;
    const plain = raw.startsWith(USER_STORE_PREFIX)
      ? xorDeobfuscate(raw.slice(USER_STORE_PREFIX.length))
      : raw; 
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

function LogOutIcon({ size = 18, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function Home() {
  
  const [consentGranted, setConsentGranted] = useState(false);
  const [useMedia, setUseMedia] = useState(false);
  const [user, setUser] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [activeView, setActiveView] = useState('sidebar'); 
  const [mobilePanelOpen, setMobilePanelOpen] = useState(null); 

  const { lang, setLang, setLanguageFromCountry } = useLanguage();
  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;
  const [detectedCountry, setDetectedCountry] = useState(null);
  const loginScrollRef = useRef(null);

const [loginUsername, setLoginUsername] = useState('');
const [loginPassword, setLoginPassword] = useState('');
const [loginTwoFactor, setLoginTwoFactor] = useState(false);
const [loginTwoFactorMask, setLoginTwoFactorMask] = useState('');
const [loginTwoFactorCode, setLoginTwoFactorCode] = useState('');
const [loginTwoFactorError, setLoginTwoFactorError] = useState('');
  const [loginTwoFactorLoading, setLoginTwoFactorLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginGender, setLoginGender] = useState('male');
  const [loginCountry, setLoginCountry] = useState('BR');
  const [loginMode, setLoginMode] = useState('guest'); 
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);

  const [toasts, setToasts] = useState([]);

  const detectCountryFromIP = async () => {
    try {
      const res = await fetch('/api/geolocation');
      const data = (await res.json().catch(() => ({})));
      if (data.country) {
        setDetectedCountry(data.country);
        setLoginCountry(data.country);
        
        const savedLang = typeof window !== 'undefined' ? localStorage.getItem('nexchat_lang') : null;
        if (!savedLang) {
          setLanguageFromCountry(data.country);
        }
      }
    } catch (e) {
      console.error('Failed to detect country:', e);
    }
  };

  useEffect(() => {
    detectCountryFromIP();
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = getTs() + Math.random().toString(36).substr(2, 5);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const query = new URLSearchParams(window.location.search);
      const loginSuccess = query.get('login') === 'success';
      const authErrorParam = query.get('auth_error');
      const refCode = query.get('ref');

      if (refCode) {
        localStorage.setItem('nexchat_invite_code', refCode);
      }

      if (loginSuccess) {
        try {
          const res = await authedFetch('/api/users?id=self');
          const data = (await res.json().catch(() => ({})));
        if (data.success) {
          const parsedUser = data.user;
          setUser(prev => ({ ...(prev || {}), ...parsedUser }));
          markLegalConsentDone();
          saveUserLocal({ ...(loadUserLocal() || {}), ...parsedUser });
            addToast(`${t('welcome')}, ${parsedUser.username}!`, 'success');
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
        const savedUser = loadUserLocal();
        if (savedUser) {
          try {
            const parsed = JSON.parse(JSON.stringify(savedUser));
            setUser(parsed);
          } catch (e) {
            localStorage.removeItem('nexchat_user');
          }
        }
      }

      const giftStatus = query.get('gift');
      if (giftStatus) {
        const giftMsgs = {
          sent: t('giftSentToast'),
          scheduled: t('giftScheduledToast'),
          failed: t('giftFailedToast'),
          cancelled: t('giftCancelledToast'),
        };
        if (giftMsgs[giftStatus]) {
          addToast(giftMsgs[giftStatus], giftStatus === 'failed' ? 'error' : 'success');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [addToast]);

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await authedFetch('/api/auth/me');
        if (stopped) return;
        if (res.status === 401) {
          
          try {
            const retry = await authedFetch('/api/auth/me');
            if (retry.ok) {
              const rd = (await retry.json().catch(() => ({})));
              if (rd?.user) {
                setUser(prev => {
                  const merged = { ...(prev || {}), ...rd.user };
                  try { saveUserLocal(merged); } catch (e) {}
                  return merged;
                });
                return;
              }
            }
          } catch {}
          
          fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
          localStorage.removeItem('nexchat_user');
          localStorage.removeItem('nexchat_token');
          setUser(null);
          addToast(t('sessionInvalid'), 'error');
          return;
        }
        if (res.ok) {
          const data = (await res.json().catch(() => ({})));
          if (data?.user) {
            
            setUser(prev => {
              const merged = { ...(prev || {}), ...data.user };
              try { saveUserLocal(merged); } catch (e) {}
              return merged;
            });
          }
        }
      } catch {
        
      }
    };
    check();
    const iv = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, addToast, t]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    
    ensureRecaptchaLoaded().catch(() => {});
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(() => {});
    
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    if (user) {
      style.textContent = '.grecaptcha-badge { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
    } else {
      style.textContent = '.grecaptcha-badge { visibility: visible !important; opacity: 1 !important; }';
    }
    document.head.appendChild(style);
    return () => style.remove();
  }, [user]);

  const [friendsList, setFriendsList] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  
  const [addFriendId, setAddFriendId] = useState('');
  const [addFriendError, setAddFriendError] = useState('');
  const [addFriendSuccess, setAddFriendSuccess] = useState('');

  const [inQueue, setInQueue] = useState(false);
  const [inRandomChat, setInRandomChat] = useState(false);
  const [randomRoomId, setRandomRoomId] = useState(null);
  const [randomPartner, setRandomPartner] = useState(null);
  const [randomFriendRequestStatus, setRandomFriendRequestStatus] = useState('none'); 
  
  const [matchGender, setMatchGender] = useState('any'); 
  const [matchCountry, setMatchCountry] = useState('any');
  const [matchMinLevel, setMatchMinLevel] = useState(1);
  const [matchMaxLevel, setMatchMaxLevel] = useState(100);
  const [matchMode, setMatchMode] = useState('text'); 
  const [queueStatusText, setQueueStatusText] = useState('');
  
  const [matchConnecting, setMatchConnecting] = useState(false);

  const [levelStats, setLevelStats] = useState(null); 
  const [captchaPeer, setCaptchaPeer] = useState(null); 
  const [captchaChecking, setCaptchaChecking] = useState(false);

  const myLevel = levelStats?.level ?? (user?.level || 1);

  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); 

  const [activeCallRoom, setActiveCallRoom] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null); 
  const [callState, setCallState] = useState('idle'); 
  const [callType, setCallType] = useState('video'); 

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [reports, setReports] = useState([]);
  const [adminStatusMsg, setAdminStatusMsg] = useState('');
  const [adminTab, setAdminTab] = useState('stats');
  const [adminContacts, setAdminContacts] = useState(null);
  const [adminUsers, setAdminUsers] = useState(null);
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [adminHistory, setAdminHistory] = useState({});
  const [adminFiles, setAdminFiles] = useState(null);
  const [adminWarnings, setAdminWarnings] = useState(null);
  const [adminLogs, setAdminLogs] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [announcement, setAnnouncement] = useState(null);

  const [premiumStatus, setPremiumStatus] = useState(null);
  const [showPremiumScreen, setShowPremiumScreen] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [chatTheme, setChatTheme] = useState('default');
  const [invisibleMode, setInvisibleMode] = useState(false);
  const [buying, setBuying] = useState(false);
  const [premiumPlan, setPremiumPlan] = useState('monthly');
  const [pendingPremiumCheck, setPendingPremiumCheck] = useState(false);

  const [inviteData, setInviteData] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCreated, setInviteCreated] = useState(false);

  const [expiresIn, setExpiresIn] = useState(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [msgTranslations, setMsgTranslations] = useState({});
  const [autoTranslate, setAutoTranslate] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('nexchat_autotranslate') === '1';
    } catch (e) { return false; }
  });
  const autoTranslateRef = useRef(false);
  const translateMessageRef = useRef(null);
  const markGroupMessagesReadRef = useRef(null);

  useEffect(() => {
    autoTranslateRef.current = autoTranslate;
  }, [autoTranslate]);

  const [cookieConsent, setCookieConsent] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
    try {
      const cs = document.cookie;
      if (cs.split(';').some(c => c.trim().startsWith('nexchat_consent=accepted'))) setConsentGranted(true);
      if (cs.split(';').some(c => c.trim().startsWith('nexchat_cookie_consent=accepted'))) setCookieConsent(true);
    } catch (e) {
      console.warn('Não foi possível ler consentimentos:', e);
    }
  }, []);

  const acceptCookies = () => {
    setCookieConsent(true);
    try {
      document.cookie = 'nexchat_cookie_consent=accepted; path=/; SameSite=Lax';
    } catch (e) {
      console.warn('Erro ao salvar consentimento:', e);
    }
  };

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const requestPushPermission = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      addToast(t('notificationsNotSupported'), 'error');
      return;
    }
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        addToast(t('notificationDenied'), 'error');
        setPushLoading(false);
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        addToast(t('errorActivatingNotifications'), 'error');
        setPushLoading(false);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
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
        addToast(t('notificationsActivated'), 'success');
      } else {
        addToast(t('errorActivatingNotifications'), 'error');
      }
    } catch (err) {
      console.error('Erro ao solicitar notificação:', err);
      addToast(t('errorActivatingNotifications'), 'error');
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
        addToast(t('notificationsDeactivated'), 'info');
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

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Comportamento impróprio');
  const [reportDetails, setReportDetails] = useState('');

  const [onlineUsers, setOnlineUsers] = useState({}); 
  const [localUnread, setLocalUnread] = useState({}); 
  const [profileUser, setProfileUser] = useState(null);
  const [profileViews, setProfileViews] = useState(null);
  const [profileViewsLoading, setProfileViewsLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [typingStatus, setTypingStatus] = useState({ friendId: null, isTyping: false });
  const typingTimeoutRef = useRef(null);
  const typingEmittedRef = useRef(false);

  const [groupsList, setGroupsList] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupLoadError, setGroupLoadError] = useState(null); 
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showGroupManageModal, setShowGroupManageModal] = useState(false);
  const [showAddToCallModal, setShowAddToCallModal] = useState(false);

  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState('');

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [chatSearch, setChatSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (!isSearching) return;
    const load = async () => {
      try {
        const res = await authedFetch('/api/realtime/presence-count');
        const data = (await res.json().catch(() => ({})));
        if (typeof data.online === 'number') setOnlineCount(data.online);
      } catch {}
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, [isSearching]);

  const [reactions, setReactions] = useState({}); 
  const [reactionPicker, setReactionPicker] = useState(null); 

  const [attachment, setAttachment] = useState(null); 
  const [viewOnce, setViewOnce] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const fileInputRef = useRef(null);

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const voiceMediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceTimerRef = useRef(null);
  const voiceStartTimeRef = useRef(null);
  const voiceMeterRef = useRef(null);
  const voiceMeterCtxRef = useRef(null);
  const voiceSilenceWarnedRef = useRef(false);
  const inQueueRef = useRef(false);
  const onMatchFoundRef = useRef(null);
  const matchPollRef = useRef(null);
  const matchConnectingRef = useRef(false);

  const callStartedAtRef = useRef(null);
  const [callElapsed, setCallElapsed] = useState(0);

  const [blockedIds, setBlockedIds] = useState({});

  const [editProfileMode, setEditProfileMode] = useState(false);

  const [secPanel, setSecPanel] = useState(null); 
  const [secCode, setSecCode] = useState('');
  const [secEmail, setSecEmail] = useState('');
  const [secCurPw, setSecCurPw] = useState('');
  const [secNewPw, setSecNewPw] = useState('');
  const [secMsg, setSecMsg] = useState(null); 
  const [secBusy, setSecBusy] = useState(false);
  const [secCooldown, setSecCooldown] = useState(0);
  useEffect(() => {
    if (secCooldown <= 0) return;
    const id = setTimeout(() => setSecCooldown(secCooldown - 1), 1000);
    return () => clearTimeout(id);
  }, [secCooldown]);
  const [editBio, setEditBio] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoElsRef = useRef({}); 
  const remoteAudioElsRef = useRef({}); 
  const messagesEndRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef({}); 

  const pcsRef = useRef({});

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
  const [remoteStreams, setRemoteStreams] = useState({}); 

  const loadPremiumStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/premium/status');
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setPremiumStatus(data);
        const isPrem = !!(data.premium && data.user);
        if (!isPrem) {
          setChatTheme('default');
          applyTheme('default');
          setInvisibleMode(false);
          setAutoTranslate(false);
          setExpiresIn(null);
          localStorage.setItem('nexchat_theme', 'default');
          localStorage.setItem('nexchat_autotranslate', '0');
          setUser(prev => {
            if (!prev) return prev;
            const merged = { ...prev };
            let changed = false;
            const resetFields = ['premiumTier', 'premiumExpiresAt', 'verified', 'chatTheme', 'invisibleMode'];
            const resetValues = { premiumTier: null, premiumExpiresAt: null, verified: false, chatTheme: 'default', invisibleMode: false };
            for (const k of resetFields) {
              if (merged[k] !== resetValues[k]) {
                merged[k] = resetValues[k];
                changed = true;
              }
            }
            if (changed) {
              saveUserLocal(merged);
              return merged;
            }
            return prev;
          });
        } else {
          const themeToApply = data.user?.chatTheme || 'default';
          setChatTheme(themeToApply);
          applyTheme(themeToApply);
          setInvisibleMode(data.user?.invisibleMode || false);
          if (data.user) {
            setUser(prev => {
              if (!prev) return prev;
              const merged = { ...prev };
              let changed = false;
              for (const k of ['premiumTier', 'premiumExpiresAt', 'verified', 'chatTheme', 'invisibleMode']) {
                if (data.user[k] !== undefined && data.user[k] !== prev[k]) {
                  merged[k] = data.user[k];
                  changed = true;
                }
              }
              if (changed) {
                saveUserLocal(merged);
                return merged;
              }
              return prev;
            });
          }
        }
      }
    } catch (e) {
      console.error('[Premium] status error:', e);
    }
  }, [user]);

  const loadPremiumStatusRef = useRef(loadPremiumStatus);
  loadPremiumStatusRef.current = loadPremiumStatus;

  useEffect(() => {
    if (user) {
      loadPremiumStatusRef.current();
    }
  }, [user]);

  const loadInviteStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/invite');
      const data = (await res.json().catch(() => ({})));
      if (res.ok) {
        setInviteData(data);
      }
    } catch (e) {
      console.error('Invite status error:', e);
    }
  }, [user]);

  const createInvite = useCallback(async () => {
    if (!user || inviteCreated) return;
    setInviteLoading(true);
    try {
      const res = await authedFetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' })
      });
      const data = (await res.json().catch(() => ({})));
      if (res.ok && data.success) {
        setInviteData(prev => ({ ...prev, invite: data.invite }));
        setInviteCreated(true);
      } else {
        addToast(data.error || 'Error creating invite', 'error');
      }
    } catch (e) {
      addToast('Connection error', 'error');
    } finally {
      setInviteLoading(false);
    }
  }, [user, inviteCreated]);

  useEffect(() => {
    if (user) {
      loadInviteStatus();
    }
  }, [user, loadInviteStatus]);

  const matchModeRef = useRef(matchMode);
  const useMediaRef = useRef(useMedia);
  const randomRoomIdRef = useRef(randomRoomId);
  const activeCallRoomRef = useRef(activeCallRoom);
  const selectedFriendRef = useRef(selectedFriend);
  const selectedGroupRef = useRef(selectedGroup);
  const callStateRef = useRef(callState);
  const callTypeRef = useRef(callType);
  const inRandomChatRef = useRef(inRandomChat);
  const randomPartnerRef = useRef(null);
  const callListenersRef = useRef([]);
  const userRef = useRef(null);
  const iceRestartedRef = useRef({});
  const callTimeoutRef = useRef(null);

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
    randomPartnerRef.current = randomPartner;
  });
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, inQueue]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(e => console.log('Autoplay local stream error:', e));
    }
  }, [inRandomChat, callState, matchMode, useMedia, activeCallRoom, activeView]);

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

  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/friends');
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setFriendsList(data.friends || []);
        setPendingReceived(data.pendingReceived || []);
        setPendingSent(data.pendingSent || []);
      }
    } catch (err) {
      console.error('Erro ao buscar amigos:', err);
    }
  }, [user]);

  const markMessagesRead = useCallback(async (friendId) => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', senderId: friendId })
      });
      const data = (await res.json().catch(() => ({})));
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

  const openProfile = useCallback(async (target) => {
    setProfileLoading(true);
    setProfileError('');
    setProfileUser(null);
    setProfileViews(null);
    try {
      const q = target.customId ? `customId=${encodeURIComponent(target.customId)}` : `id=${target.friendId}`;
      const res = await authedFetch(`/api/users?${q}`);
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setProfileUser(data.user);
        if (user && data.user.id === user.id) {
          setProfileViewsLoading(true);
          authedFetch('/api/users?views=1')
            .then(r => r.json().catch(() => ({})))
            .then(d => {
              if (d.success) setProfileViews({ premiumRequired: !!d.premiumRequired, viewers: d.viewers || [] });
            })
            .catch(() => setProfileViews({ premiumRequired: false, viewers: [] }))
            .finally(() => setProfileViewsLoading(false));
        }
      } else {
        setProfileError(data.error || t('errorLoadingProfile'));
      }
    } catch (err) {
      console.error(err);
      setProfileError(t('errorLoadingProfile'));
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const playBeep = useCallback(() => {
    playNotificationSound();
  }, [playNotificationSound]);

  useEffect(() => {
    const total =
      Object.values(localUnread).reduce((a, b) => a + b, 0) +
      friendsList.reduce((a, f) => a + (f.unreadCount || 0), 0) +
      groupsList.reduce((a, g) => a + (g.unreadCount || 0), 0);
    document.title = total > 0 ? `(${total}) NexChat` : 'NexChat';
  }, [localUnread, friendsList, groupsList]);

  useEffect(() => {
    if (callState !== 'connected') return;
    callStartedAtRef.current = getTs();
    const iv = setInterval(() => {
      setCallElapsed(Math.floor((getTs() - callStartedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [callState]);

  const loadBlocks = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/blocks');
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setBlockedIds(Object.fromEntries(data.blocked.map(b => [b.id, true])));
      }
    } catch (err) {
      console.error('Erro ao buscar bloqueios:', err);
    }
  }, [user]);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/groups');
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setGroupsList(data.groups || []);
      }
    } catch (err) {
      console.error('Erro ao buscar grupos:', err);
    }
  }, [user]);

  const logCall = useCallback(async (callType, duration = 0) => {
    const friend = selectedFriendRef.current;
    const partner = randomPartnerRef.current;
    const receiverId = inRandomChatRef.current ? partner?.userId : friend?.friendId;
    if (!receiverId || !user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'call_log', receiverId, callType, durationSeconds: duration })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success && data.message) {
        if (!inRandomChatRef.current) {
          setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
          const sortedIds = [user.id, receiverId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket?.emit('friend_call_logged', { roomId: chatRoomId, message: data.message });
        }
      }
      if (data.stats) setLevelStats(data.stats);
    } catch (err) {
      console.error('Erro ao registrar chamada:', err);
    }
  }, [user]);

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
      addToast(t('userNotInFriends'), 'error');
    }
  };

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
      
      const results = {};
      for (const mid of messageIds) {
        const r = await authedFetch(`/api/reactions?messageId=${mid}`);
        const d = (await r.json().catch(() => ({})));
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
        const data = (await res.json().catch(() => ({})));
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
        addToast(t('errorCameraMic'), 'error');
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

  const cleanupCall = useCallback(() => {
    removeCallListeners();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    iceRestartedRef.current = {};
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    setRemoteStreams({});
    setCallState('idle');
    setActiveCallRoom(null);
    setCallElapsed(0);
  }, [removeCallListeners]);

  const getOrCreatePC = useCallback((peerId, roomId, role, isAudioOnly = false) => {
    if (!peerId) return null;
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];

    const pc = new RTCPeerConnection(rtcConfig);
    pcsRef.current[peerId] = pc;

    if (localStreamRef.current) {
      const tracks = isAudioOnly
        ? localStreamRef.current.getAudioTracks()
        : localStreamRef.current.getTracks();
      tracks.forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else if (useMediaRef.current) {
      
      ensureLocalStream().then(stream => {
        if (!stream || !pcsRef.current[peerId]) return;
        const tracks = isAudioOnly ? stream.getAudioTracks() : stream.getTracks();
        tracks.forEach(track => {
          try { pcsRef.current[peerId].addTrack(track, stream); } catch {  }
        });
        
        const myPc = pcsRef.current[peerId];
        myPc.onnegotiationneeded = () => {
          if (myPc.signalingState === 'stable') {
            myPc.createOffer().then(o => myPc.setLocalDescription(o)).then(() => {
              socket.emit('webrtc_offer', { roomId, from: userRef.current?.id, to: peerId, offer: myPc.localDescription });
            }).catch(() => {});
          }
        };
        try { myPc.onnegotiationneeded(); } catch {  }
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
      if (pc.iceConnectionState === 'failed' && !iceRestartedRef.current[peerId]) {
        
        iceRestartedRef.current[peerId] = true;
        try { pc.restartIce(); } catch {}
        addToast(t('callReconnecting'), 'warning');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && iceRestartedRef.current[peerId]) {
        
        cleanupPeer(peerId);
        if (callStateRef.current === 'connected') {
          addToast(t('callConnectionLost'), 'error');
          if (activeCallRoomRef.current) {
            socket.emit('end_friend_call', { callRoomId: activeCallRoomRef.current });
          }
          cleanupCall();
        }
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
  }, [cleanupPeer, ensureLocalStream, cleanupCall, addToast]);

  useEffect(() => {
    if (!user) return;
    authedFetch('/api/levels').then((r) => r.json()).then((d) => {
      if (d.success && d.stats) setLevelStats(d.stats);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;

    socket = rt; rt.init(user.id); 

    socket.on('connect', () => {
      console.log('Connected ao WebSocket Render');
      socket.emit('identify', { userId: user.id });
    });

    socket.on('identify_error', ({ error }) => {
      addToast(error || 'Invalid session. Please log in again.', 'error');
      localStorage.removeItem('nexchat_user');
      localStorage.removeItem('nexchat_token');
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      setUser(null);
      socket.disconnect();
    });

    socket.on('queue_waiting', () => {
      setQueueStatusText('Looking for someone compatible with your filters...');
    });

    socket.on('captcha_required', ({ peerId }) => {
      setCaptchaPeer(peerId || randomPartnerRef.current?.userId || null);
    });

    const enterRandomRoom = async (data) => {
      const { roomId, role, partner } = data || {};
      if (!roomId) return;
      if (inRandomChatRef.current) return; 
      matchConnectingRef.current = false;
      setMatchConnecting(false);
      inQueueRef.current = false;
      setInQueue(false);
      setInRandomChat(true);
      setRandomRoomId(roomId);
      setRandomPartner(partner);
      setRandomFriendRequestStatus('none');
      if (matchModeRef.current === 'text') {
        setMessages([{
          id: `sys_${getTs()}`,
          type: 'system',
          content: (partner && partner.bio) || '',
          partnerName: partner && partner.username,
          partnerCountry: partner && partner.country,
          createdAt: new Date().toISOString()
        }]);
      } else {
        setMessages([]);
      }
      setReplyingTo(null);
      setActiveView('chat');
      addToast(t('connectedWithPartner').replace('${country}', (partner && partner.country) || ''), 'success');

      if (matchModeRef.current === 'video' && useMediaRef.current) {
        setQueueStatusText(t('startingVideoStream'));
        await ensureLocalStream();
        getOrCreatePC(partner && partner.userId, roomId, role, false);
      }
    };

    const onMatchFound = (data) => {
      
      if (!inQueueRef.current) return;
      const { roomId } = data || {};
      if (!roomId) return;
      
      inQueueRef.current = false;
      matchConnectingRef.current = true;
      setMatchConnecting(true);
      setQueueStatusText(t('connectingPartners'));
      socket.emit('ready_for_room', { roomId }).catch(() => {});
    };
    socket.on('match_found', onMatchFound);
    socket.on('enter_room', enterRandomRoom);
    onMatchFoundRef.current = onMatchFound;

    matchPollRef.current = setInterval(() => {
      if (!inQueueRef.current || matchConnectingRef.current) return;
      socket.emit('queue_status').then((res) => {
        if (res && res.status === 'matched' && res.roomId) {
          
          if (matchConnectingRef.current) {
            enterRandomRoom({ roomId: res.roomId, role: res.role, partner: res.partner });
          } else {
            onMatchFound({ roomId: res.roomId, role: res.role, partner: res.partner });
          }
        }
      }).catch(() => {});
    }, 6000);

    socket.on('peer_left', () => {
      
      matchConnectingRef.current = false;
      setMatchConnecting(false);
      setInRandomChat(false);
      setRandomRoomId(null);
      setRandomPartner(null);
      setRandomFriendRequestStatus('none');
      cleanupCall();
      addToast(t('partnerDisconnected'), 'warning');
      setInQueue(false);
    });

    socket.on('gift_received', ({ giverName, plan }) => {
      const planLabel = plan === 'yearly' ? t('giftYearly') : t('giftMonthly');
      addToast(`${giverName} ${t('giftReceivedToast').replace('{plan}', planLabel)}`, 'success');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexchat_gift_refresh'));
    });

    socket.on('receive_random_msg', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('receive_random_msg_like', (data) => {
      const { messageId, likedByUserId } = data;
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const current = m.likedBy || [];
          const alreadyLiked = current.includes(likedByUserId);
          return {
            ...m,
            likedBy: alreadyLiked 
              ? current.filter(id => id !== likedByUserId)
              : [...current, likedByUserId]
          };
        }
        return m;
      }));
    });

    socket.on('receive_group_msg_like', (data) => {
      const { messageId, likedByUserId } = data;
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const current = m.likedBy || [];
          const alreadyLiked = current.includes(likedByUserId);
          return {
            ...m,
            likedBy: alreadyLiked
              ? current.filter(id => id !== likedByUserId)
              : [...current, likedByUserId]
          };
        }
        return m;
      }));
    });

    socket.on('group_msg_pinned', (data) => {
      const { messageId, pinnedAt } = data;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt } : m));
    });

    socket.on('group_msg_unpinned', (data) => {
      const { messageId } = data;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt: null } : m));
    });

    socket.on('receive_random_friend_request', () => {
      setRandomFriendRequestStatus('received');
      addToast(t('friendRequestReceived'), 'info');
      loadFriends();
    });

    socket.on('receive_random_friend_accepted', () => {
      setRandomFriendRequestStatus('accepted');
      addToast(t('friendshipEstablished'), 'success');
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
        
        const buffered = pendingIceRef.current[from] || [];
        delete pendingIceRef.current[from];
        for (const c of buffered) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {  }
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
          
          const buffered = pendingIceRef.current[from] || [];
          delete pendingIceRef.current[from];
          for (const c of buffered) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {  }
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

    socket.on('participant_joined', async ({ userId }) => {
      if (userId !== user.id && activeCallRoomRef.current) {
        await ensureLocalStream();
        getOrCreatePC(userId, activeCallRoomRef.current, 'receiver', callTypeRef.current === 'audio');
      }
    });

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
        if (autoTranslateRef.current && msg.senderId === activeFriend.friendId && msg.content && msg.type !== 'sticker') {
          translateMessageRef.current?.(msg);
        }
        if (msg.senderId === activeFriend.friendId) {
          markMessagesRead(activeFriend.friendId);
        }
      } else {
        addToast(t('newFriendMessage'), 'info');
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
        if (autoTranslateRef.current && msg.senderId !== user.id && msg.content && msg.type !== 'sticker') {
          translateMessageRef.current?.(msg);
        }
        markGroupMessagesReadRef.current?.(msg.groupId);
      } else {
        addToast(t('newGroupMessage'), 'info');
        playBeep();
        setGroupsList(prev => prev.map(g => g.id === msg.groupId ? { ...g, unreadCount: (g.unreadCount || 0) + 1 } : g));
        loadGroups();
      }
    });

    socket.on('group_msg_read_by', ({ userId, username, messageIds, readAt }) => {
      setMessages(prev => prev.map(m => {
        if (!messageIds.includes(m.id)) return m;
        const already = (m.readBy || []).some(r => r.userId === userId);
        if (already) return m;
        return { ...m, readBy: [...(m.readBy || []), { userId, username: username || userId, readAt }] };
      }));
    });

    socket.on('friend_msg_expired', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      addToast(t('tempMessageExpired'), 'info');
    });

    socket.on('group_msg_expired', ({ messageIds }) => {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;
      setMessages(prev => prev.filter(m => !messageIds.includes(m.id)));
      addToast(t('groupTempMessageExpired'), 'info');
    });

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
          const current = m.likedBy || [];
          const alreadyLiked = current.includes(likedByUserId);
          return {
            ...m,
            likedBy: alreadyLiked 
              ? current.filter(id => id !== likedByUserId)
              : [...current, likedByUserId]
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
      addToast(t('callEndedByFriend'), 'warning');
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
      clearInterval(matchPollRef.current);
      matchPollRef.current = null;
      removeCallListeners();
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user, loadFriends, addToast, getOrCreatePC, cleanupCall, removeCallListeners, markMessagesRead, logCall, loadGroups, loadBlocks, playBeep, ensureLocalStream]);

  const legalConsentDone = () => typeof window !== 'undefined' && localStorage.getItem('nexchat_consent_v1') === '1';
  const markLegalConsentDone = () => { try { localStorage.setItem('nexchat_consent_v1', '1'); } catch (e) {} };

  const requireConsentCheck = () => {
    if (!legalConsentDone()) {
      setAuthError(t('legalConsentRequired'));
      addToast(t('legalConsentRequired'), 'error');
      setLoading(false);
      return false;
    }
    if (!confirmedAge || !acceptedTerms) {
      setAuthError(t('legalConsentRequired'));
      addToast(t('legalConsentRequired'), 'error');
      setLoading(false);
      return false;
    }
    return true;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setLoginTwoFactor(false);
    setLoginTwoFactorCode('');
    setLoginTwoFactorError('');
    
    if (!requireConsentCheck()) return;
    
    if (!legalConsentDone() && (!confirmedAge || !acceptedTerms)) {
      setAuthError(t('legalConsentRequired'));
      addToast(t('legalConsentRequired'), 'error');
      setLoading(false);
      return;
    }
    try {
      const inviteCode = typeof window !== 'undefined' ? localStorage.getItem('nexchat_invite_code') : null;
      const recaptchaToken = loginMode === 'guest' ? await getRecaptchaToken('register').catch(() => null) : null;
      const payload = {
        action: loginMode,
        username: loginUsername.trim(),
        password: loginMode === 'guest' ? loginPassword : undefined,
        email: loginMode === 'google' ? loginEmail.trim() : null,
        gender: loginGender,
        country: loginCountry,
        inviteCode: inviteCode || undefined,
        recaptchaToken: recaptchaToken || undefined,
        acceptedTerms,
        confirmedAge,
        lang
      };

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => ({})));
      
      if (data.success) {
        setUser(data.user);
        markLegalConsentDone();
        saveUserLocal(data.user);
        if (data.token) {
          localStorage.setItem('nexchat_token', data.token);
        }
        if (inviteCode) {
          localStorage.removeItem('nexchat_invite_code');
        }
        if (data.user?.country) {
          
          const savedLang = typeof window !== 'undefined' ? localStorage.getItem('nexchat_lang') : null;
          if (!savedLang) {
            setLanguageFromCountry(data.user.country);
          }
        }
        addToast(`${t('welcome')}, ${data.user.username}!`, 'success');
      } else if (data.twoFactorRequired) {
        
        setLoginTwoFactor(true);
        setLoginTwoFactorMask(data.emailMask || '');
        setLoginTwoFactorCode('');
        setLoginTwoFactorError('');
      } else {
        const errMsg = data.errorKey && t(data.errorKey) !== data.errorKey ? t(data.errorKey) : (data.error || t('authError'));
        setAuthError(errMsg);
        addToast(errMsg, 'error');
      }
    } catch (err) {
      setAuthError(t('authServerError'));
      addToast(t('authServerError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginTwoFactor = async () => {
    if (!loginTwoFactorCode.trim()) {
      setLoginTwoFactorError(t('loginTwoFactorEmpty'));
      return;
    }
    setLoginTwoFactorLoading(true);
    setLoginTwoFactorError('');
    try {
      const res = await fetch('/api/auth/2fa/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, code: loginTwoFactorCode, lang })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setUser(data.user);
        saveUserLocal(data.user);
        if (data.token) localStorage.setItem('nexchat_token', data.token);
        if (data.user?.country) {
          const savedLang = typeof window !== 'undefined' ? localStorage.getItem('nexchat_lang') : null;
          if (!savedLang) setLanguageFromCountry(data.user.country);
        }
        setLoginTwoFactor(false);
        setLoginTwoFactorCode('');
        setLoginTwoFactorError('');
        addToast(`${t('welcome')}, ${data.user.username}!`, 'success');
      } else {
        const errMsg = data.errorKey && t(data.errorKey) !== data.errorKey ? t(data.errorKey) : (data.error || t('authError'));
        setLoginTwoFactorError(errMsg);
      }
    } catch (err) {
      setLoginTwoFactorError(t('authServerError'));
    } finally {
      setLoginTwoFactorLoading(false);
    }
  };

  const cancelLoginTwoFactor = () => {
    setLoginTwoFactor(false);
    setLoginTwoFactorCode('');
    setLoginTwoFactorError('');
  };

  const handleGoogleAuthRedirect = async () => {
    if (!legalConsentDone() && (!confirmedAge || !acceptedTerms)) {
      setAuthError(t('legalConsentRequired'));
      addToast(t('legalConsentRequired'), 'error');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/auth/google/url');
      const data = (await res.json().catch(() => ({})));
      
      if (data.success && data.url) {
        
        window.location.href = data.url;
      } else {
        addToast(data.error || t('errorGoogleUrl'), 'error');
      }
    } catch (err) {
      addToast(t('googleAuthError'), 'error');
    } finally {
      setLoading(false);
    }
  };

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
    addToast(t('sessionClosed'), 'info');
  }

  const startRandomMatch = async () => {
    if (!user) return;
    handleEndCallIfActive();
    setSelectedFriend(null);

    let mode = matchMode;
    if (mode === 'video' && myLevel < 5) {
      addToast(t('videoLocked'), 'error');
      setMatchMode('text');
      mode = 'text';
    }
    if (mode === 'video' && !localStreamRef.current) {
      setQueueStatusText(t('requestingCameraPermission'));
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setUseMedia(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(e => console.log(e));
        }
      } catch (err) {
        console.warn('Permissão de mídia recusada:', err.message);
        addToast(t('cameraPermissionDenied'), 'error');
        setUseMedia(false);
        setMatchMode('text');
        mode = 'text';
      }
    }

    setInQueue(true);
    inQueueRef.current = true;
    matchConnectingRef.current = false;
    setMatchConnecting(false);
    setQueueStatusText(t('enteringMatchmaking'));

    socket.emit('join_queue', {
      userId: user.id,
      username: user.username,
      gender: user.gender,
      country: user.country,
      prefGender: matchGender,
      prefCountry: matchCountry,
      prefMinLevel: matchMinLevel,
      prefMaxLevel: matchMaxLevel,
      mode
    }).then((res) => {
      if (res && res.error) {
        inQueueRef.current = false;
        setInQueue(false);
        if (res.errorKey === 'videoLocked') addToast(t('videoLocked'), 'error');
        else addToast(res.error || t('errorGeneric'), 'error');
      } else if (res && res.status === 'matched' && res.roomId) {
        
        if (onMatchFoundRef.current) {
          onMatchFoundRef.current({ roomId: res.roomId, role: res.role, partner: res.partner });
        }
      }
    }).catch(() => {});
    setActiveView('chat'); 
  };

  const recoverStreak = async () => {
    try {
      const res = await authedFetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success && data.stats) {
        setLevelStats(data.stats);
        addToast(t('streakRecovered'), 'success');
      } else {
        addToast(data.error || t('streakRecoverFail'), 'error');
      }
    } catch {
      addToast(t('streakRecoverFail'), 'error');
    }
  };

  const verifyCaptcha = async () => {
    if (!captchaPeer) return;
    setCaptchaChecking(true);
    try {
      const token = await getRecaptchaToken('chat');
      const res = await authedFetch('/api/captcha/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, peerId: captchaPeer }),
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setCaptchaPeer(null);
        if (data.stats) setLevelStats(data.stats);
        addToast(t('captchaPassed'), 'success');
      } else {
        addToast(data.error || t('captchaFailed'), 'error');
      }
    } catch {
      addToast(t('captchaFailed'), 'error');
    }
    setCaptchaChecking(false);
  };

  const cancelRandomMatch = () => {
    if (socket) {
      socket.emit('leave_queue');
    }
    inQueueRef.current = false;
    setInQueue(false);
    matchConnectingRef.current = false;
    setMatchConnecting(false);
    addToast(t('searchCancelled'), 'info');
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
    startRandomMatch();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const content = messageText.trim();
    setMessageText('');

    const isPremiumUser = !!premiumStatus?.premium;
    const maxLen = inRandomChat ? 5000 : (selectedGroup ? 5000 : (isPremiumUser ? 5000 : 1000));
    if (content.length > maxLen) {
      setMessageText(content);
      addToast(t('messageTooLong').replace('{limit}', String(maxLen)), 'error');
      return;
    }

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

    if (inRandomChat && randomRoomId) {
      setMessages(prev => [...prev, payload]);
      socket.emit('send_random_msg', { roomId: randomRoomId, message: payload });
    }
    
    else if (selectedFriend) {
      try {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send',
            receiverId: selectedFriend.friendId,
            content,
            parentMessageId: payload.parentMessageId,
            expiresInSeconds: expiresIn || undefined
          })
        });
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          const savedMsg = data.message;
          setMessages(prev => [...prev, savedMsg]);
          if (data.stats) setLevelStats(data.stats);

          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: savedMsg });
          stopTyping();
        } else if (data.errorKey === 'msgCaptchaRequired') {
          setMessageText(content);
          setCaptchaPeer(selectedFriend.friendId);
        } else {
          setMessageText(content);
          addToast(data.error || t('errorSendingMessage'), 'error');
        }
      } catch (err) {
        setMessageText(content);
        console.error('Erro ao enviar mensagem privada:', err);
      }
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!user || !selectedFriend) return;
    const msg = messages.find(m => m.id === msgId);
    if (msg && msg.type === 'call') {
      if (!confirm(t('confirmDeleteCallRecord'))) return;
    } else if (!confirm(t('confirmDeleteMessageAll'))) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', messageId: msgId })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        const sortedIds = [user.id, selectedFriend.friendId].sort();
        const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
        socket.emit('delete_friend_msg', { roomId: chatRoomId, messageId: msgId, friendId: selectedFriend.friendId });
      } else {
        addToast(data.error || t('errorDeletingMessage'), 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

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
      const data = (await res.json().catch(() => ({})));
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
        if (selectedFriend) {
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('edit_friend_msg', { roomId: chatRoomId, message: data.message, friendId: selectedFriend.friendId });
        }
        cancelEditMessage();
      } else {
        addToast(data.error || t('errorEditingMessage'), 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBlock = async (target) => {
    if (!user || !target) return;
    const isBlocked = !!blockedIds[target.id];
    try {
      const res = await authedFetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isBlocked ? 'unblock' : 'block', targetId: target.id })
      });
      const data = (await res.json().catch(() => ({})));
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
        addToast(data.error || t('errBlockUser'), 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditProfile = () => {
    setEditBio(user.bio || '');
    setEditStatus(user.status || '');
    setEditCountry(user.country || '');
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
        body: JSON.stringify({ bio: editBio, status: editStatus, country: editCountry })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const updated = { ...user, bio: data.user.bio, status: data.user.status, country: data.user.country };
        setUser(updated);
        saveUserLocal(updated);
        if (profileUser && profileUser.id === user.id) setProfileUser({ ...profileUser, bio: data.user.bio, status: data.user.status, country: data.user.country });
        setEditProfileMode(false);
        addToast(t('profileUpdated'), 'success');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const updated = { ...user, username: data.user.username };
        setUser(updated);
        saveUserLocal(updated);
        if (profileUser && profileUser.id === user.id) setProfileUser({ ...profileUser, username: data.user.username });
        setEditingUsername(false);
        setNewUsername('');
        addToast(t('nameChanged'), 'success');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const res2 = await authedFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: data.file.url })
        });
        const d2 = (await res2.json().catch(() => ({})));
        if (d2.success) {
          const updated = { ...user, avatarUrl: data.file.url };
          setUser(updated);
          saveUserLocal(updated);
          if (profileUser && profileUser.id === user.id) setProfileUser({ ...profileUser, avatarUrl: data.file.url });
          addToast(t('avatarUpdated'), 'success');
        }
      } else {
        addToast(data.error || 'Erro ao enviar avatar', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openSecPanel = (panel) => { setSecPanel(panel); setSecCode(''); setSecMsg(null); setSecBusy(false); };
  const closeSecPanel = () => { setSecPanel(null); setSecCode(''); setSecMsg(null); };

  const secErrText = (data) => {
    const tr = data?.errorKey ? t(data.errorKey) : '';
    const base = (data?.errorKey && tr && tr !== data.errorKey) ? tr : (data?.error || 'Erro');
    return data?.detail ? `${base} [${data.detail}]` : base;
  };

  const sendSecCode = async (purpose) => {
    setSecBusy(true); setSecMsg(null);
    try {
      const res = await authedFetch('/api/auth/code/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose, lang })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.ok) { setSecMsg({ type: 'success', text: t('secCodeSent').replace('{email}', user?.email || '') }); setSecCooldown(60); }
      else setSecMsg({ type: 'error', text: secErrText(data) });
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const enable2FA = async () => {
    setSecBusy(true); setSecMsg(null);
    try {
      const res = await authedFetch('/api/auth/2fa/enable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: secCode })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) { setUser(data.user); saveUserLocal(data.user); if (data.token) localStorage.setItem('nexchat_token', data.token); setSecMsg({ type: 'success', text: t('secTwoFactorOn') }); setSecPanel(null); }
      else setSecMsg({ type: 'error', text: data.error || 'Erro' });
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const disable2FA = async () => {
    setSecBusy(true); setSecMsg(null);
    try {
      const res = await authedFetch('/api/auth/2fa/disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: secCode })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) { setUser(data.user); saveUserLocal(data.user); if (data.token) localStorage.setItem('nexchat_token', data.token); setSecMsg({ type: 'success', text: t('secTwoFactorOff') }); setSecPanel(null); }
      else setSecMsg({ type: 'error', text: data.error || 'Erro' });
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const changePassword = async () => {
    setSecBusy(true); setSecMsg(null);
    try {
      const res = await authedFetch('/api/auth/password/change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: secCurPw, newPassword: secNewPw, code: secCode })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setUser(data.user); saveUserLocal(data.user);
        setSecMsg({ type: 'success', text: t('profileUpdated') }); setSecPanel(null); setSecCurPw(''); setSecNewPw('');
      } else setSecMsg({ type: 'error', text: data.error || 'Erro' });
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const linkGuest = async () => {
    setSecBusy(true); setSecMsg(null);
    try {
      const r1 = await authedFetch('/api/auth/link-guest/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: secEmail, password: secNewPw, lang })
      });
      const d1 = (await r1.json().catch(() => ({})));
      if (!d1.ok) { setSecMsg({ type: 'error', text: secErrText(d1) }); setSecBusy(false); return; }
      setSecMsg({ type: 'success', text: t('secCodeSent').replace('{email}', secEmail) }); setSecCooldown(60);
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const linkGuestConfirm = async () => {
    setSecBusy(true); setSecMsg(null);
    try {
      const res = await authedFetch('/api/auth/link-guest/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: secEmail, password: secNewPw, code: secCode })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) { setUser(data.user); saveUserLocal(data.user); setSecMsg({ type: 'success', text: t('secLinkDone') }); setSecPanel(null); }
      else setSecMsg({ type: 'error', text: data.error || 'Erro' });
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const disconnectAll = async () => {
    setSecBusy(true); setSecMsg(null);
    try {
      const res = await authedFetch('/api/auth/device/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: secCode })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success && data.requireLogin) {
        try { await authedFetch('/api/auth/logout', { method: 'POST' }); } catch {  }
        setUser(null); setSecPanel(null); addToast(t('secRequireLogin'), 'info');
      } else if (data.success) { setSecPanel(null); }
      else setSecMsg({ type: 'error', text: data.error || 'Erro' });
    } catch { setSecMsg({ type: 'error', text: 'Erro de rede' }); }
    setSecBusy(false);
  };

  const handleAttachmentSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    if (!isImage && !isVideo && !isAudio) {
      addToast(t('sendOnlyMedia'), 'error');
      return;
    }
    const max = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      addToast(t('fileTooLarge').replace('{m}', Math.round(max / 1024 / 1024)), 'error');
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
      const upData = (await up.json().catch(() => ({})));
      if (!upData.success) {
        addToast(upData.error || t('errorUpload'), 'error');
        return;
      }
      const caption = messageText.trim();
      if (selectedGroup) {
        const res = await authedFetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', groupId: selectedGroup.id, content: caption, attachmentId: upData.file.id })
        });
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          socket.emit('send_group_msg', { groupId: selectedGroup.id, message: data.message });
          setMessages(prev => [...prev, data.message]);
          clearAttachment();
          setMessageText('');
        } else {
          addToast(data.error || t('errSendGroupMedia'), 'warning');
        }
      } else if (selectedFriend) {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', receiverId: selectedFriend.friendId, content: caption, attachmentId: upData.file.id })
        });
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          setMessages(prev => [...prev, data.message]);
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: data.message });
          clearAttachment();
          setMessageText('');
          stopTyping();
        } else {
          addToast(data.error || t('errorSendingMedia'), 'warning');
        }
      }
    } catch (err) {
      console.error(err);
      addToast(t('errorSendingMedia'), 'error');
    } finally {
      setSendingMedia(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
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
      voiceSilenceWarnedRef.current = false;
      
      try {
        voiceMeterCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const src = voiceMeterCtxRef.current.createMediaStreamSource(stream);
        const analyser = voiceMeterCtxRef.current.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        let quietStart = getTs();
        voiceMeterRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let max = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128) / 128;
            if (v > max) max = v;
          }
          if (max > 0.02) quietStart = getTs();
          else if (getTs() - quietStart > 3000 && !voiceSilenceWarnedRef.current) {
            voiceSilenceWarnedRef.current = true;
            addToast(t('micNoSound'), 'warning');
          }
        }, 500);
      } catch {  }
      setVoiceDuration(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceDuration(Math.floor((getTs() - voiceStartTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error(err);
      addToast(t('errorMicrophone'), 'error');
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
        
        if (blob.size < 1000 || Math.floor((getTs() - voiceStartTimeRef.current) / 1000) < 1) {
          resolve(null);
          addToast(t('recordingTooShort'), 'warning');
          return;
        }
        resolve(blob);
      };
      recorder.stop();
      clearInterval(voiceTimerRef.current);
      clearInterval(voiceMeterRef.current);
      voiceMeterRef.current = null;
      if (voiceMeterCtxRef.current) { voiceMeterCtxRef.current.close().catch(() => {}); voiceMeterCtxRef.current = null; }
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
    clearInterval(voiceMeterRef.current);
    voiceMeterRef.current = null;
    if (voiceMeterCtxRef.current) { voiceMeterCtxRef.current.close().catch(() => {}); voiceMeterCtxRef.current = null; }
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
      const upData = (await up.json().catch(() => ({})));
      if (!upData.success) {
        addToast(upData.error || t('errUploadAudio'), 'error');
        return;
      }
      if (selectedGroup) {
        const res = await authedFetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', groupId: selectedGroup.id, content: '', attachmentId: upData.file.id })
        });
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          socket.emit('send_group_msg', { groupId: selectedGroup.id, message: data.message });
          setMessages(prev => [...prev, data.message]);
        } else {
          addToast(data.error || t('errorSendingAudio'), 'warning');
        }
      } else if (selectedFriend) {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', receiverId: selectedFriend.friendId, content: '', attachmentId: upData.file.id, type: 'voice' })
        });
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          setMessages(prev => [...prev, data.message]);
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: data.message });
        } else {
          addToast(data.error || t('errorSendingAudio'), 'warning');
        }
      }
    } catch (err) {
      console.error(err);
      addToast(t('errorSendingAudio'), 'error');
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
          const current = m.likedBy || [];
          const alreadyLiked = current.includes(user.id);
          return {
            ...m,
            likedBy: alreadyLiked ? current.filter(id => id !== user.id) : [...current, user.id]
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
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              const current = m.likedBy || [];
              return {
                ...m,
                likedBy: data.liked 
                  ? [...current, user.id]
                  : current.filter(id => id !== user.id)
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
    } else if (selectedGroup) {
      try {
        const res = await authedFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'like',
            messageId: msgId
          })
        });
        const data = (await res.json().catch(() => ({})));
        if (data.success) {
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              const current = m.likedBy || [];
              return {
                ...m,
                likedBy: data.liked 
                  ? [...current, user.id]
                  : current.filter(id => id !== user.id)
              };
            }
            return m;
          }));
          socket.emit('like_group_msg', { groupId: selectedGroup.id, messageId: msgId, likedByUserId: user.id });
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
      const data = (await res.json().catch(() => ({})));
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
        if (selectedGroup) {
          socket.emit(data.removed ? 'unreact_group_msg' : 'react_group_msg', { groupId: selectedGroup.id, messageId, emoji, userId: user.id, username: user.username });
        } else if (inRandomChat && randomRoomId) {
          socket.emit(data.removed ? 'unreact_random_msg' : 'react_random_msg', { roomId: randomRoomId, messageId, emoji, userId: user.id, username: user.username });
      } else if (inRandomChat && randomRoomId) {
        const payload = {
          id: `temp_${getTs()}`,
          type: 'voice',
          attachmentId: upData.file.id,
          attachMime: upData.file.mime || blob.type,
          duration: voiceDuration,
          senderId: user.id,
          senderName: user.username,
          likedBy: [],
          createdAt: new Date().toISOString()
        };
        setMessages(prev => [...prev, payload]);
        socket.emit('send_random_msg', { roomId: randomRoomId, message: payload });
      } else if (selectedFriend) {
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          socket.emit(data.removed ? 'unreact_friend_msg' : 'react_friend_msg', { roomId: `friend_chat_${sortedIds[0]}_${sortedIds[1]}`, messageId, emoji, userId: user.id, username: user.username });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        if (data.autoAccepted) {
          setRandomFriendRequestStatus('accepted');
          addToast(t('nowFriends'), 'success');
          socket.emit('accept_random_friend_request', { roomId: randomRoomId, senderId: user.id });
        } else {
          setRandomFriendRequestStatus('sent');
          addToast(t('friendRequestSent'), 'success');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const msg = data.autoAccepted ? t('nowFriends') : t('friendRequestSent');
        setAddFriendSuccess(msg);
        addToast(msg, 'success');
        setAddFriendId('');
        loadFriends();
      } else {
        setAddFriendError(data.error);
        addToast(data.error, 'error');
      }
    } catch (e) {
      setAddFriendError(t('errServerConnection'));
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        addToast(accept ? t('requestAccepted') : t('requestRejected'), accept ? 'success' : 'info');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        addToast(t('userReported'), 'success');
        setShowReportModal(false);
        setReportDetails('');
        skipRandomMatch();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const callFriend = async (type) => {
    if (!selectedFriendRef.current || !user) return;
    
    if (type === 'video' && myLevel < 5) {
      addToast(t('videoLocked'), 'error');
      return;
    }
    
    const callRoomId = `call_${getTs()}_${user.id}`;
    setCallState('calling');
    setCallType(type);
    setActiveCallRoom(callRoomId);
    setActiveView('chat');

    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === 'calling') {
        socket.emit('end_friend_call', { callRoomId });
        cleanupCall();
        addToast(t('callNoAnswer'), 'info');
      }
    }, 45000);

    const onAccepted = async () => {
      removeCallListeners();
      setCallState('connected');
      addToast(t('callConnected'), 'success');
      if (useMediaRef.current) {
        await ensureLocalStream();
        getOrCreatePC(selectedFriendRef.current.friendId, callRoomId, 'caller', type === 'audio');
      }
    };

    const onRejected = () => {
      removeCallListeners();
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      addToast(t('callRejected'), 'warning');
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

    if (useMedia) {
      await ensureLocalStream();
    }
    socket.emit('accept_friend_call', { callRoomId });
    if (useMedia) {
      
      if (!incomingCall.isGroup) {
        
        getOrCreatePC(incomingCall.callerId, callRoomId, 'callee', type === 'audio');
      }
    }
  };

  const rejectIncomingCall = () => {
    if (!incomingCall) return;
    socket.emit('reject_friend_call', { callRoomId: incomingCall.callRoomId });
    setIncomingCall(null);
    addToast(t('callDeclined'), 'info');
  };

  const handleEndCall = useCallback(() => {
    const roomId = activeCallRoom;
    const t = callType;
    const duration = callStartedAtRef.current ? Math.max(0, Math.floor((getTs() - callStartedAtRef.current) / 1000)) : 0;
    if (roomId) {
      socket.emit('end_friend_call', { callRoomId: roomId });
    }
    cleanupCall();
    addToast(t('callEnded'), 'info');
    logCall(t, duration);
  }, [activeCallRoom, callType, cleanupCall, addToast, logCall]);

  const handleEndCallIfActive = useCallback(() => {
    if (callStateRef.current === 'calling' || callStateRef.current === 'connected') {
      handleEndCall();
    }
  }, [handleEndCall]);

  const selectGroup = async (groupId, optimisticGroup = null) => {
    handleEndCallIfActive();
    setSelectedFriend(null);
    setMessages([]);
    setActiveView('chat');
    setGroupLoadError(null);
    
    if (optimisticGroup) setSelectedGroup({ ...optimisticGroup });
    try {
      const res = await authedFetch(`/api/groups?groupId=${groupId}`);
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const group = { ...data.group, members: data.members || [] };
        setSelectedGroup(group);
        setGroupsList(prev => prev.map(g => g.id === groupId ? { ...g, unreadCount: 0 } : g));
        socket.emit('join_group_chat', { groupId });
        if (data.messages?.length) {
          setMessages(data.messages);
        }
        markGroupMessagesRead(groupId);
      } else {
        setGroupLoadError({ groupId, message: data.error || 'Erro ao abrir o grupo' });
      }
    } catch (err) {
      console.error('Erro ao abrir grupo:', err);
      setGroupLoadError({ groupId, message: 'Erro ao abrir o grupo' });
    }
  };

  const searchChat = useCallback(async () => {
    if (!chatSearch.trim() || !selectedFriend) return;
    setIsSearching(true);
    try {
      const res = await authedFetch(`/api/messages?friendId=${selectedFriend.friendId}&search=${encodeURIComponent(chatSearch.trim())}`);
      const data = (await res.json().catch(() => ({})));
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
    if (!user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pin', messageId, groupId: selectedGroup ? selectedGroup.id : undefined })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const pinnedAt = new Date().toISOString();
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt } : m));
        if (selectedGroup) socket.emit('pin_group_msg', { groupId: selectedGroup.id, messageId, pinnedAt });
        addToast(t('pinnedMessage'), 'success');
      } else {
        addToast(data.error || 'Erro ao fixar.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const unpinMessage = async (messageId) => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpin', messageId, groupId: selectedGroup ? selectedGroup.id : undefined })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt: null } : m));
        if (selectedGroup) socket.emit('unpin_group_msg', { groupId: selectedGroup.id, messageId });
        addToast(t('messageUnpinned'), 'info');
      } else {
        addToast(data.error || 'Erro ao desfixar.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedGroup && socket) {
      socket.emit('join_group_chat', { groupId: selectedGroup.id });
      return () => {
        socket.emit('leave_group_chat', { groupId: selectedGroup.id });
      };
    }
  }, [selectedGroup, socket]);

  const startChatFromGroupProfile = async (target) => {
    const friend = friendsList.find(f => f.friendId === target.id) || friendsList.find(f => f.customId === target.customId);
    if (friend) {
      setSelectedGroup(null);
      setSelectedFriend(friend);
      setMessages([]);
      setActiveView('chat');
      loadMessages(friend.friendId);
    } else {
      addToast(t('addFriendToChat'), 'warning');
    }
  };

  const sendGroupMessage = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !messageText.trim()) return;
    const content = messageText.trim();
    setMessageText('');
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', groupId: selectedGroup.id, content, expiresInSeconds: expiresIn || undefined })
      });
      const data = (await res.json().catch(() => ({})));
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

  const toggleExpiry = () => {
    if (!premiumStatus?.premium) {
      setShowPremiumScreen(true);
      return;
    }
    if (expiresIn) {
      setExpiresIn(null);
    } else {
      const choice = prompt('Quando a mensagem deve se autodestruir?\n1 - 5 minutos\n2 - 1 hora\n3 - 24 horas');
      const map = { '1': 300, '2': 3600, '3': 86400 };
      setExpiresIn(map[choice] || 300);
    }
  };

  const sendSticker = async (sticker) => {
    if (!premiumStatus?.premium) {
      setShowPremiumScreen(true);
      return;
    }
    setShowStickerPicker(false);
    if (inRandomChat && randomRoomId) {
      const payload = {
        id: `temp_${getTs()}`,
        content: sticker.id,
        type: 'sticker',
        senderId: user.id,
        senderName: user.username,
        likedBy: [],
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, payload]);
      socket.emit('send_random_msg', { roomId: randomRoomId, message: payload });
      return;
    }
    try {
      const url = selectedGroup ? '/api/groups' : '/api/messages';
      const body = selectedGroup
        ? { action: 'send', groupId: selectedGroup.id, content: sticker.id, type: 'sticker' }
        : { action: 'send', receiverId: selectedFriend?.friendId, content: sticker.id, type: 'sticker' };
      if (!body.receiverId && !body.groupId) return;
      const res = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success && data.message) {
        if (selectedGroup) {
          socket.emit('send_group_msg', { groupId: selectedGroup.id, message: data.message });
        } else {
          const sortedIds = [user.id, selectedFriend.friendId].sort();
          const chatRoomId = `friend_chat_${sortedIds[0]}_${sortedIds[1]}`;
          socket.emit('send_friend_msg', { roomId: chatRoomId, message: data.message });
        }
        setMessages(prev => [...prev, data.message]);
      } else {
        addToast(data.error || 'Erro ao enviar sticker.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const translateMessage = useCallback(async (msg) => {
    if (!premiumStatus?.premium) {
      setShowPremiumScreen(true);
      return;
    }
    if (!msg?.content) return;
    try {
      const res = await authedFetch('/api/premium/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.content })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        setMsgTranslations(prev => prev[msg.id] ? prev : { ...prev, [msg.id]: { text: data.translated, lang: data.detected } });
      } else {
        addToast(data.error || t('errorTranslating'), 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  }, [premiumStatus]);

  useEffect(() => {
    translateMessageRef.current = translateMessage;
  }, [translateMessage]);

  const markGroupMessagesRead = useCallback(async (groupId) => {    if (!user || !groupId) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', groupId })
      });
      const data = (await res.json().catch(() => ({})));
      if (data.success && data.readMessageIds?.length) {
        const readAt = new Date().toISOString();
        setMessages(prev => prev.map(m =>
          data.readMessageIds.includes(m.id) ? { ...m, readBy: [...(m.readBy || []), { userId: user.id, username: user.username, readAt }] } : m
        ));
        socket.emit('group_msgs_read', { groupId, userId: user.id, username: user.username, messageIds: data.readMessageIds, readAt });
      }
    } catch (err) {
      console.error(err);
    }
  }, [user, socket]);

  useEffect(() => {
    markGroupMessagesReadRef.current = markGroupMessagesRead;
  }, [markGroupMessagesRead]);

  const handleExpiredMsg = useCallback((msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: groupName.trim(), memberIds: groupMembers })
      });
      const data = (await res.json().catch(() => ({})));
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
      const data = (await res.json().catch(() => ({})));
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        addToast(t('leftGroup'), 'info');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        addToast(t('memberRemoved'), 'success');
        selectGroup(selectedGroup.id);
      } else {
        addToast(data.error || t('errorRemoveMember'), 'warning');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        addToast(t('groupAdminTransferred'), 'success');
        selectGroup(selectedGroup.id);
      } else {
        addToast(data.error || t('errorTransferAdmin'), 'warning');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        const updated = { ...user, ...data.user };
        setUser(updated);
        saveUserLocal(updated);
        setPremiumStatus(prev => ({ ...prev, chatTheme: ct, invisibleMode: im }));
        addToast(t('premiumSaved'), 'success');
      } else {
        addToast(data.error || 'Erro ao salvar.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

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
      addToast(t('friendOfflineInvite').replace('{n}', friend.username), 'info');
    }
  };

  const loadAdminReports = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin');
      const data = (await res.json().catch(() => ({})));
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
      const data = (await res.json().catch(() => ({})));
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) {
        addToast(t('adminActionApplied').replace('{a}', action), 'success');
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) setAdminUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminUserHistory = async (userId) => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch(`/api/admin?action=user_history&userId=${userId}`);
      const data = (await res.json().catch(() => ({})));
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
      const data = (await res.json().catch(() => ({})));
      if (data.success) setAdminFiles(data.files || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminWarnings = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin?action=warnings');
      const data = (await res.json().catch(() => ({})));
      if (data.success) setAdminWarnings(data.warnings || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminLogs = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/admin?action=admin_logs');
      const data = (await res.json().catch(() => ({})));
      if (data.success) setAdminLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const loadAdminContacts = useCallback(async () => {
    if (!user || user.role === 'user') return;
    try {
      const res = await authedFetch('/api/contact?limit=100');
      const data = (await res.json().catch(() => ({})));
      if (data.success) setAdminContacts(data.messages || []);
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
      if (adminTab === 'contacts') loadAdminContacts();
    }, 0);
    return () => clearTimeout(timer);
  }, [showAdminPanel, adminTab, loadAdminReports, loadAdminStats, loadAdminUsers, loadAdminFiles, loadAdminWarnings, loadAdminLogs, loadAdminContacts]);

  const handleAdminSetRole = async (targetUserId, role) => {
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', targetUserId, role })
      });
      const data = (await res.json().catch(() => ({})));
      addToast(data.success ? t('roleChanged') : `Erro: ${data.error}`, data.success ? 'success' : 'error');
      if (data.success && adminUsers !== null) loadAdminUsers(adminUserQuery);
    } catch {
      addToast('Erro ao alterar role', 'error');
    }
  };

  const handleAdminKick = async (targetUserId, username) => {
    if (!confirm(t('confirmDisconnectUser').replace('{username}', username))) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kick', targetUserId })
      });
      const data = (await res.json().catch(() => ({})));
      addToast(data.success ? t('userDisconnected') : `Erro: ${data.error}`, data.success ? 'success' : 'error');
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
      const data = (await res.json().catch(() => ({})));
      addToast(data.success ? t('warningRemoved') : `Erro: ${data.error}`, data.success ? 'success' : 'error');
      if (data.success) {
        loadAdminWarnings();
        if (adminUsers !== null) loadAdminUsers(adminUserQuery);
      }
    } catch {
      addToast(t('errRemoveWarning'), 'error');
    }
  };

  const handleAdminDeleteFile = async (fileId, ownerId) => {
    if (!confirm(t('confirmDeleteMedia'))) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_file', fileId, targetUserId: ownerId })
      });
      const data = (await res.json().catch(() => ({})));
      addToast(data.success ? t('mediaRemoved') : `Erro: ${data.error}`, data.success ? 'success' : 'error');
    } catch {
      addToast(t('errRemoveMedia'), 'error');
    }
  };

  const handleAdminDeleteMessage = async (messageId, table, ownerId) => {
    if (!confirm(t('confirmDeleteMessageAllGroup'))) return;
    try {
      const res = await authedFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_message', messageId, table, targetUserId: ownerId })
      });
      const data = (await res.json().catch(() => ({})));
      addToast(data.success ? t('messageRemoved') : `Erro: ${data.error}`, data.success ? 'success' : 'error');
    } catch {
      addToast(t('errorRemoveMessage'), 'error');
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
      const data = (await res.json().catch(() => ({})));
      addToast(data.success ? t('broadcastSent') : `Erro: ${data.error}`, data.success ? 'success' : 'error');
      if (data.success) setBroadcastMsg('');
    } catch {
      addToast(t('errSendAnnouncement'), 'error');
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
      addToast(audioEnabled ? t('microphoneMuted') : t('microphoneActive'), 'info');
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
      addToast(videoEnabled ? t('cameraOff') : t('cameraOn'), 'info');
    }
  };

  if (!hasHydrated) return null;
  if (!consentGranted) {
    return (
      <div style={{ display: 'flex', height: '100dvh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'transparent', padding: '20px', overflowY: 'auto' }}>
        <div className="gold-glow-card animate-slide-in" style={{ maxWidth: '500px', width: '100%', height: 'auto', textAlign: 'center', borderRadius: 'var(--radius-lg)', padding: '28px 24px', paddingBottom: '40px', margin: 'auto' }}>
          <h2 className="shimmer-text" style={{ marginBottom: '16px', fontSize: '24px' }}>{t('consentTitle')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
            {t('consentDesc')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn-primary animate-pulse-glow" onClick={() => requestMediaPermissions(true)} style={{ justifyContent: 'center', minHeight: '48px' }}>
              <Video className="icon" /> {t('consentCookiesBtn')}
            </button>
            <button className="btn-secondary" onClick={() => requestMediaPermissions(false)} style={{ minHeight: '48px' }}>
              {t('consentTextOnly')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div ref={loginScrollRef} style={{ display: 'flex', height: '100dvh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'transparent', padding: '16px', overflowY: 'auto', position: 'relative' }}>
        <ScrollHint containerRef={loginScrollRef} label={lang === 'pt' ? 'Role para criar sua conta' : lang === 'it' ? 'Scorri per creare il tuo account' : 'Scroll to create your account'} />
        <div className="gold-glow-card animate-slide-in" style={{ width: '100%', maxWidth: '420px', height: 'auto', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden', padding: '24px 24px', paddingBottom: '40px', margin: 'auto' }}>
          <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,200,71,0.14), transparent 70%)', pointerEvents: 'none' }} className="animate-glow-pulse" />
          <div style={{ position: 'absolute', bottom: '-70px', left: '-70px', width: '180px', height: '180px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217,119,6,0.12), transparent 70%)', pointerEvents: 'none' }} className="animate-glow-pulse" />

          <div style={{ textAlign: 'center', marginBottom: '14px', position: 'relative' }}>
            <div style={{ position: 'relative', width: '56px', height: '56px', margin: '0 auto 10px' }} className="animate-float">
              <div style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', background: 'conic-gradient(from 0deg, transparent 0%, var(--gold) 25%, transparent 50%, var(--gold) 75%, transparent 100%)', opacity: 0.8, filter: 'blur(3px)' }} className="animate-spin-slow" />
              <div style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', background: 'conic-gradient(from 180deg, transparent 0%, rgba(234,200,71,0.5) 30%, transparent 60%)', opacity: 0.6, filter: 'blur(1px)' }} className="animate-spin-slow-reverse" />
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--gold-grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: '0 6px 24px rgba(234,200,71,0.45)' }}>
                <MessageSquare size={24} color="#0B0B0F" strokeWidth={2.2} />
              </div>
            </div>
             <h1 className="shimmer-text" style={{ fontSize: '28px', fontWeight: '800' }}>NexChat</h1>
             <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px', verticalAlign: 'middle' }}>{APP_VERSION}</span>
             <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '2px' }}>{t('platformDesc')}</p>
             <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
               <span className="feature-chip"><MessageSquare size={12} /> {lang === 'en' ? 'Chat' : 'Chat'}</span>
               <span className="feature-chip"><Video size={12} /> {lang === 'en' ? 'Video' : 'Video'}</span>
               <span className="feature-chip"><Timer size={12} /> {lang === 'en' ? 'Match' : 'Match'}</span>
             </div>
           </div>

           {}
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
             <Languages size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
             <select
               value={lang}
               onChange={(e) => { setLang(e.target.value); try { localStorage.setItem('nexchat_lang', e.target.value); } catch(e){} }}
               style={{
                 background: 'var(--bg-2)',
                 color: 'var(--muted)',
                 border: '1px solid var(--line)',
                 borderRadius: '8px',
                 padding: '5px 10px',
                 fontSize: '12px',
                 cursor: 'pointer',
                 outline: 'none'
               }}
             >
               <option value="en">English</option>
               <option value="pt">Português</option>
               <option value="it">Italiano</option>
             </select>
           </div>

           <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
             <div className="segmented" role="tablist">
               <button type="button" className={loginMode === 'guest' ? 'active' : ''} onClick={() => setLoginMode('guest')}>
                 <User size={14} /> {t('loginGuest')}
               </button>
               <button type="button" className={loginMode === 'google' ? 'active' : ''} onClick={() => setLoginMode('google')}>
                 <ShieldCheck size={14} /> {t('loginGoogle')}
               </button>
             </div>
              {loginMode === 'guest' ? (
                loginTwoFactor ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>
                      {t('loginTwoFactorDesc').replace('{email}', loginTwoFactorMask)}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('loginTwoFactorCode')}</label>
                      <input
                        type="text"
                        placeholder="12345678"
                        value={loginTwoFactorCode}
                        onChange={e => setLoginTwoFactorCode(e.target.value)}
                        inputMode="numeric"
                        autoFocus
                        style={{ width: '100%', minHeight: '40px', letterSpacing: '3px', textAlign: 'center' }}
                      />
                    </div>
                    {loginTwoFactorError && (
                      <div style={{ fontSize: '12px', color: 'var(--red)', textAlign: 'center' }}>{loginTwoFactorError}</div>
                    )}
                    <button type="button" onClick={handleLoginTwoFactor} disabled={loginTwoFactorLoading} className="btn-primary animate-pulse-glow" style={{ width: '100%', justifyContent: 'center', minHeight: '46px' }}>
                      {loginTwoFactorLoading ? t('processing') : t('loginVerifyCode')}
                    </button>
                    <button type="button" onClick={cancelLoginTwoFactor} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('username')}</label>
                    <input 
                      type="text" 
                      placeholder={lang === 'en' ? 'Ex: Gabriel' : 'Ex: Gabriel'} 
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value)}
                      required
                      style={{ width: '100%', minHeight: '40px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('password')}</label>
                    <input 
                      type="password" 
                      placeholder={lang === 'en' ? 'Create a password' : 'Crie uma senha'} 
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      required
                      style={{ width: '100%', minHeight: '40px' }}
                    />
                  </div>

                   <div>
                     <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('gender')}</label>
                     <select value={loginGender} onChange={e => setLoginGender(e.target.value)} style={{ width: '100%', minHeight: '40px' }}>
                       <option value="male">{t('male')}</option>
                       <option value="female">{t('female')}</option>
                     </select>
                   </div>

                   {detectedCountry && (
                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '11px', color: 'var(--muted)', padding: '8px', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                       <Globe size={13} style={{ color: 'var(--gold)' }} /> <span>{t('country')}: {getCountryName(loginCountry, lang)}</span>
                       <button type="button" onClick={detectCountryFromIP} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }} title={t('refresh')}>
                         ↻
                       </button>
                     </div>
                   )}

                  <button type="submit" disabled={loading} className="btn-primary animate-pulse-glow" style={{ width: '100%', justifyContent: 'center', marginTop: '6px', minHeight: '46px' }}>
                    {loading ? t('processing') : t('loginAsGuestNew')}
                  </button>
                  </>
                )
              ) : (
               <>
                 <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', marginBottom: '8px' }}>
                   {t('googleLoginDesc')}
                 </p>
                 <button 
                   type="button" 
                   onClick={handleGoogleAuthRedirect} 
                   disabled={loading} 
                   className="btn-primary animate-pulse-glow" 
                   style={{ width: '100%', justifyContent: 'center', minHeight: '48px' }}
                 >
                   {loading ? t('processing') : t('googleLoginBtn')}
                 </button>
               </>
             )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer', lineHeight: '1.4', textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={confirmedAge}
                  onChange={e => setConfirmedAge(e.target.checked)}
                  style={{ transform: 'scale(1.15)', marginTop: '2px', accentColor: 'var(--gold)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span>{t('confirmAge18')}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer', lineHeight: '1.4', textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  style={{ transform: 'scale(1.15)', marginTop: '2px', accentColor: 'var(--gold)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span>
                  {t('acceptTermsPrefix')}{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>{t('termsOfService')}</a>
                  {', '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>{t('privacyPolicy')}</a>
                  {' '}{t('and')}{' '}
                  <a href="/cookies" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>{t('cookiePolicy')}</a>
                </span>
              </label>
            </div>

            {authError && (
              <p style={{ color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> {authError}
              </p>
            )}
          </form>

          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <a href="/contact" style={{ color: 'var(--muted)', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'color 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
              <Headset size={12} /> {t('support')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', background: 'transparent', overflow: 'hidden', position: 'relative' }}>
      
      {}
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

      {}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item ${t.type}`}>
            <Info size={16} style={{ color: t.type === 'success' ? 'var(--green)' : t.type === 'error' ? 'var(--red)' : t.type === 'warning' ? 'var(--amber)' : 'var(--gold)' }} />
            <span style={{ fontSize: '13px' }}>{t.message}</span>
          </div>
        ))}
      </div>

      {}
      <header className="top-navbar">
        <div className="top-navbar-brand" onClick={() => { handleEndCallIfActive(); setSelectedFriend(null); setSelectedGroup(null); setShowAdminPanel(false); }}>
          <div className="brand-icon">
            <MessageSquare size={18} color="#0B0B0F" strokeWidth={2.5} />
          </div>
          NexChat
        </div>

        <div className="top-navbar-actions">
          {}
          <button className="mobile-panel-toggle" onClick={() => setMobilePanelOpen(mobilePanelOpen === 'left' ? null : 'left')}>
            <User size={14} /> <span className="nav-label">{t('messages')}</span>
          </button>

          {}
          <button className="mobile-panel-toggle" onClick={() => setMobilePanelOpen(mobilePanelOpen === 'right' ? null : 'right')}>
            <Users size={14} /> <span className="nav-label">{t('navGroups')}</span>
          </button>

          {}
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">EN</option>
            <option value="pt">PT</option>
            <option value="it">IT</option>
          </select>

          {}
          <a href="/contact">
            <Headset size={14} /> <span className="nav-label">{t('support')}</span>
          </a>

          {}
          {(user.role === 'admin' || user.role === 'moderator') && (
            <button onClick={() => { setShowAdminPanel(!showAdminPanel); setSelectedFriend(null); setSelectedGroup(null); }}>
              <Shield size={14} /> <span className="nav-label">{t('adminPanel')}</span>
            </button>
          )}

          {}
          <div className="top-navbar-user" onClick={() => openProfile({ friendId: user.id })}>
            <div style={{ position: 'relative' }}>
              <Avatar url={user.avatarUrl} name={user.username} size={30} border="1px solid var(--gold)" />
              {premiumStatus?.premium && (
                <div style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--gold)', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px var(--gold-glow)' }}>
                  <Crown size={8} color="#000" />
                </div>
              )}
            </div>
            <div className="top-navbar-user-info">
              <span className="username">{user.username}</span>
              <span className="custom-id">{user.customId}</span>
            </div>
          </div>

          {}
          <button onClick={handleLogout} title={t('logout')} style={{ color: 'var(--muted)' }}>
            <LogOutIcon size={16} />
          </button>
        </div>
      </header>

      {}
      <div className="app-body">

        {}
        <aside className={`panel-left${mobilePanelOpen === 'left' ? ' show-mobile' : ''}`}>
          {}
          <div className="panel-card">
            <div className="panel-card-title">{t('editProfile').split(' ')[0] || 'Profile'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => openProfile({ friendId: user.id })}>
              <div style={{ position: 'relative' }}>
                <Avatar url={user.avatarUrl} name={user.username} size={42} border="1px solid var(--gold)" />
                {premiumStatus?.premium && (
                  <div style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--gold)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px var(--gold-glow)' }}>
                    <Crown size={9} color="#000" />
                  </div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: premiumStatus?.premium ? 'var(--gold)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</span>
                  <UserBadges user={user} size={11} />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{user.customId}</span>
                {user.status && <div style={{ fontSize: '10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.status}</div>}
              </div>
            </div>

            {}
            <form onSubmit={handleAddFriend} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.5px' }}>{t('addFriend')}</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder={t('addFriendPh')}
                  value={addFriendId}
                  onChange={e => setAddFriendId(e.target.value)}
                  style={{ fontSize: '12px', padding: '7px 10px', flex: 1, minHeight: '34px' }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '7px 10px', minHeight: '34px' }}>
                  <UserPlus size={14} />
                </button>
              </div>
              {addFriendError && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{addFriendError}</span>}
              {addFriendSuccess && <span style={{ color: 'var(--green)', fontSize: '11px' }}>{addFriendSuccess}</span>}
            </form>
          </div>

          {}
          {pendingReceived.length > 0 && (
            <div className="panel-card">
              <div className="panel-card-title">
                {t('friendRequests')} ({pendingReceived.length})
              </div>
              <div className="panel-card-list">
                {pendingReceived.map(req => (
                  <div key={req.friendId} className="panel-card-list-item" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>{req.username}</span>
                      <UserBadges user={req} size={10} />
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => respondFriendRequest(req.friendId, true)} style={{ color: 'var(--green)', padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Check size={15} />
                      </button>
                      <button onClick={() => respondFriendRequest(req.friendId, false)} style={{ color: 'var(--red)', padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {}
          <div className="panel-card" style={{ flex: 1, overflow: 'hidden' }}>
            <div className="panel-card-title">
              {t('messages')} ({friendsList.length})
            </div>
            <div className="panel-card-list" style={{ flex: 1, overflowY: 'auto' }}>
              {friendsList.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic', padding: '4px 0' }}>{t('noFriends')}</p>
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
                      setMobilePanelOpen(null);
                    }}
                    className={`panel-card-list-item${selectedFriend?.friendId === f.friendId ? ' active' : ''}`}
                  >
                    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openProfile(f); }}>
                      <Avatar url={f.avatarUrl} name={f.username} size={34} premium={isPremiumActive(f)} />
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: '9px', height: '9px', borderRadius: '50%', background: onlineUsers[f.friendId] ? 'var(--green)' : 'var(--bg-3)', border: '2px solid var(--bg-2)' }}></div>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.username}</span>
                        <UserBadges user={f} size={10} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.customId}</span>
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
          </div>
        </aside>

        {}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
            position: 'relative',
            height: '100%',
            minWidth: 0
          }}
        >
        
        {}
        {showAdminPanel ? (
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }} className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isMobile && (
                  <button onClick={() => setActiveView('sidebar')} style={{ color: 'var(--muted)', padding: '6px' }}>
                    <ChevronLeft size={20} />
                  </button>
                )}
                <h2 style={{ color: 'var(--gold)', fontSize: '20px' }}>{t('adminTitle')}</h2>
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

            {}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[
                ['stats', 'Statistics'],
                ['reports', 'Reports'],
                ['users', 'Users'],
                ['files', 'Files'],
                ['warnings', 'Warnings'],
                ['logs', 'Logs'],
                ['contacts', 'Contacts']
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
                {}
                <div className="glass-card" style={{ border: '1px solid var(--line)', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Megaphone size={16} /> {t('adminAnnouncement')}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      value={broadcastMsg}
                      onChange={e => setBroadcastMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleBroadcast(); }}
                      placeholder={t('adminAnnouncementPh')}
                      style={{ flex: 1, minWidth: '220px', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                    />
                    <button onClick={handleBroadcast} className="btn-primary" style={{ padding: '6px 16px', fontSize: '13px', minHeight: '38px' }}>
                      {t('send')}
                    </button>
                  </div>
                </div>

                <div className="glass-card" style={{ border: '1px solid var(--line)', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={16} /> {t('adminStatistics')}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.activeUsers ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminOnline')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalUsers ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminUsers')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalMessages ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminPrivateMsgs')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalGroupMessages ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminGroupMsgs')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalCalls ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminCalls')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--red)' }}>{adminStats?.totalBans ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminActiveBans')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalFiles ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminFiles')}</div>
                    </div>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{adminStats?.totalWarnings ?? '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminWarnings')}</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {adminTab === 'reports' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>{t('adminReceivedReports')}</h3>
                {reports.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminNoReports')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {reports.map(rep => (
                      <div key={rep.id} style={{ padding: '12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }} className="animate-slide-in">
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', gap: '2px' }}>
                          <span>{t('adminReporter')}: {rep.reporterName}</span>
                          <span>{t('adminDate')}: {new Date(rep.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                          <strong>{t('adminReported')}</strong> {rep.reportedName} ({rep.reportedCustomId})
                        </div>
                        <p style={{ fontSize: '13px', background: 'var(--bg-2)', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                          <strong>{t('adminReason')}</strong> {rep.reason} <br/>
                          <strong>{t('adminDetails')}</strong> {rep.details || t('adminNoDetails')}
                        </p>
                        
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {rep.isCurrentlyBanned ? (
                            <button onClick={() => handleAdminAction(rep.reportedId, 'unban')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                              {t('unban')}
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleAdminAction(rep.reportedId, 'warn')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                                {t('warn')}
                              </button>
                              <button onClick={() => handleAdminAction(rep.reportedId, 'ban', 1)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                                {t('ban1day')}
                              </button>
                              <button onClick={() => handleAdminAction(rep.reportedId, 'ban', 0)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}>
                                {t('banPermanent')}
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

            {adminTab === 'contacts' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Headset size={16} /> {t('adminSupport')}
                </h3>
                {adminContacts === null ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminLoading')}</p>
                ) : adminContacts.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminNoMessages')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {adminContacts.map(msg => (
                      <div key={msg.id} style={{ padding: '12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }} className="animate-slide-in">
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', gap: '2px' }}>
                          <span><strong style={{ color: 'var(--gold)' }}>{msg.name}</strong> — {msg.email}</span>
                          <span>{t('adminTopic')}: {msg.topic} | {new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        <p style={{ fontSize: '13px', background: 'var(--bg-2)', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {adminTab === 'users' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={16} /> {t('adminSearchUsers')}
                </h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <input
                    value={adminUserQuery}
                    onChange={e => setAdminUserQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadAdminUsers(adminUserQuery); }}
                    placeholder={t('adminSearchPh')}
                    style={{ flex: 1, minWidth: '220px', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                  />
                  <button onClick={() => loadAdminUsers(adminUserQuery)} className="btn-primary" style={{ padding: '6px 16px', fontSize: '13px', minHeight: '38px' }}>
                    {t('search')}
                  </button>
                </div>

                {adminUsers === null ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminSearchHint')}</p>
                ) : adminUsers.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminNoUsers')}</p>
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
                            {u.isOnline ? `● ${t('online')}` : t('offline')}
                          </span>
                          {u.lastSeen && !u.isOnline && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('lastSeenPrefix')}{new Date(u.lastSeen).toLocaleString()}</span>
                          )}
                          {u.lastIp && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>IP: {u.lastIp}</span>}
                          <span style={{ fontSize: '11px', color: u.warningCount > 0 ? 'var(--amber)' : 'var(--muted)' }}>{u.warningCount} {t('warningsWord')}</span>
                          {u.activeBanReason && (
                            <span style={{ fontSize: '11px', color: 'var(--red)' }}>{t('bannedLabel').replace('{r}', u.activeBanReason)}</span>
                          )}
                          {u.twoFactorLockUntil && new Date(u.twoFactorLockUntil).getTime() > Date.now() && (
                            <span style={{ fontSize: '11px', color: 'var(--amber)' }}>{t('admin2faLocked')}</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {!u.activeBanReason ? (
                            <>
                              <button onClick={() => handleAdminAction(u.id, 'warn')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                                {t('warn')}
                              </button>
                              <button onClick={() => handleAdminAction(u.id, 'ban', 1)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                                {t('ban1d')}
                              </button>
                              <button onClick={() => handleAdminAction(u.id, 'ban', 0)} className="btn-primary" style={{ background: 'var(--red)', color: '#fff', padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                                {t('banPerm')}
                              </button>
                            </>
                          ) : (
                            <button onClick={() => handleAdminAction(u.id, 'unban')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                              {t('unban')}
                            </button>
                          )}
                          <button onClick={() => handleAdminAction(u.id, 'toggle_verified')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px', color: u.verified ? '#3B82F6' : 'var(--muted)' }}>
                            {u.verified ? t('verifiedLabel') : t('verifyLabel')}
                          </button>
                          <button onClick={() => handleAdminAction(u.id, 'grant_premium', 30)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px', color: u.premiumTier === 'premium' ? 'var(--gold)' : 'var(--muted)' }}>
                            <Crown size={11} /> {u.premiumTier === 'premium' ? t('premiumWord') : t('plusPremium')}
                          </button>
                          <button onClick={() => handleAdminKick(u.id, u.username)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px' }}>
                            {t('kick')}
                          </button>
                          <button onClick={() => handleAdminAction(u.id, 'clear_2fa_lock')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', minHeight: '30px', color: 'var(--amber)' }}>
                            {t('adminClear2faLock')}
                          </button>
                          <select
                            value={u.role}
                            onChange={e => handleAdminSetRole(u.id, e.target.value)}
                            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: '11px' }}
                          >
                            <option value="user">{t('adminRoleUser')}</option>
                            <option value="moderator">{t('adminRoleModerator')}</option>
                            <option value="admin">{t('adminRoleAdmin')}</option>
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
                            <History size={12} /> {adminHistory[u.id] ? t('hideHistory') : t('history')}
                          </button>
                        </div>

                        {adminHistory[u.id] && (
                          <div style={{ marginTop: '12px', background: 'var(--bg-2)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <strong style={{ fontSize: '12px' }}>{t('adminPrivateMsgsColon')}</strong>
                              {adminHistory[u.id].directMsgs.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('adminNoneF')}</p>
                              ) : adminHistory[u.id].directMsgs.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--muted)' }}>{m.type}: </span>{m.content || `(${t('mediaWord')})`} <span style={{ color: 'var(--muted)' }}>— {new Date(m.createdAt).toLocaleString()}</span>
                                  </span>
                                  <button onClick={() => handleAdminDeleteMessage(m.id, 'direct', u.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: '11px', padding: '2px' }}>
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12px' }}>{t('adminGroupMsgsColon')}</strong>
                              {adminHistory[u.id].groupMsgs.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('adminNoneF')}</p>
                              ) : adminHistory[u.id].groupMsgs.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--muted)' }}>[{m.groupName}] </span>{m.content || `(${t('mediaWord')})`} <span style={{ color: 'var(--muted)' }}>— {new Date(m.createdAt).toLocaleString()}</span>
                                  </span>
                                  <button onClick={() => handleAdminDeleteMessage(m.id, 'group', u.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: '11px', padding: '2px' }}>
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12px' }}>{t('adminFilesSent')}</strong>
                              {adminHistory[u.id].files.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('adminNoneM')}</p>
                              ) : adminHistory[u.id].files.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.filename} <span style={{ color: 'var(--muted)' }}>({formatFileSize(f.size)}){f.viewOnce ? ' [view-once]' : ''}</span>
                                  </span>
                                  <button onClick={() => handleAdminDeleteFile(f.id, u.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: '11px', padding: '2px' }}>
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12px' }}>{t('adminReportsAgainst')}</strong>
                              {adminHistory[u.id].reports.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('adminNoneF')}</p>
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
                  <FileText size={16} /> {t('mediaRecent')} <span style={{ fontSize: '11px', color: 'var(--green)' }}>{t('liveNow')}</span>
                </h3>
                {adminFiles === null || adminFiles.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminNoMedia')}</p>
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
                          {t('remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {adminTab === 'warnings' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>{t('adminWarnings')}</h3>
                {adminWarnings === null || adminWarnings.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminNoWarnings')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {adminWarnings.map(w => (
                      <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                        <ShieldAlert size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600' }}>{w.userName} <span style={{ color: 'var(--muted)', fontWeight: '400', fontSize: '11px' }}>({w.customId})</span></div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{w.reason} — {new Date(w.createdAt).toLocaleString()} {t('warningBy')} {w.issuedByName || t('bySystem')}</div>
                        </div>
                        <button onClick={() => handleAdminRemoveWarning(w.id, w.userId)} style={{ color: 'var(--red)', background: 'none', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}>
                          {t('remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {adminTab === 'logs' && (
              <div className="glass-card" style={{ border: '1px solid var(--line)' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>{t('adminActionLog')}</h3>
                {adminLogs === null || adminLogs.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{t('adminNoActions')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {adminLogs.map(l => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--gold)', fontWeight: '600' }}>{l.action}</span>
                        <span>{t('adminBy')}<strong>{l.adminName || t('adminUnknown')}</strong></span>
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
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }} className="animate-fade-in">
            
            {}
            <div style={{ height: isMobile ? '56px' : '64px', borderBottom: '1px solid var(--line)', padding: isMobile ? '0 6px' : '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(180deg, rgba(26,26,32,0.95), var(--bg-2))', flexShrink: 0, boxShadow: 'inset 0 -1px 0 rgba(234,200,71,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px', maxWidth: isMobile ? '42%' : '50%' }}>
                {isMobile && (
                  <button 
                    onClick={() => {
                      handleEndCallIfActive();
                      if (inRandomChat) {
                        if (confirm(t('confirmLeaveRandom'))) {
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
                    <Avatar name="?" size={isMobile ? 30 : 36} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" premium={isPremiumActive(randomPartner)} />
                  ) : (
                    <Avatar url={selectedFriend.avatarUrl} name={selectedFriend.username} size={isMobile ? 30 : 36} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" premium={isPremiumActive(selectedFriend)} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedGroup ? selectedGroup.name : inRandomChat ? `${t('partnerLabel')} (${getCountryName(randomPartner?.country)})` : selectedFriend.username}
                    </span>
                    {!selectedGroup && <UserBadges user={inRandomChat ? randomPartner : selectedFriend} size={11} />}
                  </h4>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedGroup
                      ? `${selectedGroup.members?.length || 0} ${t('members')}`
                      : inRandomChat
                        ? `${t('filterWord')}: ${randomPartner?.gender === 'male' ? t('male') : t('female')}`
                        : typingStatus.isTyping && typingStatus.friendId === selectedFriend.friendId
                          ? <span style={{ color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: '600' }}>{t('typingLabel')} <span className="typing-dots"><span></span><span></span><span></span></span></span>
                          : selectedFriend.customId}
                  </span>
                  {levelStats && !selectedGroup && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 800, color: 'var(--gold)', background: 'rgba(234,200,71,0.12)', border: '1px solid rgba(234,200,71,0.3)', borderRadius: '8px', padding: '1px 7px' }}>
                        <Zap size={10} style={{ color: 'var(--gold)' }} /> {t('levelShort')} {levelStats.level}
                      </span>
                      <span style={{ width: '70px', height: '5px', background: 'var(--bg-3)', borderRadius: '4px', overflow: 'hidden', display: 'inline-block' }}>
                        <span style={{ display: 'block', height: '100%', width: `${levelStats.progress?.pct || 0}%`, background: 'linear-gradient(90deg,#EAC847,#f97316)', borderRadius: '4px' }} />
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: levelStats.streakBroken ? 'var(--muted)' : '#ff8a3d', fontWeight: 700 }}>
                        <Flame size={10} style={{ color: levelStats.streakBroken ? 'var(--muted)' : '#ff8a3d' }} /> {levelStats.streakCount}
                        {levelStats.streakBroken && levelStats.streakRecoveriesUsed < levelStats.streakRecoveriesMax && (
                          <button onClick={recoverStreak} title={t('streakRecover')} style={{ color: 'var(--gold)', background: 'rgba(234,200,71,0.12)', border: '1px solid rgba(234,200,71,0.3)', borderRadius: '8px', padding: '1px 6px', fontSize: '9px', cursor: 'pointer' }}>
                            {t('streakRecover')}
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px' }}>
                {selectedGroup ? (
                  <>
                    <button className="btn-primary" onClick={() => setShowAddMemberModal(true)} title={t('addMember')} style={{ padding: isMobile ? '6px 10px' : '8px 12px', minHeight: isMobile ? '32px' : '36px', fontSize: isMobile ? '11px' : '12px' }}>
                      <UserPlus size={isMobile ? 13 : 15} /> {isMobile ? '' : t('add')}
                    </button>
                    <button onClick={() => setShowGroupManageModal(true)} title={t('manageGroup')} style={{ color: 'var(--text)', background: 'var(--bg-3)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                      <Settings size={14} />
                    </button>
                  </>
                ) : inRandomChat ? (
                  <>
                    {}
                    {randomFriendRequestStatus === 'none' && (
                      <button className="btn-primary" onClick={sendFriendRequestInRandom} style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px' }}>
                        <UserPlus size={isMobile ? 12 : 13} /> {t('request')}
                      </button>
                    )}
                    {randomFriendRequestStatus === 'sent' && (
                      <button className="btn-secondary" disabled style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px', opacity: 0.8, color: 'var(--gold)', borderColor: 'var(--gold)' }}>
                        <Clock size={12} />
                      </button>
                    )}
                    {randomFriendRequestStatus === 'received' && (
                      <button className="btn-primary animate-pulse-glow" onClick={sendFriendRequestInRandom} style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px' }}>
                        Accept
                      </button>
                    )}
                    {randomFriendRequestStatus === 'accepted' && (
                      <button className="btn-secondary" disabled style={{ padding: isMobile ? '4px 8px' : '6px 10px', fontSize: isMobile ? '10px' : '11px', minHeight: isMobile ? '32px' : '36px', color: 'var(--green)', borderColor: 'var(--green)' }}>
                        {t('friends')}
                      </button>
                    )}

                    <button onClick={() => setShowReportModal(true)} title={t('report')} style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', minHeight: isMobile ? '32px' : '36px' }}>
                      <Flag size={14} />
                    </button>
                    <button className="btn-primary animate-pulse-glow" onClick={skipRandomMatch} style={{ padding: isMobile ? '6px 10px' : '8px 12px', minHeight: isMobile ? '32px' : '36px', fontSize: isMobile ? '11px' : '12px' }}>
                      {t('skip')}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => callFriend('audio')} title={t('audio')} style={{ color: 'var(--text)', background: 'var(--bg-3)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                      <Phone size={14} />
                    </button>
                    <button onClick={() => callFriend('video')} title={myLevel >= 5 ? t('video') : t('videoLocked')} disabled={myLevel < 5} style={{ color: myLevel >= 5 ? 'var(--gold)' : 'var(--muted)', background: myLevel >= 5 ? 'var(--gold-soft)' : 'var(--bg-3)', padding: isMobile ? '6px' : '8px', borderRadius: '6px', border: myLevel >= 5 ? '1px solid var(--gold)' : '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px', cursor: myLevel >= 5 ? 'pointer' : 'not-allowed', opacity: myLevel >= 5 ? 1 : 0.55 }}>
                      <Video size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {}
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
                  <Phone size={14} /> {t('inAudioCall')} <span className="call-timer-glow" style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>{formatDuration(callElapsed)}</span>
                </span>
                <span className="sound-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>
                {selectedFriend && (
                  <button onClick={() => setShowAddToCallModal(true)} title={t('addToCall')} style={{ padding: '8px', borderRadius: '50%', background: 'var(--gold-soft)', color: 'var(--gold)', border: '1px solid var(--gold)', minHeight: isMobile ? '32px' : '36px' }}>
                    <UserPlus size={13} />
                  </button>
                )}
                <button onClick={toggleAudio} title={t('mute')} style={{ padding: '8px', borderRadius: '50%', background: 'var(--bg-3)', color: '#fff', border: '1px solid var(--line)', minHeight: isMobile ? '32px' : '36px' }}>
                  {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                </button>
                <button onClick={handleEndCall} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--red)', color: '#fff', fontSize: '11px', border: 'none', minHeight: isMobile ? '32px' : '36px' }}>
                  {t('end')}
                </button>
              </div>
            )}

            {}
            {((inRandomChat && matchMode === 'video') || (callState === 'connected' && callType === 'video')) && (
              <div 
                className="video-container"
                data-participants={Object.keys(remoteStreams).length}
              >
                {}
                {Object.entries(remoteStreams).map(([peerId], idx) => {
                  const count = Object.keys(remoteStreams).length;
                  return (
                    <video
                      key={peerId}
                      ref={el => { remoteVideoElsRef.current[peerId] = el; }}
                      autoPlay
                      playsInline
                      className="video-remote"
                      style={{
                        width: count === 1 ? '100%' : count === 2 ? '50%' : '33.33%',
                        borderRight: idx < count - 1 ? '1px solid var(--line)' : 'none'
                      }}
                    />
                  );
                })}
                
                {}
                {useMedia && (
                  <div className="video-local-pip">
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                    />
                  </div>
                )}
                
                {}
                <div className="video-controls">
                  {callState === 'connected' && (
                    <span className="video-call-timer">
                      {formatDuration(callElapsed)}
                    </span>
                  )}
                  <button 
                    onClick={toggleAudio} 
                    className="video-ctrl-btn"
                    title={audioEnabled ? "Mute mic" : "Unmute mic"}
                  >
                    {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button 
                    onClick={toggleVideo} 
                    className="video-ctrl-btn"
                    title={videoEnabled ? t('cameraOff') : t('cameraOn')}
                  >
                    {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
                  </button>
                  {callState === 'connected' && selectedFriend && (
                    <button 
                      onClick={() => setShowAddToCallModal(true)} 
                      title={t('addToCall')} 
                      className="video-ctrl-btn"
                      style={{ color: 'var(--gold)', borderColor: 'var(--gold)' }}
                    >
                      <UserPlus size={16} />
                    </button>
                  )}
                  {callState === 'connected' && !inRandomChat && (
                    <button 
                      onClick={handleEndCall} 
                      className="video-ctrl-btn danger"
                      title={t('endCall')}
                    >
                      <Phone size={16} style={{ transform: 'rotate(135deg)' }} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {}
            {selectedFriend && !selectedGroup && !inRandomChat && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <input
                  type="text"
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchChat(); }}
                  placeholder={t('searchInChatPh')}
                  style={{ flex: 1, fontSize: '12px', padding: '8px 10px', minHeight: '36px' }}
                />
                <button type="button" onClick={searchChat} className="btn-primary" style={{ padding: '8px 12px', minHeight: '36px', fontSize: '11px' }}>
                  {t('search')}
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
                <span style={{ fontSize: '11px', color: 'var(--gold)' }}>{t('searchResultsFor').replace('{n}', searchResults.length).replace('{q}', chatSearch)}</span>
              </div>
            )}
            {groupLoadError && selectedGroup && (
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexShrink: 0, background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <span style={{ fontSize: '12px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{groupLoadError.message}</span>
                </span>
                <button type="button" onClick={() => selectGroup(groupLoadError.groupId, selectedGroup)} style={{ color: 'var(--gold)', background: 'none', border: '1px solid var(--gold)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', minHeight: '28px', flexShrink: 0 }}>
                  {t('retry')}
                </button>
              </div>
            )}
            <div className="chat-ambient" style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(chatSearch ? searchResults : messages).map((msg, idx, arr) => {
                const isMe = msg.senderId === user.id;
                const liked = (msg.likedBy || []).includes(user.id);
                const prevMsg = idx > 0 ? arr[idx - 1] : null;
                const dayChanged = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

                if (msg.type === 'system') {
                  return (
                    <React.Fragment key={msg.id}>
                    {dayChanged && (
                      <div style={{ alignSelf: 'center' }}>
                        <span className="day-separator">{getDayLabel(msg.createdAt, lang)}</span>
                      </div>
                    )}
                    <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', maxWidth: '85%' }} className="animate-slide-in">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-2)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '8px 14px', color: 'var(--muted)', fontSize: '11px' }}>
                        <UserCheck size={12} style={{ color: 'var(--gold)' }} />
                        <span style={{ fontWeight: '700', color: 'var(--gold)' }}>{msg.partnerName}</span>
                        {msg.partnerCountry && <span>({msg.partnerCountry})</span>}
                      </div>
                      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '10px', padding: '8px 14px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center', lineHeight: '1.5' }}>
                        {msg.content ? msg.content : t('noBioYet')}
                      </div>
                      <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    </React.Fragment>
                  );
                }

                if (msg.type === 'sticker') {
                  const sticker = getSticker(msg.content);
                  return (
                    <React.Fragment key={msg.id}>
                    {dayChanged && (
                      <div style={{ alignSelf: 'center' }}>
                        <span className="day-separator">{getDayLabel(msg.createdAt, lang)}</span>
                      </div>
                    )}
                    <div style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }} className="animate-slide-in">
                      {msg.expiresAt && <ExpiryBadge expiresAt={msg.expiresAt} onExpired={() => handleExpiredMsg(msg.id)} />}
                      <div title={sticker?.label || 'Sticker'} style={{ fontSize: '44px', lineHeight: 1, padding: '6px 10px', background: isMe ? 'linear-gradient(135deg, var(--gold), var(--amber))' : 'var(--bg-3)', border: isMe ? 'none' : '1px solid var(--line)', borderRadius: '14px', display: 'inline-block', position: 'relative', boxShadow: isMe ? '0 4px 16px rgba(234, 200, 71, 0.25)' : 'none' }}>
                        {sticker ? sticker.emoji : msg.content}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '9px', color: 'var(--muted)', padding: '0 4px' }}>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && selectedFriend && !selectedGroup && (
                          msg.readAt ? <CheckCheck size={11} style={{ color: 'var(--gold)' }} title={t('seen')} /> : <Check size={11} style={{ color: 'var(--muted)' }} title={t('sent')} />
                        )}
                        {isMe && selectedFriend && !inRandomChat && (
                          <button onClick={() => handleDeleteMessage(msg.id)} style={{ color: 'var(--red)', border: 'none', background: 'none' }}>{t('deleteBtn')}</button>
                        )}
                      </div>
                    </div>
                    </React.Fragment>
                  );
                }

                if (msg.type === 'call') {
                  return (
                    <React.Fragment key={msg.id}>
                    {dayChanged && (
                      <div style={{ alignSelf: 'center' }}>
                        <span className="day-separator">{getDayLabel(msg.createdAt, lang)}</span>
                      </div>
                    )}
                    <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} className="animate-slide-in">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '10px', padding: '6px 12px', color: 'var(--muted)', fontSize: '11px' }}>
                        {msg.content === 'Video call' ? (
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
                          ? <CheckCheck size={11} style={{ color: 'var(--gold)' }} title={t('seen')} />
                          : <Check size={11} style={{ color: 'var(--muted)' }} title={t('sent')} />)}
                        {isMe && selectedFriend && (
                          <button onClick={() => handleDeleteMessage(msg.id)} style={{ color: 'var(--red)', border: 'none', background: 'none' }}>{t('deleteBtn')}</button>
                        )}
                      </span>
                    </div>
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={msg.id}>
                  {dayChanged && (
                    <div style={{ alignSelf: 'center' }}>
                      <span className="day-separator">{getDayLabel(msg.createdAt, lang)}</span>
                    </div>
                  )}
                  <div 
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
                      <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--gold)', padding: '0 4px' }}>{msg.senderName || 'Member'}</span>
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
                        <button onClick={saveEditMessage} style={{ color: 'var(--gold)', border: 'none', background: 'none', fontSize: '11px' }}>{t('saveBtn')}</button>
                        <button onClick={cancelEditMessage} style={{ color: 'var(--muted)', border: 'none', background: 'none', fontSize: '11px' }}>{t('cancelBtn')}</button>
                      </div>
                    ) : (
                      <div style={{ 
                        background: isMe ? 'linear-gradient(135deg, var(--gold), var(--amber))' : 'rgba(26, 26, 32, 0.92)', 
                        border: isMe ? 'none' : '1px solid rgba(234, 200, 71, 0.22)', 
                        color: isMe ? '#0B0B0F' : 'var(--text)', 
                        padding: msg.attachmentId ? '6px 6px 8px 6px' : '8px 12px', 
                        borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        boxShadow: isMe ? '0 4px 18px rgba(234, 200, 71, 0.28)' : '0 2px 10px rgba(0, 0, 0, 0.35)',
                        position: 'relative',
                        animation: 'bubbleEntrance 0.28s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}>
                        {!msg.attachmentId && (isMe ? <div className="bubble-tail-own" /> : <div className="bubble-tail-other" />)}
                        {msg.attachmentId && <MediaPreview msg={msg} />}
                        {msg.content && (
                          <p style={{ fontSize: '13px', lineHeight: '1.4', wordBreak: 'break-word', padding: msg.attachmentId ? '2px 6px 0' : 0 }}>
                            {msg.content}
                            {msg.editedAt && (
                              <span style={{ fontSize: '9px', color: isMe ? 'rgba(0,0,0,0.55)' : 'var(--muted)', fontStyle: 'italic', marginLeft: '6px' }}>{t('msgEdited')}</span>
                            )}
                          </p>
                        )}
                        {msg.expiresAt && (
                          <div style={{ marginTop: '2px' }}>
                            <ExpiryBadge expiresAt={msg.expiresAt} onExpired={() => handleExpiredMsg(msg.id)} />
                          </div>
                        )}
                        {msgTranslations[msg.id] && msg.content && (
                          <div style={{ borderTop: '1px dashed rgba(0,0,0,0.2)', marginTop: '4px', paddingTop: '4px' }}>
                            <p style={{ fontSize: '12px', lineHeight: '1.4', wordBreak: 'break-word', color: isMe ? '#0B0B0F' : 'var(--gold)' }}>
                              {msgTranslations[msg.id].text}
                            </p>
                            <span style={{ fontSize: '8px', color: isMe ? 'rgba(0,0,0,0.55)' : 'var(--muted)' }}>
                              {t('msgTranslatedFrom').replace('{lang}', msgTranslations[msg.id].lang)} · <button onClick={() => setMsgTranslations(prev => { const n = { ...prev }; delete n[msg.id]; return n; })} style={{ color: isMe ? 'rgba(0,0,0,0.55)' : 'var(--muted)', border: 'none', background: 'none', textDecoration: 'underline', fontSize: '8px' }}>{t('msgHide')}</button>
                            </span>
                          </div>
                        )}
                        
                         {(msg.likedBy || []).length > 0 && (
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
                             <span>{(msg.likedBy || []).length}</span>
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
                          ? <CheckCheck size={11} style={{ color: 'var(--gold)' }} title="Seen" />
                          : <Check size={11} style={{ color: 'var(--muted)' }} title="Sent" />
                      )}
                      {isMe && selectedGroup && premiumStatus?.premium && (msg.readBy || []).length > 0 && (
                        <span title={(msg.readBy || []).map(r => r.username).join(', ')}>
                          Seen por {(msg.readBy || []).slice(0, 3).map(r => r.username || r.userId.slice(0, 5)).join(', ')}{(msg.readBy || []).length > 3 ? ` +${(msg.readBy || []).length - 3}` : ''}
                        </span>
                      )}
                      {premiumStatus?.premium && !isMe && msg.content && msg.type !== 'sticker' && (
                        <button onClick={() => translateMessage(msg)} style={{ color: msgTranslations[msg.id] ? 'var(--gold)' : 'var(--muted)', border: 'none', background: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Languages size={10} /> {msgTranslations[msg.id] ? t('msgTranslated') : t('msgTranslate')}
                        </button>
                      )}
                      <button onClick={() => setReplyingTo(msg)} style={{ color: 'var(--muted)', border: 'none', background: 'none' }}>{t('replyBtn')}</button>
                      <button onClick={() => handleLikeMessage(msg.id)} style={{ color: liked ? 'var(--gold)' : 'var(--muted)', border: 'none', background: 'none' }}>
                        {liked ? t('msgUnlike') : t('msgLike')}
                      </button>
                      <button onClick={() => setReactionPicker(reactionPicker?.messageId === msg.id ? null : { messageId: msg.id })} style={{ color: 'var(--muted)', border: 'none', background: 'none' }}>
                        <Smile size={11} />
                      </button>
                      {(selectedFriend || selectedGroup) && (msg.pinnedAt ? (
                        <button onClick={() => unpinMessage(msg.id)} style={{ color: 'var(--gold)', border: 'none', background: 'none', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Pin size={10} /> {t('msgPinned')}</button>
                      ) : (
                        <button onClick={() => pinMessage(msg.id)} style={{ color: 'var(--muted)', border: 'none', background: 'none', display: 'inline-flex', alignItems: 'center' }}><Pin size={11} /></button>
                      ))}
                      {isMe && selectedFriend && !inRandomChat && msg.type !== 'call' && (
                        <button onClick={() => startEditMessage(msg)} style={{ color: 'var(--gold)', border: 'none', background: 'none' }}>{t('editBtn')}</button>
                      )}
                      {isMe && selectedFriend && !inRandomChat && (
                        <button onClick={() => handleDeleteMessage(msg.id)} style={{ color: 'var(--red)', border: 'none', background: 'none' }}>{t('deleteBtn')}</button>
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
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {}
            <form onSubmit={(e) => { e.preventDefault(); if (isRecordingVoice) { sendVoiceMessage(); } else if (attachment) { sendMediaMessage(); } else if (selectedGroup) { sendGroupMessage(e); } else { handleSendMessage(e); } }} style={{ padding: isMobile ? '8px' : '12px', background: 'linear-gradient(0deg, var(--bg-2), rgba(26,26,32,0.95))', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, position: 'relative', boxShadow: 'inset 0 1px 0 rgba(234,200,71,0.12)' }}>
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-3)', borderLeft: '3px solid var(--gold)', padding: '6px 12px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', minWidth: 0 }}>
                    <span style={{ color: 'var(--gold)', fontWeight: '600', display: 'block', fontSize: '9px' }}>{t('replyingTo')}</span>
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
                  <span style={{ fontSize: '12px', color: 'var(--text)' }}>{attachment.type.startsWith('video/') ? t('video') : attachment.type.startsWith('audio/') ? t('audio') : t('photo')}</span>
                  <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{formatFileSize(attachment.size)}</span>
                  {selectedFriend && !selectedGroup && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: viewOnce ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={viewOnce} onChange={e => setViewOnce(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                      {t('viewOnceSmall')}
                    </label>
                  )}
                  {viewOnce && <span style={{ fontSize: '9px', color: 'var(--amber)', fontWeight: '700' }}>{t('viewOnceLabel')}</span>}
                  <button type="button" onClick={clearAttachment} style={{ color: 'var(--red)', background: 'none', border: 'none', padding: '4px' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="file" ref={fileInputRef} accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={handleAttachmentSelect} />
                <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} title={t('sendPhotoVideoAudio')} style={{ color: attachment ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                  <Paperclip size={16} />
                </button>
                {isRecordingVoice ? (
                  <button type="button" onClick={cancelVoiceRecording} title={t('cancelRecording')} style={{ color: 'var(--red)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px', animation: 'pulse 1s infinite' }}>
                    <MicOff size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={startVoiceRecording} title={t('voiceMessage')} style={{ color: 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                    <Mic size={16} />
                  </button>
                )}
                <button type="button" onClick={() => setShowEmojiPicker(v => !v)} title={t('emojis')} style={{ color: showEmojiPicker ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                  <Smile size={16} />
                </button>
                {premiumStatus?.premium && (
                  <button
                    type="button"
                    onClick={toggleExpiry}
                    title={expiresIn ? t('tempExpiresIn').replace('{t}', expiresIn === 300 ? '5 min' : expiresIn === 3600 ? '1 h' : '24 h') : t('tempMsgPremium')}
                    style={{ color: expiresIn ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px', position: 'relative' }}
                  >
                    <Timer size={16} />
                    {expiresIn && (
                      <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'var(--gold)', color: '#000', borderRadius: '50%', width: '14px', height: '14px', fontSize: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {expiresIn === 300 ? '5' : expiresIn === 3600 ? '1h' : '24'}
                      </span>
                    )}
                  </button>
                )}
                {premiumStatus?.premium && (
                  <button type="button" onClick={() => setShowStickerPicker(v => !v)} title={t('stickers')} style={{ color: showStickerPicker ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px' }}>
                    <Sticker size={16} />
                  </button>
                )}
                {premiumStatus?.premium && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!premiumStatus?.premium) {
                        setShowPremiumScreen(true);
                        return;
                      }
                      const next = !autoTranslate;
                      setAutoTranslate(next);
                      try { localStorage.setItem('nexchat_autotranslate', next ? '1' : '0'); } catch (e) {}
                    }}
                    title={t('autoTranslateTitle')}
                    style={{ color: autoTranslate ? 'var(--gold)' : 'var(--muted)', padding: isMobile ? '8px 10px' : '10px 12px', minHeight: isMobile ? '36px' : '40px', position: 'relative' }}
                  >
                    <Languages size={16} />
                    {autoTranslate && (
                      <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'var(--gold)', borderRadius: '50%', width: '8px', height: '8px' }} />
                    )}
                  </button>
                )}
                {showStickerPicker && (
                  <div style={{ position: 'absolute', bottom: '54px', left: '0', background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '10px', padding: '8px', zIndex: 30, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: '600' }}>{t('stickersLabel')}</span>
                      <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{premiumStatus?.premium ? t('fullPack') : t('premiumExclusive')}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                      {STICKERS.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => sendSticker(s)}
                          title={s.label}
                          style={{ position: 'relative', fontSize: '26px', padding: '6px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '8px', cursor: 'pointer' }}
                          className="friend-item-hover"
                        >
                          {s.emoji}
                          {s.premium && !premiumStatus?.premium && (
                            <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'var(--gold)', borderRadius: '50%', width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Crown size={7} color="#000" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input 
                  type="text" 
                  placeholder={isRecordingVoice ? t('recordingNow').replace('{s}', voiceDuration) : attachment ? t('captionOptional') : t('writePh')} 
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
                  <button type="button" className="btn-primary animate-pulse-glow" onClick={skipRandomMatch} title={t('skipPerson')} style={{ padding: isMobile ? '8px 12px' : '10px 14px', minHeight: isMobile ? '36px' : '40px' }}>
                    <SkipForward size={14} />
                  </button>
                )}
              </div>
            </form>

          </div>
        ) : inQueue ? (
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }} className="animate-fade-in">
            {isMobile && (
              <button onClick={() => setActiveView('sidebar')} style={{ position: 'absolute', top: '16px', left: '16px', color: 'var(--muted)', padding: '8px' }}>
                <ChevronLeft size={24} /> {t('back')}
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
            }} className="animate-ring-pulse radar-core">
              <div className="radar-sweep"></div>
              <div className="radar-wave-1"></div>
              <div className="radar-wave-2"></div>
              <Video size={36} style={{ color: 'var(--gold)', zIndex: 2 }} />
            </div>
            
            <h2 className="shimmer-text" style={{ marginBottom: '8px', fontSize: '20px' }}>{t('adminMatchmaking')}</h2>
            <p style={{ color: 'var(--muted)', maxWidth: '300px', fontSize: '13px', marginBottom: '24px', lineHeight: '1.4' }}>
              {queueStatusText}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', color: 'var(--muted)', marginBottom: '24px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '999px', padding: '6px 14px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', display: 'inline-block' }} />
              {t('onlineCount').replace('{n}', onlineCount)} · <span style={{ color: 'var(--green)', fontWeight: 600 }}>{t('available')}</span>
            </div>
            <button className="btn-secondary" onClick={cancelRandomMatch} style={{ minHeight: '40px' }}>
              {t('cancel')}
            </button>
          </div>
        ) : groupLoadError ? (
          <div className="lobby-container">
            <div className="glass-card gold-glow-card" style={{ borderRadius: '16px', padding: '24px', maxWidth: '360px', textAlign: 'center' }}>
              <AlertCircle size={28} style={{ color: 'var(--red)', margin: '0 auto 10px', display: 'block' }} />
              <h3 style={{ color: 'var(--text)', fontSize: '15px', marginBottom: '6px' }}>{t('groupOpenError')}</h3>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '16px', lineHeight: '1.5' }}>{groupLoadError.message}</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button className="btn-secondary" onClick={() => { setGroupLoadError(null); setActiveView('sidebar'); }} style={{ minHeight: '40px' }}>
                  {t('back')}
                </button>
                <button className="btn-primary" onClick={() => selectGroup(groupLoadError.groupId)} style={{ minHeight: '40px' }}>
                  {t('retry')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="lobby-container">
            {isMobile && (
              <button 
                onClick={() => setActiveView('sidebar')} 
                className="btn-primary animate-pulse-glow" 
                style={{ position: 'absolute', top: '16px', right: '16px', padding: '8px 16px', fontSize: '12px' }}
              >
                {t('seeFriends')} <Users size={14} style={{ marginLeft: '4px' }} />
              </button>
            )}

            <div className="lobby-icon">
              <MessageSquare size={32} color="#0B0B0F" strokeWidth={2.2} />
            </div>
            
            <h1 className="shimmer-text" style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>NexChat <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>{APP_VERSION}</span></h1>
            <p style={{ color: 'var(--muted)', maxWidth: '420px', fontSize: '13px', lineHeight: '1.5', marginBottom: '24px' }}>
              {t('instantConnections')}
            </p>

            {levelStats && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} style={{ color: 'var(--gold)' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gold)' }}>{t('levelShort')} {levelStats.level} <span style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 400 }}>{levelStats.exp}/{levelStats.expToNext} XP</span></div>
                    <div style={{ width: '90px', height: '5px', background: 'var(--bg-2)', borderRadius: '4px', overflow: 'hidden', marginTop: '3px' }}>
                      <span style={{ display: 'block', height: '100%', width: `${levelStats.progress?.pct || 0}%`, background: 'linear-gradient(90deg,#EAC847,#f97316)', borderRadius: '4px' }} />
                    </div>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Flame size={18} style={{ color: levelStats.streakBroken ? 'var(--muted)' : '#ff8a3d' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: levelStats.streakBroken ? 'var(--muted)' : '#ff8a3d' }}>{levelStats.streakCount} {t('streakDays')}</div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)' }}>
                      {levelStats.streakBroken
                        ? (levelStats.streakRecoveriesUsed < levelStats.streakRecoveriesMax
                            ? `${t('streakRecover')} (${levelStats.streakRecoveriesUsed}/${levelStats.streakRecoveriesMax}${t('perMonth')})`
                            : t('streakLimitReached'))
                        : t('streakActive')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {}
            <div className="glass-card lobby-matchmaking-card gold-glow-card">
              <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={15} style={{ color: 'var(--gold)' }} /> {t('matchmakingFilters')}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('filterGender')}</label>
                    <select value={matchGender} onChange={e => setMatchGender(e.target.value)} style={{ width: '100%', fontSize: '12px', minHeight: '40px', padding: '6px 10px' }}>
                      <option value="any">{t('any')}</option>
                      <option value="male">{t('male')}</option>
                      <option value="female">{t('female')}</option>
                    </select>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('filterCountry')}</label>
                    <select value={matchCountry} onChange={e => setMatchCountry(e.target.value)} style={{ width: '100%', fontSize: '12px', minHeight: '40px', padding: '6px 10px' }}>
                      <option value="any">{t('anyCountry')}</option>
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('connectionFormat')}</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ flex: 1, padding: '10px', background: matchMode === 'text' ? 'var(--gold-soft)' : 'var(--bg-3)', border: matchMode === 'text' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', minHeight: '40px', transition: 'all 0.2s' }}>
                      <input type="radio" name="matchMode" checked={matchMode === 'text'} onChange={() => setMatchMode('text')} style={{ display: 'none' }} />
                      <MessageSquare size={14} style={{ color: matchMode === 'text' ? 'var(--gold)' : 'var(--muted)' }} /> {t('text')}
                    </label>
                    <label style={{ flex: 1, padding: '10px', background: matchMode === 'video' ? 'var(--gold-soft)' : 'var(--bg-3)', border: matchMode === 'video' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: myLevel >= 5 ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: '600', minHeight: '40px', transition: 'all 0.2s', opacity: myLevel >= 5 ? 1 : 0.55 }} onClick={() => { if (myLevel >= 5) setMatchMode('video'); else addToast(t('videoLocked'), 'error'); }}>
                      <input type="radio" name="matchMode" checked={matchMode === 'video'} onChange={() => { if (myLevel >= 5) setMatchMode('video'); }} style={{ display: 'none' }} />
                      <Video size={14} style={{ color: matchMode === 'video' ? 'var(--gold)' : 'var(--muted)' }} /> {t('video')}
                      {myLevel < 5 && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{t('levelReq5')}</span>}
                    </label>
                  </div>
                </div>

                {(myLevel >= 5) && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('filterMinLevel')}</label>
                      <select value={matchMinLevel} onChange={e => setMatchMinLevel(Number(e.target.value))} style={{ width: '100%', fontSize: '12px', minHeight: '40px', padding: '6px 10px' }}>
                        {Array.from({ length: 100 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('filterMaxLevel')}</label>
                      <select value={matchMaxLevel} onChange={e => setMatchMaxLevel(Number(e.target.value))} style={{ width: '100%', fontSize: '12px', minHeight: '40px', padding: '6px 10px' }}>
                        {Array.from({ length: 100 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <button className="btn-primary animate-pulse-glow" onClick={startRandomMatch} style={{ width: '100%', justifyContent: 'center', marginTop: '6px', minHeight: '46px', fontSize: '14px' }}>
                  {t('startInstantConnection')} <Play size={14} fill="#000" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

        {}
        <aside className={`panel-right${mobilePanelOpen === 'right' ? ' show-mobile' : ''}`}>
          {}
          <div className="panel-card" style={{ flex: 1, overflow: 'hidden' }}>
            <div className="panel-card-title">
              <span>Groups ({groupsList.length})</span>
              <button onClick={() => setShowCreateGroupModal(true)} title={t('createGroupBtn')} style={{ color: 'var(--gold)', padding: '2px', display: 'flex', background: 'none', border: 'none', cursor: 'pointer' }}>
                <Plus size={15} />
              </button>
            </div>

            {}
            {!premiumStatus?.premium && (
              <button onClick={() => setShowPremiumScreen(true)} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '34px', fontSize: '11px', background: 'linear-gradient(135deg, #EAC847, #D97706)', color: '#000', fontWeight: '700', borderRadius: '10px' }}>
                <Crown size={13} /> {t('premiumWord')}
              </button>
            )}

            {}
            <button onClick={() => setShowGiftPanel(true)} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '34px', fontSize: '11px', marginTop: '6px', background: 'rgba(234,200,71,0.12)', color: 'var(--gold)', fontWeight: '700', borderRadius: '10px', border: '1px solid rgba(234,200,71,0.35)' }}>
              <Gift size={13} /> Presentes
            </button>

            <div className="panel-card-list" style={{ flex: 1, overflowY: 'auto' }}>
              {groupsList.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic', padding: '4px 0' }}>{t('noGroups')}</p>
              ) : (
                groupsList.map(g => (
                  <div
                    key={g.id}
                    onClick={() => {
                      setSelectedFriend(null);
                      setShowAdminPanel(false);
                      selectGroup(g.id, g);
                      setMobilePanelOpen(null);
                    }}
                    className={`panel-card-list-item${selectedGroup?.id === g.id ? ' active' : ''}`}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users size={14} style={{ color: 'var(--gold)' }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{g.memberCount} {t('members')}</span>
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
                        title={t('manageGroup')}
                        style={{ color: 'var(--gold)', background: 'none', border: 'none', padding: '3px', display: 'flex', cursor: 'pointer' }}
                      >
                        <Settings size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

      </div>{}

      {}
      {incomingCall && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, width: '280px', background: 'rgba(17,17,21,0.95)', backdropFilter: 'blur(10px)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 20px rgba(234, 200, 71, 0.35)' }} className="animate-pulse-glow">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div className="call-breath-ring" style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--gold)' }}>
              {(incomingCall.callerData?.username || '?')[0].toUpperCase()}
            </div>
            <div>
              <h4 style={{ fontSize: '13px', color: '#fff' }}>{incomingCall.callerData?.username || t('callerSomeone')}</h4>
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                {incomingCall.isGroup ? t('groupCall') : t('callingYou')} ({incomingCall.type === 'video' ? t('video') : t('audio')})...
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={acceptIncomingCall} className="btn-primary" style={{ flex: 1, padding: '6px', fontSize: '12px', justifyContent: 'center', minHeight: '34px' }}>
              {t('accept')}
            </button>
            <button onClick={rejectIncomingCall} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '12px', background: 'var(--red)', color: '#fff', border: 'none', minHeight: '34px' }}>
              {t('reject')}
            </button>
          </div>
        </div>
      )}

      {}
      {(profileLoading || profileUser || profileError) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: 'min(720px, 96vw)', width: '100%', border: '1px solid var(--line)', padding: '20px', textAlign: 'left', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setProfileUser(null); setProfileError(''); }} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>
            {profileLoading ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px', padding: '24px 0' }}>{t('profileLoading')}</p>
            ) : profileError ? (
              <p style={{ color: 'var(--red)', fontSize: '13px', padding: '24px 0' }}>{profileError}</p>
            ) : profileUser && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}>
                    <Avatar url={profileUser.avatarUrl} name={profileUser.username} size={64} border="1px solid var(--gold)" bg="var(--gold-soft)" color="var(--gold)" premium={isPremiumActive(profileUser)} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: '18px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>{profileUser.username}</span>
                      <UserBadges user={profileUser} size={14} />
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{profileUser.customId}</p>
                  </div>
                </div>
                {profileUser.id === user.id && (
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)', textAlign: 'left' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Eye size={12} /> {t('whoViewedProfile')}
                    </div>
                    {profileViewsLoading ? (
                      <p style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('adminLoading')}</p>
                    ) : !profileViews ? null : profileViews.premiumRequired ? (
                      <button onClick={() => setShowPremiumScreen(true)} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '11px' }}>
                        <Crown size={12} /> {t('unblockWithPremium')}
                      </button>
                    ) : profileViews.viewers.length === 0 ? (
                      <p style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{t('profileNoVisits')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                        {profileViews.viewers.map(v => (
                          <div key={v.viewerId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', padding: '2px 0' }} onClick={() => openProfile(v)}>
                            <Avatar url={v.avatarUrl} name={v.username} size={24} premium={isPremiumActive(v)} />
                            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {v.username}
                              <UserBadges user={v} size={9} />
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--muted)', flexShrink: 0 }}>{new Date(v.viewedAt).toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'it' ? 'it-IT' : 'en-US')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {profileUser.status && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('profileStatusColon')}<span style={{ color: 'var(--gold)' }}>{profileUser.status}</span></div>
                )}

                {editProfileMode ? (
                  <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', textAlign: 'left' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('profileAvatar')}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Avatar url={user.avatarUrl} name={user.username} size={40} />
                        <label className="btn-secondary" style={{ fontSize: '11px', padding: '6px 10px', cursor: 'pointer' }}>
                          {t('sendPhoto')}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('profileStatusLabel')}</label>
                      <input type="text" maxLength="40" value={editStatus} onChange={e => setEditStatus(e.target.value)} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                    </div>
                     <div>
                       <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('profileBio')}</label>
                       <textarea rows="3" maxLength="160" value={editBio} onChange={e => setEditBio(e.target.value)} placeholder={t('bioPh')} style={{ width: '100%', resize: 'none', background: 'var(--bg-3)', border: '1px solid var(--line)', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '12px' }} />
                     </div>
                     {premiumStatus?.premium && (
                       <div>
                         <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('countryLabel')}</label>
                         <select value={editCountry} onChange={e => setEditCountry(e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--bg)', border: '1px solid var(--line)', color: '#fff', borderRadius: '6px' }}>
                           {COUNTRIES.map(c => (
                             <option key={c.code} value={c.code}>
                               {c.flag} {lang === 'en' ? c.nameEn : c.name}
                             </option>
                           ))}
                         </select>
                       </div>
                     )}
                     <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center', minHeight: '38px', fontSize: '13px' }}>{t('saveBtn')}</button>
                      <button type="button" onClick={() => setEditProfileMode(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', minHeight: '38px', fontSize: '13px' }}>{t('cancelBtn')}</button>
                    </div>
                  </form>
                ) : (
                  <>
                     <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '16px', alignItems: 'flex-start', textAlign: 'left' }}><div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                       <span>
                         <MapPin size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} /> {profileUser.country || t('unknown')}
                         {premiumStatus?.premium && <Crown size={10} style={{ verticalAlign: '-1px', marginLeft: '4px', color: 'var(--gold)' }} />}
                       </span>
                       <span>{t('genderColon')} {profileUser.gender === 'male' ? t('male') : profileUser.gender === 'female' ? t('female') : t('otherGender')}</span>
                       <span style={{ color: onlineUsers[profileUser.id] ? 'var(--green)' : 'var(--muted)' }}>
                         {onlineUsers[profileUser.id] ? t('online') : profileUser.lastSeen ? t('lastSeenAt').replace('{t}', new Date(profileUser.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : t('offline')}
                       </span>
                      {profileUser.bio && <span style={{ fontStyle: 'italic', color: 'var(--text)' }}>&ldquo;{profileUser.bio}&rdquo;</span>}
                     </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {profileUser.id === user.id ? (
                      <>
                        {premiumStatus?.premium && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px', textAlign: 'left', padding: '12px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <Crown size={12} style={{ color: 'var(--gold)' }} />
                              <span style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: '600' }}>{t('premiumBadge')}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('invisibleMode')}</span>
                              <button onClick={() => { const next = !invisibleMode; setInvisibleMode(next); savePremiumSettings({ preventDefault: () => {} }, chatTheme, next); }} style={{ background: invisibleMode ? 'var(--gold)' : 'var(--line)', border: 'none', borderRadius: '20px', width: '44px', height: '24px', position: 'relative', cursor: 'pointer', padding: 0 }}>
                                <div style={{ position: 'absolute', top: '2px', left: invisibleMode ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                              </button>
                            </div>
                            <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('chatTheme')}</label>
                              <select value={chatTheme} onChange={e => { const val = e.target.value; setChatTheme(val); savePremiumSettings({ preventDefault: () => {} }, val, invisibleMode); applyTheme(val); }} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--bg)', border: '1px solid var(--line)', color: '#fff', borderRadius: '6px' }}>
                                {Object.entries(THEMES).map(([key, t]) => (
                                  <option key={key} value={key}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                                <Crown size={10} style={{ color: 'var(--gold)' }} /> {t('usernameLabel')}
                              </label>
                              {editingUsername ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} maxLength={30} style={{ flex: 1, fontSize: '12px', padding: '8px' }} autoFocus />
                                  <button onClick={changeUsername} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px', minHeight: '32px' }}>{t('saveBtn')}</button>
                                  <button onClick={() => setEditingUsername(false)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', minHeight: '32px' }}>{t('cancelBtn')}</button>
                                </div>
                              ) : (
                                <button onClick={() => { setNewUsername(user.username); setEditingUsername(true); }} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--gold-soft)', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: '6px', cursor: 'pointer' }}>
                                  {t('changeName')}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <button className="btn-secondary" onClick={openEditProfile} style={{ width: '100%', justifyContent: 'center', minHeight: '40px' }}>
                          <Settings size={14} /> {t('editProfile')}
                        </button>
                        
                        {}
                        {profileUser.id === user.id && (
                          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <UserPlus size={14} style={{ color: 'var(--gold)' }} />
                              <span style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: '600' }}>{t('inviteFriends')}</span>
                            </div>
                            
                            {inviteData?.isPremium ? (
                              <div style={{ fontSize: '11px', color: 'var(--gold)', padding: '8px', background: 'rgba(234,200,71,0.1)', borderRadius: '6px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                <Crown size={12} /> {t('premiumThanks')}
                              </div>
                            ) : (
                              <>
                                {!inviteData?.invite ? (
                                  <button 
                                    onClick={createInvite} 
                                    disabled={inviteLoading || inviteCreated}
                                    className="btn-primary"
                                    style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px', marginBottom: '8px' }}
                                  >
                                    {inviteLoading ? t('creating') : inviteCreated ? t('created') : t('createInviteLink')}
                                  </button>
                                ) : (
                                  <>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                                      {t('shareLinkEarnPremium')}
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                      <input 
                                        readOnly 
                                        value={`${window.location.origin}/i/${inviteData.invite.code}`}
                                        style={{ flex: 1, fontSize: '10px', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: '4px', minWidth: 0 }}
                                      />
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(`${window.location.origin}/i/${inviteData.invite.code}`);
                                          addToast(t('linkCopied'), 'success');
                                        }}
                                        className="btn-secondary"
                                        style={{ padding: '6px 10px', fontSize: '10px', minHeight: '32px', whiteSpace: 'nowrap' }}
                                      >
                                        {t('copy')}
                                      </button>
                                    </div>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginBottom: '4px' }}>
                                      <span>{t('clicks')}: {inviteData.invite.clicks || 0}</span>
                                      <span>{t('signups')}: {inviteData.invite.conversions || 0}/25</span>
                                    </div>
                                    
                                    <div style={{ width: '100%', height: '6px', background: 'var(--line)', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${Math.min(100, ((inviteData.invite.conversions || 0) / 25) * 100)}%`, height: '100%', background: 'var(--gold)', borderRadius: '3px', transition: 'width 0.3s' }} />
                                    </div>
                                  </>
                     )}
                   </>
                )}
                          </div>
                        )}

                        {}
                        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: '600' }}>{t('secTitle')}</span>
                          </div>

                          {secMsg && (
                            <div style={{ fontSize: '11px', padding: '6px 8px', borderRadius: '6px', marginBottom: '8px', background: secMsg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: secMsg.type === 'success' ? 'var(--green)' : '#f87171' }}>
                              {secMsg.text}
                            </div>
                          )}

                          {!secPanel && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {user?.isGuest && (
                                <button onClick={() => openSecPanel('link')} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                                  {t('secLinkGuest')}
                                </button>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                                <span>{t('secTwoFactor')}</span>
                                <span style={{ color: user?.twoFactorEnabled ? 'var(--green)' : 'var(--muted)' }}>{user?.twoFactorEnabled ? t('secTwoFactorOn') : t('secTwoFactorOff')}</span>
                              </div>
                              <button onClick={() => openSecPanel('2fa')} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                                {user?.twoFactorEnabled ? t('secDisable2FA') : t('secEnable2FA')}
                              </button>
                              <button onClick={() => openSecPanel('password')} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                                {t('secChangePassword')}
                              </button>
                              {!user?.isGuest && (
                                <button onClick={() => openSecPanel('disconnect')} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px', border: '1px solid var(--red)', color: '#f87171' }}>
                                  {t('secDisconnectAll')}
                                </button>
                              )}
                            </div>
                          )}

                          {secPanel === '2fa' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('secTwoFactorInfo')}</div>
                              <button onClick={() => sendSecCode(user?.twoFactorEnabled ? 'disable_2fa' : 'enable_2fa')} disabled={secBusy || secCooldown > 0} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px' }}>
                                {secCooldown > 0 ? `${t('secSendCode')} (${secCooldown}s)` : t('secSendCode')}
                              </button>
                              <input type="text" value={secCode} onChange={e => setSecCode(e.target.value)} placeholder={t('secEnterCode8').replace('{n}', '8')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px', textAlign: 'center', letterSpacing: '2px' }} />
                              <button onClick={() => user?.twoFactorEnabled ? disable2FA() : enable2FA()} disabled={secBusy || !secCode} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                                {t('secVerifyCode')}
                              </button>
                              <button onClick={closeSecPanel} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '34px', fontSize: '11px' }}>{t('back')}</button>
                            </div>
                          )}

                          {secPanel === 'password' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {user?.passwordHash && (
                                <input type="password" value={secCurPw} onChange={e => setSecCurPw(e.target.value)} placeholder={t('secCurrentPassword')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                              )}
                              <input type="password" value={secNewPw} onChange={e => setSecNewPw(e.target.value)} placeholder={t('secNewPassword')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                              <button onClick={() => sendSecCode('change_password')} disabled={secBusy || secCooldown > 0} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px' }}>
                                {secCooldown > 0 ? `${t('secSendCode')} (${secCooldown}s)` : t('secSendCode')}
                              </button>
                              <input type="text" value={secCode} onChange={e => setSecCode(e.target.value)} placeholder={t('secEnterCode8').replace('{n}', '8')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px', textAlign: 'center', letterSpacing: '2px' }} />
                              <button onClick={changePassword} disabled={secBusy || !secCode || !secNewPw} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                                {t('secVerifyCode')}
                              </button>
                              <button onClick={closeSecPanel} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '34px', fontSize: '11px' }}>{t('back')}</button>
                            </div>
                          )}

                          {secPanel === 'link' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('secLinkGuestDesc')}</div>
                              <input type="email" value={secEmail} onChange={e => setSecEmail(e.target.value)} placeholder={t('secLinkGuest') + ' (Gmail)'} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                              <input type="password" value={secNewPw} onChange={e => setSecNewPw(e.target.value)} placeholder={t('secNewPassword')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                              <button onClick={linkGuest} disabled={secBusy || !secEmail || !secNewPw || secCooldown > 0} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px' }}>
                                {secCooldown > 0 ? `${t('secSendCode')} (${secCooldown}s)` : t('secSendCode')}
                              </button>
                              <input type="text" value={secCode} onChange={e => setSecCode(e.target.value)} placeholder={t('secEnterCode8').replace('{n}', '8')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px', textAlign: 'center', letterSpacing: '2px' }} />
                              <button onClick={linkGuestConfirm} disabled={secBusy || !secCode} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px' }}>
                                {t('secVerifyCode')}
                              </button>
                              <button onClick={closeSecPanel} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '34px', fontSize: '11px' }}>{t('back')}</button>
                            </div>
                          )}

                          {secPanel === 'disconnect' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '11px', color: '#f87171' }}>{t('secDisconnectAll')} — {t('secRequireLogin')}</div>
                              <button onClick={() => sendSecCode('disconnect_device')} disabled={secBusy || secCooldown > 0} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px' }}>
                                {secCooldown > 0 ? `${t('secSendCode')} (${secCooldown}s)` : t('secSendCode')}
                              </button>
                              <input type="text" value={secCode} onChange={e => setSecCode(e.target.value)} placeholder={t('secEnterCode8').replace('{n}', '8')} style={{ width: '100%', fontSize: '13px', padding: '8px 10px', textAlign: 'center', letterSpacing: '2px' }} />
                              <button onClick={disconnectAll} disabled={secBusy || !secCode} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px', background: 'var(--red)', color: '#fff', border: 'none' }}>
                                {t('secVerifyCode')}
                              </button>
                              <button onClick={closeSecPanel} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '34px', fontSize: '11px' }}>{t('back')}</button>
                            </div>
                          )}
                        </div>

                        <button onClick={pushEnabled ? disablePush : requestPushPermission} disabled={pushLoading} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '40px', marginTop: '8px', background: pushEnabled ? 'var(--green-soft, rgba(74,222,128,0.1))' : 'var(--bg-3)', border: pushEnabled ? '1px solid var(--green)' : '1px solid var(--line)', color: pushEnabled ? 'var(--green)' : 'var(--text)' }}>
                          {pushLoading ? '...' : pushEnabled ? <><Bell size={14} /> {t('notifEnabled')}</> : <><Bell size={14} /> {t('notifEnable')}</>}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-primary" onClick={startChatFromProfile} style={{ width: '100%', justifyContent: 'center', minHeight: '40px', marginBottom: '8px' }}>
                          <MessageSquare size={14} /> {t('chat')}
                        </button>
                        <button
                          onClick={() => toggleBlock(profileUser)}
                          style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '12px', background: blockedIds[profileUser.id] ? 'var(--green-soft, rgba(34,197,94,0.1))' : 'var(--red)', color: blockedIds[profileUser.id] ? 'var(--green)' : '#fff', border: blockedIds[profileUser.id] ? '1px solid var(--green)' : 'none', borderRadius: '6px' }}
                        >
                          {blockedIds[profileUser.id] ? t('unblock') : t('block')}
                        </button>
                      </>
                     )}
                   </div>
                 </div>
                 </>
                 )}
               </>
            )}
          </div>
        </div>
      )}

      {}
      {showCreateGroupModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <form onSubmit={createGroup} className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>{t('groupCreate')}</h3>
              <button type="button" onClick={() => setShowCreateGroupModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('groupNameLabel')}</label>
            <input
              type="text"
              placeholder={t('groupNamePh')}
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              style={{ width: '100%', fontSize: '13px', padding: '8px 12px', minHeight: '38px', marginBottom: '12px' }}
            />
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('groupSelectFriends')}</label>
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
              {friendsList.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>{t('groupNoFriends')}</p>}
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '40px' }}>
              <UserPlus size={14} /> {t('createGroupBtn')}
            </button>
          </form>
        </div>
      )}

      {}
      {showAddMemberModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>{t('groupAddTitle')}</h3>
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
                      <UserPlus size={12} /> {t('add')}
                    </button>
                  </div>
                ))}
              {friendsList.every(f => (selectedGroup?.members || []).some(m => m.userId === f.friendId)) && (
                <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>{t('groupAllAdded')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {}
      {showGroupManageModal && selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>{t('groupManage')}</h3>
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
                      <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.username}</span>
                        <UserBadges user={m} size={10} />
                        {isOwner && <span style={{ fontSize: '10px', color: 'var(--gold)' }}>{t('ownerTag')}</span>}
                      </div>
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
              <LogOutIcon size={14} /> {t('leaveGroup')}
            </button>
          </div>
        </div>
      )}

      {}
      {showAddToCallModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '16px' }}>{t('callAdd')}</h3>
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
                      {onlineUsers[f.friendId] ? t('online') : t('offline')}
                    </div>
                  </div>
                  <button onClick={() => addToCall(f)} className="btn-primary" style={{ padding: '6px 10px', fontSize: '11px', minHeight: '32px' }}>
                    <UserPlus size={12} /> {t('callBtn')}
                  </button>
                </div>
              ))}
              {friendsList.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>{t('callNoFriends')}</p>}
            </div>
          </div>
        </div>
      )}

      {}
      {captchaPeer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '360px', width: '100%', border: '1px solid var(--gold)', padding: '22px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--gold-soft)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={32} color="var(--gold)" />
              </div>
            </div>
            <h3 style={{ color: 'var(--gold)', fontSize: '15px', marginBottom: '8px' }}>{t('captchaTitle')}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: '1.5', marginBottom: '16px' }}>{t('captchaBody')}</p>
            <button className="btn-primary" onClick={verifyCaptcha} disabled={captchaChecking} style={{ width: '100%', justifyContent: 'center', minHeight: '42px', fontSize: '13px' }}>
              {captchaChecking ? t('captchaChecking') : t('captchaVerify')}
            </button>
            <button onClick={() => setCaptchaPeer(null)} style={{ marginTop: '10px', color: 'var(--muted)', background: 'none', border: 'none', fontSize: '11px', cursor: 'pointer' }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {}
      {showReportModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--line)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: 'var(--red)', fontSize: '16px' }}>{t('reportTitle')}</h3>
              <button onClick={() => setShowReportModal(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', padding: '6px' }}><X /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('reportReason')}</label>
                <select value={reportReason} onChange={e => setReportReason(e.target.value)} style={{ width: '100%', minHeight: '38px' }}>
                  <option value="Comportamento impróprio">{t('reportOption1')}</option>
                  <option value="Conteúdo impróprio / Nudez">{t('reportOption2')}</option>
                  <option value="Assédio / Discurso de ódio">{t('reportOption3')}</option>
                  <option value="Spam / Fraude">{t('reportOption4')}</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('reportDetails')}</label>
                <textarea 
                  rows="3" 
                  placeholder={t('describePh')} 
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  style={{ width: '100%', resize: 'none', background: 'var(--bg-3)', border: '1px solid var(--line)', color: '#fff', padding: '8px', borderRadius: '6px' }}
                />
              </div>
              <button className="btn-primary" onClick={submitReport} style={{ background: 'var(--red)', color: '#fff', justifyContent: 'center', marginTop: '4px', minHeight: '40px' }}>
                {t('sendReport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      <GiftPanel open={showGiftPanel} onClose={() => setShowGiftPanel(false)} isGoogle={!!user?.email} lang={lang} country={user?.country} />

      {}
      {showPremiumScreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card animate-slide-in" style={{ maxWidth: '460px', width: '100%', border: '1px solid var(--gold)', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--gold-soft)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Crown size={32} style={{ color: 'var(--gold)' }} />
            </div>
            <h2 style={{ fontSize: '22px', color: 'var(--gold)', marginBottom: '8px' }}>{t('premiumTitle')}</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px', lineHeight: '1.5' }}>
              {t('premiumUnlockDesc')}
            </p>

            {premiumStatus?.premium ? (
              <div style={{ background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)' }}>{t('premiumActive')}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>{t('premiumExpires')}: {premiumStatus.premiumExpiresAt ? new Date(premiumStatus.premiumExpiresAt).toLocaleString(lang === 'pt' ? 'pt-BR' : lang === 'it' ? 'it-IT' : 'en-US') : '-'}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{t('invisibleMode')}</span>
                    <button onClick={() => { const next = !invisibleMode; setInvisibleMode(next); savePremiumSettings({ preventDefault: () => {} }, chatTheme, next); }} style={{ background: invisibleMode ? 'var(--gold)' : 'var(--line)', border: 'none', borderRadius: '20px', width: '44px', height: '24px', position: 'relative', cursor: 'pointer', padding: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: invisibleMode ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{t('chatThemeLabel')}</label>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <button onClick={() => setPremiumPlan('monthly')} style={{ background: premiumPlan === 'monthly' ? 'var(--gold-soft)' : 'var(--bg)', border: premiumPlan === 'monthly' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '8px', padding: '12px', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: premiumPlan === 'monthly' ? 'var(--gold)' : 'var(--text)' }}>{t('monthlyPlan')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('perMonth')}</div>
                  </button>
                  <button onClick={() => setPremiumPlan('yearly')} style={{ position: 'relative', background: premiumPlan === 'yearly' ? 'var(--gold-soft)' : 'var(--bg)', border: premiumPlan === 'yearly' ? '1px solid var(--gold)' : '1px solid var(--line)', borderRadius: '8px', padding: '12px', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ position: 'absolute', top: '-8px', right: '8px', background: 'var(--gold)', color: '#000', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>-50%</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: premiumPlan === 'yearly' ? 'var(--gold)' : 'var(--text)' }}>{t('yearlyPlan')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('perYear')}</div>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                   {(() => {
                     const pInfo = getPlansForLocale(lang, user?.country)[premiumPlan];
                     const symbol = pInfo.currency === 'EUR' ? '€' : pInfo.currency === 'USD' ? '$' : 'R$';
                     return (
                       <span style={{ fontSize: '22px', fontWeight: '700', color: '#fff' }}>
                         {symbol} {String(pInfo.price).replace('.', ',')}
                       </span>
                     );
                   })()}
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{premiumPlan === 'yearly' ? t('perYear') : t('perMonth')}</span>
                </div>
                <ul style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.7', paddingLeft: '18px', margin: 0 }}>
                  <li>{t('uploadUpTo50MB')}</li>
                  <li>{t('unlimitedGroups')}</li>
                  <li>{t('messagesUpTo5000')}</li>
                  <li>{t('upTo50Pinned')}</li>
                  <li>{t('priorityMatchmaking')}</li>
                  <li>{t('groupCallsUpTo8')}</li>
                  <li>{t('changeNameAnytime')}</li>
                  <li>{t('invisibleModeThemes')}</li>
                  <li>{t('exportHistory')}</li>
                </ul>

                {!user?.email ? (
                  <div style={{ background: 'var(--bg-2)', border: '1px solid var(--red)', borderRadius: '8px', padding: '12px', marginTop: '12px', textAlign: 'center' }}>
                    <p style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '8px' }}>
                      {t('googleRequiredDesc')}
                    </p>
                    <button onClick={() => { setShowPremiumScreen(false); handleGoogleAuthRedirect(); }} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '36px', fontSize: '11px' }}>
                      {t('loginWithGoogle')}
                    </button>
                  </div>
                ) : (
                  <button onClick={async () => {
                    setBuying(true);
                    try {
                      const res = await authedFetch('/api/premium/checkout', { method: 'POST', body: JSON.stringify({ plan: premiumPlan, lang }) });
                      const data = (await res.json().catch(() => ({})));
                      if (data.success && data.approveUrl) {
                        window.location.href = data.approveUrl;
                      } else {
                        addToast(data.error || t('errorStartPayment'), 'error');
                        setBuying(false);
                      }
                    } catch (e) {
                      addToast(t('connectionError'), 'error');
                      setBuying(false);
                    }
                  }} disabled={buying} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '16px', minHeight: '44px', background: 'var(--gold-grad)', color: '#000', fontWeight: '700' }}>
                    {buying ? t('redirecting') : t('subscribePremium')}
                  </button>
                )}
              </div>
            )}

            <button onClick={() => setShowPremiumScreen(false)} className="btn-secondary" style={{ minHeight: '40px' }}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {}
      {!cookieConsent && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1500, background: 'var(--bg-2)', borderTop: '1px solid var(--line)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>
            {t('cookiesText')}
          </span>
          <button onClick={acceptCookies} className="btn-primary" style={{ whiteSpace: 'nowrap', minHeight: '36px', fontSize: '12px', padding: '8px 16px' }}>
            {t('acceptCookies')}
          </button>
        </div>
      )}

    </div>
  );
}
