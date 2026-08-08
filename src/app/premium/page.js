'use client';

import { useEffect, useState } from 'react';
import { Crown, Check, Zap, ToggleLeft, Palette, ShieldAlert } from 'lucide-react';
import { PREMIUM_PRICE, formatPremiumPrice } from '@/lib/premium-config';

const THEMES = {
  default: { name: 'Dourado', vars: { '--gold': '#EAC847', '--amber': '#D97706', '--gold-soft': 'rgba(234, 200, 71, 0.12)', '--gold-glow': 'rgba(234, 200, 71, 0.35)' } },
  midnight: { name: 'Meia-noite', vars: { '--gold': '#818CF8', '--amber': '#6366F1', '--gold-soft': 'rgba(129, 140, 248, 0.12)', '--gold-glow': 'rgba(129, 140, 248, 0.35)' } },
  forest: { name: 'Floresta', vars: { '--gold': '#4ADE80', '--amber': '#16A34A', '--gold-soft': 'rgba(74, 222, 128, 0.12)', '--gold-glow': 'rgba(74, 222, 128, 0.35)' } },
  rose: { name: 'Rosa', vars: { '--gold': '#FB7185', '--amber': '#E11D48', '--gold-soft': 'rgba(251, 113, 133, 0.12)', '--gold-glow': 'rgba(251, 113, 133, 0.35)' } },
  ocean: { name: 'Oceano', vars: { '--gold': '#22D3EE', '--amber': '#0891B2', '--gold-soft': 'rgba(34, 211, 238, 0.12)', '--gold-glow': 'rgba(34, 211, 238, 0.35)' } }
};

