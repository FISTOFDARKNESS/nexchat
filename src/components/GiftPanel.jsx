'use client';

import { useEffect, useState } from 'react';
import { Gift, Crown, X, Check, Send, Clock, RefreshCw, PartyPopper, Search, UserPlus } from 'lucide-react';
import { t } from '@/lib/i18n';
import { getPlansForLocale } from '@/lib/premium-config';

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  return res.json().catch(() => ({}));
};

const fmtDate = (d, lang) => {
  if (!d) return '—';
  const locale = lang === 'pt' ? 'pt-BR' : lang === 'it' ? 'it-IT' : 'en-US';
  return new Date(d).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
};

const fmtMoney = (v, c, lang) => {
  const locale = lang === 'pt' ? 'pt-BR' : lang === 'it' ? 'it-IT' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: c || 'BRL' }).format(Number(v || 0));
};

const STATUS = {
  PENDING: { key: 'giftStatusPending', color: '#EAC847' },
  SCHEDULED: { key: 'giftStatusScheduled', color: '#7aa2ff' },
  ACCEPTED: { key: 'giftStatusAccepted', color: '#4ade80' },
  REFUSED: { key: 'giftStatusRefused', color: '#f87171' },
  EXPIRED: { key: 'giftStatusExpired', color: '#777' },
};

