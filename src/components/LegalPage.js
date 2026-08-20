'use client';

import { useRef } from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import { LEGAL_CONTENT } from '@/lib/legal-content';
import ScrollHint from '@/components/ScrollHint';
import { t } from '@/lib/i18n';
import { ArrowLeft, Scale } from 'lucide-react';

export default function LegalPage({ doc }) {
  const { lang, setLang } = useLanguage();
  const content = LEGAL_CONTENT[doc]?.[lang] || LEGAL_CONTENT[doc]?.en;
  const scrollRef = useRef(null);

  return (
    <div ref={scrollRef} style={{ position: 'relative', height: '100dvh', overflowY: 'auto', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center' }}>
      <ScrollHint containerRef={scrollRef} label={t('scrollToRead')} />
      <div style={{ width: '100%', maxWidth: '760px', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
            className="btn-secondary"
            style={{ minHeight: '36px', fontSize: '12px' }}
          >
            <ArrowLeft size={14} style={{ marginRight: '6px' }} /> {t('back')}
          </button>
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            style={{ background: 'var(--bg-2)', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="it">Italiano</option>
          </select>
        </div>

        <div className="gold-glow-card" style={{ borderRadius: '16px', padding: '32px 28px', textAlign: 'left' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--gold-soft)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Scale size={26} style={{ color: 'var(--gold)' }} />
          </div>
          <h1 style={{ fontSize: '24px', color: 'var(--gold)', textAlign: 'center', marginBottom: '12px' }}>{content.title}</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '24px', textAlign: 'center' }}>{content.intro}</p>

          {content.sections.map(s => (
            <div key={s.h} style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '14px', color: 'var(--gold)', marginBottom: '8px', fontWeight: '700' }}>{s.h}</h2>
              <ul style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.7', paddingLeft: '18px', margin: 0 }}>
                {s.items.map((item, i) => <li key={i} style={{ marginBottom: '6px' }}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: '10px', color: 'var(--muted)', marginTop: '20px' }}>
          NexChat — {t('lastUpdated').replace('{date}', lang === 'pt' ? '12 de agosto de 2026' : lang === 'it' ? '12 agosto 2026' : 'August 12, 2026')}
        </p>
      </div>
    </div>
  );
}