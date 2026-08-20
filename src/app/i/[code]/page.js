'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { MessageSquare, PartyPopper, Loader } from 'lucide-react';
import { translations } from '@/lib/i18n';

function detectLang() {
  try {
    const saved = localStorage.getItem('nexchat_lang');
    if (saved) return saved;
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('pt')) return 'pt';
    if (nav.startsWith('it')) return 'it';
    return 'en';
  } catch {
    return 'en';
  }
}

export default function InvitePage({ params }) {
  const { code } = use(params);
  const [lang, setLang] = useState('en');
  const [inviter, setInviter] = useState(null);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;

  useEffect(() => {
    const t0 = setTimeout(() => {
      setLang(detectLang());
      fetch(`/api/invite/${code}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('not found');
          const data = await res.json();
          if (!data.success) throw new Error('not found');
          setInviter(data.inviter);
        })
        .catch(() => setError(true));
    }, 0);
    return () => clearTimeout(t0);
  }, [code]);

  const handleThanks = async () => {
    if (done) return;
    setDone(true);
    try {
      await fetch(`/api/invite/${code}`, { method: 'POST' });
    } catch (e) {
      console.error('Invite click error:', e);
    }
    try {
      localStorage.setItem('nexchat_invite_code', code);
    } catch (e) {}
    window.location.href = `/?ref=${code}`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: '16px' }}>
      <div className="glass-card animate-slide-in" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--gold)', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--gold-soft)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <MessageSquare size={32} color="#EAC847" strokeWidth={2.2} />
        </div>

        {error ? (
          <>
            <h1 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '10px' }}>{t('inviteInvalid')}</h1>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '20px' }}>{t('inviteInvalidDesc')}</p>
            <Link href="/" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', minHeight: '44px' }}>
              {t('backToChat')}
            </Link>
          </>
        ) : !inviter ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
            <Loader size={28} className="animate-spin-slow" style={{ color: 'var(--gold)' }} />
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('loading')}</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '10px', lineHeight: '1.4' }}>
              {t('inviteWelcome').replace('{name}', inviter?.username || t('someone'))}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '24px' }}>
              {t('inviteDesc')}
            </p>

            {done ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', fontWeight: '700', color: 'var(--gold)', minHeight: '44px' }}>
                <PartyPopper size={18} /> {t('inviteDone')}
              </div>
            ) : (
              <button onClick={handleThanks} className="btn-primary" style={{ width: '100%', justifyContent: 'center', minHeight: '46px', fontSize: '14px' }}>
                {t('inviteThanksBtn')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
