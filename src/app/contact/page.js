'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import { translations } from '@/lib/i18n';
import { ArrowLeft, Send, CheckCircle, AlertCircle, Lock } from 'lucide-react';

export default function ContactPage() {
  const { lang, setLang } = useLanguage();
  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;

  const [form, setForm] = useState({ name: '', email: '', topic: 'other', message: '' });
  const [locked, setLocked] = useState({ name: false, email: false });
  const [status, setStatus] = useState('idle'); 
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== 'undefined' ? localStorage.getItem('nexchat_token') : null;
    fetch('/api/users?id=self', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.success || !data.user) return;
        const u = data.user;
        const isPremiumUser = u.premiumTier === 'premium' && u.premiumExpiresAt && new Date(u.premiumExpiresAt) > new Date();
        const next = {};
        if (isPremiumUser) {
          
          if (u.username) next.name = u.customId ? `${u.username}#${u.customId}` : u.username;
          if (typeof u.email === 'string' && u.email.includes('@')) next.email = u.email;
        } else {
          
          if (u.username) {
            next.name = u.customId ? `${u.username}#${u.customId}` : u.username;
            setLocked(prev => ({ ...prev, name: true }));
          }
          if (typeof u.email === 'string' && u.email.includes('@')) {
            next.email = u.email;
            setLocked(prev => ({ ...prev, email: true }));
          }
        }
        setForm(prev => ({ ...prev, ...next }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const set = (key) => (e) => {
    if (locked[key]) return; 
    setForm(prev => ({ ...prev, [key]: e.target.value }));
  };

  const emailReadonly = locked.email;

  async function handleSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    if (!name || !email || !message) { setError(t('contactAllRequired')); setStatus('error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError(t('contactEmailInvalid')); setStatus('error'); return; }

    setStatus('sending');
    setError('');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000); 
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic: form.topic, message }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus('sent');
      } else {
        setError(t(data.error || 'contactError'));
        setStatus('error');
      }
    } catch {
      setError(t('contactError'));
      setStatus('error');
    }
  }

  const inputStyle = {
    width: '100%',
    minHeight: '42px',
    borderRadius: '10px',
    border: '1px solid var(--line)',
    background: 'var(--bg-2)',
    color: 'var(--text)',
    padding: '10px 12px',
    fontSize: '13px',
    outline: 'none'
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
            className="btn-secondary"
            style={{ minHeight: '36px', fontSize: '12px' }}
          >
            <ArrowLeft size={14} style={{ marginRight: '6px' }} /> {lang === 'pt' ? 'Voltar' : lang === 'it' ? 'Indietro' : 'Back'}
          </button>
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            style={{ background: 'var(--bg-2)', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="en">🇺🇸 English</option>
            <option value="pt">🇧🇷 Português</option>
            <option value="it">🇮🇹 Italiano</option>
          </select>
        </div>

        <div className="gold-glow-card" style={{ borderRadius: '16px', padding: '28px 24px' }}>
          <h1 style={{ fontSize: '22px', color: 'var(--gold)', textAlign: 'center', marginBottom: '8px' }}>{t('contactTitle')}</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '20px', textAlign: 'center' }}>{t('contactDesc')}</p>

          {status === 'sent' ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(74, 222, 128, 0.12)', border: '1px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <CheckCircle size={26} style={{ color: 'var(--green)' }} />
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: '1.6' }}>{t('contactSent')}</p>
              <button onClick={() => { setStatus('idle'); setForm(prev => ({ ...prev, topic: 'other', message: '' })); }} className="btn-secondary" style={{ marginTop: '16px', minHeight: '40px', fontSize: '12px' }}>
                {lang === 'pt' ? 'Enviar outra mensagem' : lang === 'it' ? 'Invia un altro messaggio' : 'Send another message'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                  {t('contactName')} {locked.name && <Lock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />}
                </label>
                <input type="text" value={form.name} onChange={set('name')} maxLength={80} readOnly={locked.name} placeholder={t('contactName')} style={{ ...inputStyle, ...(locked.name ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                  {t('contactEmail')} {locked.email && <Lock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />}
                </label>
                <input type="email" value={form.email} onChange={set('email')} maxLength={120} readOnly={emailReadonly} placeholder="example@email.com" style={{ ...inputStyle, ...(emailReadonly ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('contactTopic')}</label>
                <select value={form.topic} onChange={set('topic')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="account">{t('topicAccount')}</option>
                  <option value="report">{t('topicReport')}</option>
                  <option value="bug">{t('topicBug')}</option>
                  <option value="premium">{t('topicPremium')}</option>
                  <option value="other">{t('topicOther')}</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{t('contactMessage')}</label>
                <textarea value={form.message} onChange={set('message')} rows={5} maxLength={2000} placeholder={t('contactMessagePlaceholder')} style={{ ...inputStyle, resize: 'vertical', minHeight: '110px' }} />
              </div>

              {status === 'error' && (
                <p style={{ color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={14} /> {error}
                </p>
              )}

              <button type="submit" disabled={status === 'sending'} className="btn-primary animate-pulse-glow" style={{ width: '100%', justifyContent: 'center', minHeight: '46px' }}>
                <Send size={14} />
                {status === 'sending' ? t('contactSending') : t('contactSend')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}