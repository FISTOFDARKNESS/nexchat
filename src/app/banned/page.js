'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, CreditCard } from 'lucide-react';
import { translations } from '@/lib/i18n';

export default function BannedPage() {
  const [ban, setBan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('en');
  const [unbanning, setUnbanning] = useState(false);
  const [unbanErr, setUnbanErr] = useState('');
  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;

  const startUnban = async () => {
    setUnbanning(true);
    setUnbanErr('');
    try {
      const res = await fetch('/api/unban', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('nexchat_token')}` },
      });
      const data = await res.json();
      if (data.approveUrl) {
        window.location.href = data.approveUrl;
        return;
      }
      setUnbanErr(data.error || t('unbanError'));
    } catch {
      setUnbanErr(t('unbanError'));
    }
    setUnbanning(false);
  };

  useEffect(() => {
    const t0 = setTimeout(() => {
      setLang(localStorage.getItem('nexchat_lang') || 'en');
    }, 0);
    const token = localStorage.getItem('nexchat_token');
    if (!token) {
      window.location.href = '/';
      return;
    }
    fetch('/api/banned', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.banned) {
          setBan(data.ban);
        } else {
          window.location.href = '/';
        }
        setLoading(false);
      })
      .catch(() => {
        window.location.href = '/';
      });
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <p>{t('bannedLoading')}</p>
      </div>
    );
  }

  if (!ban) return null;

  const expiresText = ban.expiresAt
    ? new Date(ban.expiresAt).toLocaleString('pt-BR')
    : t('bannedPermanent');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: '24px' }}>
      <div className="glass-card animate-slide-in" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--red)', textAlign: 'center', padding: '32px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <ShieldAlert size={28} style={{ color: 'var(--red)' }} />
        </div>
        <h1 style={{ fontSize: '22px', color: 'var(--red)', marginBottom: '8px' }}>{t('bannedTitle')}</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.5' }}>
          {t('bannedSuspended')}
        </p>
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'left', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text)' }}><strong>{t('bannedReason')}</strong> {ban.reason}</p>
          <p style={{ fontSize: '12px', color: 'var(--muted)' }}><strong>{t('bannedExpires')}</strong> {expiresText}</p>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '16px' }}>
          {t('bannedAppeal')}
        </p>
        <button
          onClick={startUnban}
          disabled={unbanning}
          className="btn-primary"
          style={{ width: '100%', minHeight: '44px', justifyContent: 'center', fontSize: '13px' }}
        >
          <CreditCard size={15} /> {unbanning ? t('unbanProcessing') : t('unbanPay15')}
        </button>
        <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>{t('unbanNote')}</p>
        {unbanErr && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '10px' }}>{unbanErr}</p>}
      </div>
    </div>
  );
}