function applyTheme(themeKey) {
  const root = document.documentElement;
  const theme = THEMES[themeKey] || THEMES.default;
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  localStorage.setItem('nexchat_theme', themeKey);
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)' }}>{value}</div>
      <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export default function PremiumPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [chatTheme, setChatTheme] = useState('default');
  const [invisibleMode, setInvisibleMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(null);
  const [isGoogleUser, setIsGoogleUser] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('nexchat_token');
    if (!token) {
      window.location.href = '/';
      return;
    }
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/premium/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setStatus(data);
          setChatTheme(data.user?.chatTheme || 'default');
          setInvisibleMode(data.user?.invisibleMode || false);
          setIsGoogleUser(!!data.isGoogleUser);
          if (data.user?.chatTheme) applyTheme(data.user.chatTheme);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, []);

  useEffect(() => {
    if (!status?.premium) return;
    fetch('/api/premium/stats', {
      headers: { Authorization: `Bearer ${localStorage.getItem('nexchat_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && !data.premiumRequired) setStats(data.stats);
      })
      .catch(() => {});
  }, [status?.premium]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
      setLoading(true);
      fetch('/api/premium/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('nexchat_token')}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setStatus(data);
            setChatTheme(data.user?.chatTheme || 'default');
            setInvisibleMode(data.user?.invisibleMode || false);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, []);

  const handleBuy = async () => {
    setBuying(true);
    try {
      const token = localStorage.getItem('nexchat_token');
      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && data.approveUrl) {
        window.location.href = data.approveUrl;
      } else {
        alert(data.error || 'Erro ao iniciar pagamento');
        setBuying(false);
      }
    } catch (e) {
      alert('Erro ao conectar ao servidor');
      setBuying(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('nexchat_token');
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ chatTheme, invisibleMode })
      });
      const data = await res.json();
      if (data.success) {
        setStatus(prev => ({ ...prev, chatTheme, invisibleMode }));
        applyTheme(chatTheme);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const isPremium = status?.premium;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: '24px' }}>
      <div className="glass-card animate-slide-in" style={{ maxWidth: '480px', width: '100%', border: isPremium ? '1px solid var(--gold)' : '1px solid var(--line)', textAlign: 'center', padding: '32px' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--gold-soft)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Crown size={32} style={{ color: 'var(--gold)' }} />
        </div>

        <h1 style={{ fontSize: '24px', color: 'var(--gold)', marginBottom: '8px' }}>NexChat Premium</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px', lineHeight: '1.5' }}>
          Unlock exclusive features and enjoy the app without limits.
        </p>

        {isPremium ? (
          <>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Zap size={16} style={{ color: 'var(--gold)' }} />
              <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)' }}>Active Plan</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>Expira em: {status.premiumExpiresAt ? new Date(status.premiumExpiresAt).toLocaleString('pt-BR') : '-'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text)' }}>Invisible mode</span>
                <button onClick={() => setInvisibleMode(prev => !prev)} style={{ background: invisibleMode ? 'var(--gold)' : 'var(--line)', border: 'none', borderRadius: '20px', width: '44px', height: '24px', position: 'relative', cursor: 'pointer', padding: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', left: invisibleMode ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </button>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                  <Palette size={12} /> Chat theme
                </label>
                <select value={chatTheme} onChange={e => setChatTheme(e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '8px', background: 'var(--bg)', border: '1px solid var(--line)', color: '#fff', borderRadius: '6px' }}>
                  {Object.entries(THEMES).map(([key, t]) => (
                    <option key={key} value={key}>{t.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={saveSettings} disabled={saving} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', fontSize: '12px', marginTop: '4px' }}>
                {saving ? 'Salvando...' : 'Save settings'}
              </button>
            </div>
          </div>

          {stats && (
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap size={16} style={{ color: 'var(--gold)' }} />
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gold)' }}>Your statistics</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <Stat label="Messages" value={stats.msgsSent} />
                <Stat label="Calls" value={stats.callsMade} />
                <Stat label="Minutes in call" value={stats.callMinutes} />
                <Stat label="Reactions" value={stats.reactions} />
                <Stat label="Likes" value={stats.likes} />
                <Stat label="Files" value={stats.files} />
                <Stat label="Friends" value={stats.friends} />
                <Stat label="Groups" value={stats.groups} />
                <Stat label="Premium days" value={stats.premiumDays} />
              </div>
            </div>
          )}
          </>
        ) : (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>R$ {formatPremiumPrice()}</span>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>/mês</span>
            </div>
            <ul style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.6', paddingLeft: '16px', margin: 0 }}>
              <li>Upload up to 50 MB (photo/video/audio)</li>
              <li>Groups ilimitados + até 100 membros</li>
              <li>Messages de até 5000 caracteres</li>
              <li>Up to 50 pinned messages</li>
              <li>Priority matchmaking</li>
              <li>Calls em grupo com até 8 pessoas</li>
              <li>Change name anytime</li>
              <li>Invisible mode + temas personalizados</li>
              <li>Who viewed my profile + group read receipts</li>
              <li>Messages que se autodestroem (5min/1h/24h)</li>
              <li>Auto-translation of messages</li>
              <li>Exclusive stickers</li>
              <li>Crown badge + verified seal</li>
              <li>Export chat history (JSON)</li>
            </ul>
          </div>
        )}

        {!isPremium && !isGoogleUser && (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--red)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <ShieldAlert size={16} style={{ color: 'var(--red)' }} />
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--red)' }}>Google login required</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
              To purchase Premium, you need to be logged in with a Google account. Guest accounts cannot subscribe.
            </p>
            <button onClick={() => { window.location.href = '/'; }} className="btn-secondary" style={{ width: '100%', justifyContent: 'center', minHeight: '38px', marginTop: '12px' }}>
              Log in with Google
            </button>
          </div>
        )}

        {!isPremium && isGoogleUser && (
          <button
            onClick={handleBuy}
            disabled={buying}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', minHeight: '44px', background: 'var(--gold)', color: '#000', fontWeight: '700' }}
          >
            {buying ? 'Redirecting...' : 'Subscribe Premium'}
          </button>
        )}

        <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '12px' }}>
          Secure payment via PayPal. Cancel anytime.
        </p>

        <button onClick={() => { window.location.href = '/'; }} className="btn-secondary" style={{ minHeight: '40px', marginTop: '8px' }}>
          Back to chat
        </button>
      </div>
    </div>
  );
}
