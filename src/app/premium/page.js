'use client';

import { useEffect, useState } from 'react';
import { Crown, Check, Zap } from 'lucide-react';

export default function PremiumPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

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
        if (data.success) setStatus(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
      setLoading(true);
      fetch('/api/premium/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('nexchat_token')}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) setStatus(data);
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <p>Carregando...</p>
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
          Desbloqueie recursos exclusivos e aproveite o app sem limites.
        </p>

        {isPremium ? (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Zap size={16} style={{ color: 'var(--gold)' }} />
              <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)' }}>Plano Ativo</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text)' }}>Expira em: {status.premiumExpiresAt ? new Date(status.premiumExpiresAt).toLocaleString('pt-BR') : '-'}</p>
            <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Tema: {status.chatTheme || 'Padrão'}</p>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>R$ 34,99</span>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>/mês</span>
            </div>
            <ul style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.6', paddingLeft: '16px', margin: 0 }}>
              <li>Upload até 50 MB (foto/vídeo/áudio)</li>
              <li>Grupos ilimitados + até 100 membros</li>
              <li>Mensagens de até 5000 caracteres</li>
              <li>Até 50 mensagens fixadas</li>
              <li>Prioridade no matchmaking</li>
              <li>Chamadas em grupo com até 8 pessoas</li>
              <li>Mudar nome a qualquer momento</li>
              <li>Modo invisível + temas personalizados</li>
              <li>Exportar histórico do chat (JSON)</li>
            </ul>
          </div>
        )}

        {!isPremium && (
          <button
            onClick={handleBuy}
            disabled={buying}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', minHeight: '44px', background: 'var(--gold)', color: '#000', fontWeight: '700' }}
          >
            {buying ? 'Redirecionando...' : 'Assinar Premium'}
          </button>
        )}

        <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '12px' }}>
          Pagamento seguro via PayPal. Cancele quando quiser.
        </p>

        <button onClick={() => { window.location.href = '/'; }} className="btn-secondary" style={{ minHeight: '40px', marginTop: '8px' }}>
          Voltar para o chat
        </button>
      </div>
    </div>
  );
}