export default function GiftPanel({ open, onClose, isGoogle, lang: langProp, country = 'BR' }) {
  const [localLang, setLocalLang] = useState(() => {
    try { return localStorage.getItem('nexchat_lang') || 'pt'; } catch (e) { return 'pt'; }
  });
  const lang = langProp || localLang;
  const [tab, setTab] = useState('received');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState(null);
  const [friendId, setFriendId] = useState('');
  const [strangerId, setStrangerId] = useState('');
  const [strangerQuery, setStrangerQuery] = useState('');
  const [strangerResults, setStrangerResults] = useState([]);
  const [strangerSearching, setStrangerSearching] = useState(false);
  const [plan, setPlan] = useState('monthly');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [deliverAt, setDeliverAt] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [retargetGift, setRetargetGift] = useState(null);
  const [retargetId, setRetargetId] = useState('');
  const [retargeting, setRetargeting] = useState(false);

  const load = async () => {
    setErr('');
    setLoading(true);
    const res = await api('/api/gifts');
    setLoading(false);
    if (res.success) {
      setData({
        sent: (res.sent || []).map((g) => ({ ...g, _status: computeStatus(g) })),
        received: (res.received || []).map((g) => ({ ...g, _status: computeStatus(g) })),
      });
    }
  };

  const computeStatus = (g) => {
    if (g.status === 'PENDING' && g.paid && g.deliverAt && new Date(g.deliverAt) > new Date()) return 'SCHEDULED';
    return g.status;
  };

  useEffect(() => {
    if (open) {
      const t = setTimeout(load, 0);
      api('/api/gifts/friends').then((res) => {
        setRetargetGift(null);
        if (res.success) setFriends(res.friends || []);
      });
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    const h = () => load();
    if (typeof window !== 'undefined') window.addEventListener('nexchat_gift_refresh', h);
    return () => window.removeEventListener('nexchat_gift_refresh', h);
  }, []);

  if (!open) return null;

  const selected = friends?.find((f) => f.userId === friendId) || strangerResults.find((s) => s.id === strangerId);
  const locale = getPlansForLocale(lang, country);
  const currency = locale.monthly.currency;
  const monthlyBase = parseFloat(locale.monthly.price);
  const yearlyBase = parseFloat(locale.yearly.price);
  const money = (v) => fmtMoney(v, currency, lang);
  const basePrice = plan === 'yearly' ? yearlyBase : monthlyBase;
  const isFriendRecipient = friends?.some((f) => f.userId === friendId);
  const feePct = isFriendRecipient ? 0.15 : 0.30;
  const fee = basePrice * feePct;
  const total = basePrice + fee;
  const canSend = !!isGoogle;
  const planName = plan === 'yearly' ? t('giftYearly') : t('giftMonthly');
  const recipientWarn = selected && !selected.canReceive
    ? (!selected.isGoogle ? t('giftReasonGoogle') : selected.hasPremium ? t('giftReasonPremium') : t('giftReasonPending'))
    : '';

  const searchStranger = async () => {
    const q = strangerQuery.trim();
    if (q.length < 3) return;
    setStrangerSearching(true);
    const res = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    setStrangerSearching(false);
    if (res.success) {
      setStrangerResults(res.users || []);
      setStrangerId('');
    }
  };

  const submit = async () => {
    const recipientId = friendId || strangerId;
    if (!recipientId) return setErr(t('giftPickFriend'));
    if (!deliverAt) return setErr(t('giftErrDateRequired'));
    if (new Date(deliverAt).getTime() < Date.now()) return setErr(t('giftErrDatePast'));
    setSending(true);
    setErr('');
    const res = await api('/api/gifts', {
      method: 'POST',
      body: JSON.stringify({
        recipientId,
        plan,
        message,
        isAnonymous: anonymous,
        deliverAt: deliverAt ? new Date(deliverAt).toISOString() : null,
        lang: typeof window !== 'undefined' ? localStorage.getItem('nexchat_lang') || 'pt' : 'pt',
      }),
    });
    setSending(false);
    if (res.error) return setErr(res.errorKey ? t(res.errorKey) : res.error);
    if (res.approveUrl) window.location.href = res.approveUrl;
  };

  const doRetarget = async () => {
    if (!retargetId) return setErr(t('giftPickFriend'));
    setRetargeting(true);
    setErr('');
    const res = await api('/api/gifts/retarget', {
      method: 'POST',
      body: JSON.stringify({ code: retargetGift.code, recipientId: retargetId, lang: typeof window !== 'undefined' ? localStorage.getItem('nexchat_lang') || 'pt' : 'pt' }),
    });
    setRetargeting(false);
    if (res.error) return setErr(res.errorKey ? t(res.errorKey) : res.error);
    setRetargetGift(null);
    setRetargetId('');
    load();
  };

  const renderRow = (g, sent) => {
    const st = STATUS[g._status] || STATUS.PENDING;
    const who = sent ? g.recipientUsername : (g.isAnonymous ? t('giftAnonTag').replace(/[()]/g, '') : g.giverUsername);
    const whoAvatar = sent ? g.recipientAvatar : (g.isAnonymous ? null : g.giverAvatar);
    return (
      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '10px', marginBottom: '8px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(234,200,71,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {whoAvatar ? (
            <img src={whoAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Gift size={15} color="var(--gold)" />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sent ? t('giftTo') : t('giftFrom')}{who}
            {!sent && g.isAnonymous && <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: 4 }}>{t('giftAnonTag')}</span>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {g.plan === 'yearly' ? t('giftYearly') : t('giftMonthly')} · {money(g.totalAmount)} · {fmtDate(g.createdAt, lang)}
          </div>
          {g.message && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              “{g.message}”
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: st.color, background: `${st.color}1a`, padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
            {t(st.key)}
          </span>
          {g._status === 'REFUSED' && sent && g.paid && new Date(g.expiresAt) > new Date() && (
            <button
              onClick={() => { setRetargetGift(g); setRetargetId(''); setErr(''); }}
              style={{ display: 'block', marginTop: 6, fontSize: '10px', fontWeight: 700, color: 'var(--gold)', background: 'transparent', border: '1px solid var(--gold)', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer' }}
            >
              <RefreshCw size={9} style={{ verticalAlign: '-1px', marginRight: 3 }} /> {t('giftResend')}
            </button>
          )}
          {g._status === 'PENDING' && !sent && (
            <a href={`/gift/${g.code}`} style={{ display: 'block', marginTop: 6, fontSize: '10px', fontWeight: 700, color: '#111', background: 'var(--gold)', borderRadius: '8px', padding: '4px 10px', textDecoration: 'none' }}>
              {t('giftOpen')}
            </a>
          )}
        </div>
      </div>
    );
  };

  const eligible = (friends || []).filter((f) => f.canReceive);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-1, #14141a)', border: '1px solid var(--line)', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gift size={20} color="var(--gold)" />
            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text)' }}>{t('giftTitle')}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {retargetGift ? (
          <>
            <h4 style={{ color: 'var(--text)', fontSize: '13px', margin: '8px 0 10px' }}>
              <RefreshCw size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {t('giftRetargetTitle')} {money(retargetGift.totalAmount)} {t('giftToAnother')}
            </h4>
            <select value={retargetId} onChange={(e) => setRetargetId(e.target.value)} style={{ width: '100%', minHeight: 38, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', fontSize: 13 }}>
              <option value="">{t('giftSelectFriend')}</option>
              {eligible.map((f) => (
                <option key={f.userId} value={f.userId}>{f.username}</option>
              ))}
            </select>
            {eligible.length === 0 && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{t('giftNoEligible')}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={doRetarget} disabled={retargeting} className="btn-primary" style={{ flex: 1, minHeight: 38, fontSize: 12, justifyContent: 'center' }}>
                <Check size={14} /> {retargeting ? t('giftSending') : t('giftConfirmResend')}
              </button>
              <button onClick={() => setRetargetGift(null)} className="btn-secondary" style={{ minHeight: 38, fontSize: 12 }}>{t('cancel')}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[
                { k: 'received', l: t('giftReceived') },
                { k: 'sent', l: t('giftSent') },
                { k: 'send', l: t('giftSend') },
              ].map((tb) => (
                <button
                  key={tb.k}
                  onClick={() => { setTab(tb.k); setErr(''); }}
                  style={{
                    flex: 1, minHeight: 34, fontSize: 12, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
                    background: tab === tb.k ? 'var(--gold)' : 'transparent',
                    color: tab === tb.k ? '#111' : 'var(--muted)',
                    border: tab === tb.k ? '1px solid var(--gold)' : '1px solid var(--line)',
                  }}
                >
                  {tb.k === 'send' && <Send size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />}
                  {tb.l}
                </button>
              ))}
            </div>

            {err && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 10px' }}>{err}</p>}

            {tab !== 'send' && (
              <>
                {loading && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('giftLoading')}</p>}
                {!loading && data && (
                  <>
                    {(tab === 'received' ? data.received : data.sent).length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                        {tab === 'received' ? t('giftNoneReceived') : t('giftNoneSent')}
                      </p>
                    )}
                    {(tab === 'received' ? data.received : data.sent).map((g) => renderRow(g, tab === 'sent'))}
                  </>
                )}
              </>
            )}

            {tab === 'send' && (
              <>
                {!canSend && (
                  <p style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: 12 }}>
                    {t('giftGoogleRequired')}
                  </p>
                )}
                {canSend && (
                  <>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{t('giftFriend')}</label>
                    <select value={friendId} onChange={(e) => { setFriendId(e.target.value); setStrangerId(''); setErr(''); }} style={{ width: '100%', minHeight: 38, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', fontSize: 13, margin: '4px 0 10px' }}>
                      <option value="">{t('giftSelectFriend')}</option>
                      {eligible.map((f) => (
                        <option key={f.userId} value={f.userId}>
                          {f.username} ({f.friendDays}d)
                        </option>
                      ))}
                    </select>

                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block' }}>{t('giftStranger')}</label>
                    <div style={{ display: 'flex', gap: 6, margin: '4px 0 6px' }}>
                      <input
                        value={strangerQuery}
                        onChange={(e) => setStrangerQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') searchStranger(); }}
                        placeholder={t('giftStrangerPlaceholder')}
                        style={{ flex: 1, minHeight: 36, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', fontSize: 12 }}
                      />
                      <button onClick={searchStranger} disabled={strangerSearching} style={{ minHeight: 36, padding: '0 12px', background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Search size={13} /> {t('giftStrangerSearch')}
                      </button>
                    </div>
                    {strangerResults.length > 0 && (
                      <select value={strangerId} onChange={(e) => { setStrangerId(e.target.value); setFriendId(''); setErr(''); }} style={{ width: '100%', minHeight: 36, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--gold)', borderRadius: 8, padding: '0 10px', fontSize: 12, margin: '0 0 8px' }}>
                        <option value="">{t('giftStrangerPick')}</option>
                        {strangerResults.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.username} ({s.customId})
                          </option>
                        ))}
                      </select>
                    )}
                    {strangerQuery.trim().length >= 3 && strangerResults.length === 0 && !strangerSearching && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>{t('giftStrangerNone')}</p>
                    )}

                    {recipientWarn && (
                      <p style={{ fontSize: 11, color: '#f87171', margin: '0 0 8px' }}>
                        {recipientWarn}
                      </p>
                    )}

                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{t('giftPlan')}</label>
                    <div style={{ display: 'flex', gap: 8, margin: '4px 0 10px' }}>
                      {[
                        { k: 'monthly', l: t('giftMonthly'), p: money(monthlyBase) },
                        { k: 'yearly', l: t('giftYearly'), p: money(yearlyBase) },
                      ].map((pl) => (
                        <button
                          key={pl.k}
                          onClick={() => setPlan(pl.k)}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 12,
                            background: plan === pl.k ? 'rgba(234,200,71,0.15)' : 'var(--bg-2)',
                            border: plan === pl.k ? '1px solid var(--gold)' : '1px solid var(--line)',
                            color: 'var(--text)',
                          }}
                        >
                          <div style={{ fontWeight: 800 }}>{pl.l}</div>
                          <div style={{ fontSize: 11, color: 'var(--gold)' }}>{pl.p}</div>
                        </button>
                      ))}
                    </div>

                    {}
                    <div style={{ background: 'rgba(234,200,71,0.07)', border: '1px solid rgba(234,200,71,0.25)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', marginBottom: 6 }}>{t('giftBreakdown')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('giftBase')} ({planName})</span>
                        <b>{money(basePrice)}</b>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span>{t('giftFee')}{isFriendRecipient ? ' (+15%)' : ' (+30%)'}</span>
                        <b style={{ color: '#f87171' }}>+{Math.round(feePct * 100)}% ({money(fee)})</b>
                      </div>
                      <div style={{ borderTop: '1px dashed rgba(234,200,71,0.3)', margin: '8px 0 6px' }} />
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('giftTotal')}</span>
                        <span style={{ color: 'var(--gold)' }}>{money(total)}</span>
                      </div>
                    </div>

                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{t('giftMessageLabel')}</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={300}
                      placeholder={t('giftMessagePlaceholder')}
                      style={{ width: '100%', minHeight: 64, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontSize: 13, margin: '4px 0 8px', resize: 'vertical' }}
                    />

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', marginBottom: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                      {t('giftAnonymous')}
                    </label>

                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block' }}>{t('giftSchedule')}</label>
                    <input
                      type="datetime-local"
                      value={deliverAt}
                      onChange={(e) => setDeliverAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      required
                      style={{ width: '100%', minHeight: 38, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px', fontSize: 13, margin: '4px 0 10px' }}
                    />
                    <p style={{ fontSize: 10, color: 'var(--muted)', margin: '-6px 0 10px' }}>{t('giftScheduleHint')}</p>

                    <button onClick={submit} disabled={sending || !selected?.canReceive} className="btn-primary" style={{ width: '100%', minHeight: 44, justifyContent: 'center', fontSize: 13 }}>
                      <Crown size={15} /> {sending ? t('giftPreparing') : t('giftPay')}
                    </button>
                    {!isFriendRecipient && !strangerId && (
                      <p style={{ fontSize: 10, color: 'var(--muted)', margin: '8px 0 0', textAlign: 'center' }}>{t('giftStrangerFeeNote')}</p>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
            <PartyPopper size={11} /> {t('giftExpiryNote')}
          </span>
        </div>
      </div>
    </div>
  );
}