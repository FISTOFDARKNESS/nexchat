'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

export default function BannedPage() {
  const [ban, setBan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        <p>Carregando...</p>
      </div>
    );
  }

  if (!ban) return null;

  const expiresText = ban.expiresAt
    ? new Date(ban.expiresAt).toLocaleString('pt-BR')
    : 'Permanente';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: '24px' }}>
      <div className="glass-card animate-slide-in" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--red)', textAlign: 'center', padding: '32px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <ShieldAlert size={28} style={{ color: 'var(--red)' }} />
        </div>
        <h1 style={{ fontSize: '22px', color: 'var(--red)', marginBottom: '8px' }}>Conta suspensa</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.5' }}>
          Sua conta foi suspensa por violar nossas diretrizes.
        </p>
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', textAlign: 'left', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text)' }}><strong>Motivo:</strong> {ban.reason}</p>
          <p style={{ fontSize: '12px', color: 'var(--muted)' }}><strong>Expira em:</strong> {expiresText}</p>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)' }}>
          Se achar que isso é um engano, entre em contato com o suporte.
        </p>
      </div>
    </div>
  );
}
