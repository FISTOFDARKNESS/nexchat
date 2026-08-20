'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Gift, Check, X, Crown, Clock, PartyPopper, LogIn } from 'lucide-react';
import { t } from '@/lib/i18n';

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  return res.json().catch(() => ({}));
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const fmtMoney = (v, c) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c || 'BRL' }).format(Number(v || 0));

const STATUS_TEXT = {
  PENDING: 'giftStatusPendingText',
  SCHEDULED: 'giftStatusScheduled',
  ACCEPTED: 'giftStatusAcceptedText',
  REFUSED: 'giftStatusRefused',
  EXPIRED: 'giftStatusExpired',
};

export default function GiftUnboxPage() {
  const { code } = useParams();
  const [lang, setLang] = useState('en');
  useEffect(() => {
    const t0 = setTimeout(() => {
      setLang(typeof window !== 'undefined' ? localStorage.getItem('nexchat_lang') || 'en' : 'en');
    }, 0);
    return () => clearTimeout(t0);
  }, []);
  const L = (k) => t(k, lang);

  const [view, setView] = useState('loading');
  const [gift, setGift] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (view === 'login' || view === 'notyours') {
      const id = setTimeout(() => { window.location.href = '/'; }, 4000);
      return () => clearTimeout(id);
    }
  }, [view]);

  useEffect(() => {
    if (!code) return;
    (async () => {
      const res = await api(`/api/gifts/unbox?code=${encodeURIComponent(code)}`);
      if (res.needsLogin) return setView('login');
      if (res.notYours) return setView('notyours');
      if (res.error) {
        setErr(res.error);
        return setView('error');
      }
      setGift(res.gift);
      if (res.gift.status === 'COLLECTED') setView('collected');
      else if (res.gift.status === 'ACCEPTED') setView('accepted');
      else if (res.gift.status === 'REFUSED') setView('refused');
      else if (res.gift.status === 'EXPIRED') setView('expired');
      else if (res.gift.status === 'SCHEDULED') setView('scheduled');
      else if (res.gift.isGiver) setView('giver');
      else setView('closed');
    })();
  }, [code]);

  const accept = async () => {
    setBusy(true);
    const res = await api('/api/gifts/accept', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.error) {
      setErr(res.errorKey ? L(res.errorKey) : res.error);
      setView('error');
      return;
    }
    setGift((g) => ({ ...g, status: 'ACCEPTED' }));
    setView('accepted');
  };

  const refuse = async () => {
    setBusy(true);
    const res = await api('/api/gifts/refuse', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.error) {
      setErr(res.errorKey ? L(res.errorKey) : res.error);
      setView('error');
      return;
    }
    setGift((g) => ({ ...g, status: 'REFUSED' }));
    setView('refused');
  };

  const planLabel = gift?.plan === 'yearly' ? L('giftYearly') : L('giftMonthly');
  const giverName = gift?.isAnonymous ? 'Anônimo' : (gift?.giverName || L('giftSentYou'));

  const box = (
    <div className="gbx-wrap">
      <div className={`gbx ${view === 'opening' ? 'gbx-open' : ''}`}>
        <div className="gbx-lid" />
        <div className="gbx-body">
          <Gift size={64} color="#EAC847" />
        </div>
      </div>
      <div className="gbx-glow" />
    </div>
  );

  return (
    <div className="gift-root">
      <style>{`
        .gift-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(1200px 600px at 50% -10%, rgba(234,200,71,0.14), transparent 60%), #101014;
          font-family: Arial, sans-serif;
          color: #eee;
          padding: 24px;
        }
        .gift-card {
          width: 100%;
          max-width: 460px;
          background: #16161c;
          border: 1px solid rgba(234,200,71,0.35);
          border-radius: 20px;
          padding: 32px 24px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .gbx-wrap { position: relative; margin: 24px auto; width: 190px; height: 190px; }
        .gbx { position: relative; width: 150px; height: 150px; margin: 20px auto 0; cursor: pointer; transition: transform .2s; }
        .gbx:hover { transform: scale(1.04); }
        .gbx-body {
          position: absolute; left: 0; right: 0; bottom: 0; height: 105px;
          background: linear-gradient(180deg, #EAC847, #b8860b);
          border-radius: 10px 10px 14px 14px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: inset 0 -8px 0 rgba(0,0,0,0.15);
          z-index: 2;
        }
        .gbx-lid {
          position: absolute; left: -8px; right: -8px; top: 12px; height: 34px;
          background: linear-gradient(180deg, #f6d963, #d9a92c);
          border-radius: 8px;
          box-shadow: inset 0 -4px 0 rgba(0,0,0,0.12);
          z-index: 3;
          transition: transform .35s ease;
        }
        .gbx-open .gbx-lid { transform: translate(-30px, -46px) rotate(-28deg); }
        .gbx-open .gbx-body { animation: pop 0.5s ease; }
        @keyframes pop { 0% { transform: scale(1);} 50% { transform: scale(1.15);} 100% { transform: scale(1);} }
        .gbx-wrap .gbx:not(.gbx-open) { animation: shake 1.6s ease-in-out infinite; }
        @keyframes shake {
          0%, 100% { transform: rotate(0); }
          20% { transform: rotate(-4deg) translateY(-2px); }
          40% { transform: rotate(4deg) translateY(-2px); }
          60% { transform: rotate(-3deg); }
          80% { transform: rotate(3deg); }
        }
        .gbx-glow {
          position: absolute; left: 50%; bottom: -14px; transform: translateX(-50%);
          width: 170px; height: 30px; background: radial-gradient(closest-side, rgba(234,200,71,0.5), transparent);
          filter: blur(6px);
        }
        .gift-title { color: #EAC847; font-size: 22px; font-weight: 800; margin: 8px 0 4px; }
        .gift-sub { color: #aaa; font-size: 14px; margin-bottom: 14px; }
        .gift-msg {
          background: rgba(234,200,71,0.08); border: 1px solid rgba(234,200,71,0.25);
          border-radius: 12px; padding: 14px; font-style: italic; color: #ddd; margin: 14px 0;
          font-size: 14px;
        }
        .gift-chip {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(234,200,71,0.12); border: 1px solid rgba(234,200,71,0.3);
          color: #EAC847; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 700;
          margin: 4px;
        }
        .btn-gift {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          min-height: 46px; padding: 0 24px; border-radius: 12px; border: none; cursor: pointer;
          font-weight: 800; font-size: 14px; margin: 8px 4px;
        }
        .btn-gold { background: linear-gradient(135deg, #EAC847, #D97706); color: #111; }
        .btn-ghost { background: transparent; border: 1px solid #444 !important; color: #ccc; }
        .btn-ghost:hover { border-color: #888 !important; }
        .gift-note { font-size: 11px; color: #777; margin-top: 16px; line-height: 1.6; }
        .gift-link { color: #EAC847; text-decoration: none; font-weight: 700; }
      `}</style>

      <div className="gift-card">
        {view === 'loading' && (
          <>
            <div style={{ fontSize: 40, animation: 'pop 1s ease infinite' }}>🎁</div>
            <p style={{ color: '#aaa' }}>{L('giftLoadingBox')}</p>
          </>
        )}

        {view === 'login' && (
          <>
            <LogIn size={40} color="#EAC847" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftYouGot')}</h2>
            <p className="gift-sub">{L('giftLoginHint')}</p>
            <Link href="/" className="btn-gift btn-gold" style={{ textDecoration: 'none' }}>{L('giftLogin')}</Link>
            <p className="gift-note">{L('giftRedirecting')}</p>
          </>
        )}

        {view === 'notyours' && (
          <>
            <Gift size={40} color="#666" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftNotYoursTitle')}</h2>
            <p className="gift-sub">{L('giftNotYoursBody')}</p>
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
            <p className="gift-note">{L('giftRedirecting')}</p>
          </>
        )}

        {view === 'error' && (
          <>
            <X size={40} color="#e05c5c" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftOops')}</h2>
            <p className="gift-sub">{err || L('giftOpenFailed')}</p>
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
          </>
        )}

        {view === 'closed' && (
          <>
            <div className="gift-chip"><Crown size={12} /> {planLabel}</div>
            <p className="gift-sub" style={{ marginTop: 8 }}>
              {giverName} {L('giftSentYou')}
            </p>
            {box}
            <h2 className="gift-title">{L('giftWaiting')}</h2>
            <p className="gift-sub">
              {L('giftExpires')} <b style={{ color: '#fff' }}>{fmtDate(gift?.expiresAt)}</b>
            </p>
            <button className="btn-gift btn-gold" onClick={() => setView('opening')}>{L('giftOpenBox')}</button>
          </>
        )}

        {view === 'opening' && (
          <>
            {box}
            <h2 className="gift-title">{L('giftOpening')}</h2>
            <button
              className="btn-gift btn-gold"
              onClick={() => setTimeout(() => setView('revealed'), 550)}
            >{L('giftReveal')}</button>
          </>
        )}

        {view === 'revealed' && (
          <>
            <PartyPopper size={36} color="#EAC847" style={{ margin: 'auto' }} />
            <h2 className="gift-title">🎉 {giverName} {L('giftGiftedYou')}</h2>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
              <span className="gift-chip"><Crown size={12} /> {planLabel}</span>
              <span className="gift-chip"><Clock size={12} /> {gift?.days} {L('giftDays')}</span>
              <span className="gift-chip">{fmtMoney(gift?.totalAmount, gift?.currency)}</span>
            </div>
            {gift?.message && <div className="gift-msg">&quot;{gift.message}&quot;</div>}
            <p className="gift-sub" style={{ fontSize: 12 }}>
              {L('giftAcceptHint').replace('{date}', fmtDate(gift?.expiresAt))}
            </p>
            <button className="btn-gift btn-gold" onClick={accept} disabled={busy}>
              <Check size={16} /> {busy ? L('giftAccepting') : L('giftAccept')}
            </button>
            <button className="btn-gift btn-ghost" onClick={refuse} disabled={busy}>
              <X size={16} /> {L('giftRefuse')}
            </button>
          </>
        )}

        {view === 'accepted' && (
          <>
            <PartyPopper size={44} color="#EAC847" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftActivated')}</h2>
            <p className="gift-sub">
              {L('giftActivatedBody').replace('{days}', String(gift?.days)).replace('{name}', giverName)}
            </p>
            <Link href="/" className="btn-gift btn-gold" style={{ textDecoration: 'none' }}>{L('giftStart')}</Link>
          </>
        )}

        {view === 'refused' && (
          <>
            <X size={40} color="#aaa" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftRefusedTitle')}</h2>
            <p className="gift-sub">{L('giftRefusedBody')}</p>
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
          </>
        )}

        {view === 'collected' && (
          <>
            <Gift size={40} color="#4ade80" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftCollectedTitle')}</h2>
            <p className="gift-sub">{L('giftCollectedBody')}</p>
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
          </>
        )}

        {view === 'expired' && (
          <>
            <Gift size={40} color="#666" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftExpiredTitle')}</h2>
            <p className="gift-sub">{L('giftExpiredBody')}</p>
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
          </>
        )}

        {view === 'scheduled' && (
          <>
            <Clock size={40} color="#EAC847" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftScheduledTitle')}</h2>
            <p className="gift-sub">
              {L('giftScheduledBody').replace('{name}', giverName)} <b style={{ color: '#fff' }}>{fmtDate(gift?.deliverAt)}</b>. {L('giftScheduledHint')}
            </p>
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
          </>
        )}

        {view === 'giver' && (
          <>
            <Gift size={40} color="#EAC847" style={{ margin: 'auto' }} />
            <h2 className="gift-title">{L('giftYourGift')}</h2>
            <p className="gift-sub">
              {L('giftStatusLabel')} <b style={{ color: '#fff' }}>{L(STATUS_TEXT[gift?.status] || 'giftStatusPending')}</b>
            </p>
            {gift?.status === 'REFUSED' && gift?.paid && gift?.expiresAt && new Date(gift.expiresAt) > new Date() && (
              <p className="gift-sub">{L('giftRefusedResendHint')}</p>
            )}
            <Link href="/" className="btn-gift btn-ghost" style={{ textDecoration: 'none' }}>{L('giftBack')}</Link>
          </>
        )}

        <p className="gift-note">
          {L('giftExpiryNote')}
          <br />
          <Link href="/terms" className="gift-link">{L('termsLink')}</Link>
        </p>
      </div>
    </div>
  );
}