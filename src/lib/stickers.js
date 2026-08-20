export const STICKERS = [
  { id: 'premium1', emoji: '👑', label: 'Coroa', premium: true },
  { id: 'premium2', emoji: '💎', label: 'Diamante', premium: true },
  { id: 'premium3', emoji: '🚀', label: 'Foguete', premium: true },
  { id: 'premium4', emoji: '🔥', label: 'Fogo', premium: true },
  { id: 'premium5', emoji: '⚡', label: 'Raio', premium: true },
  { id: 'premium6', emoji: '💯', label: 'Cem', premium: true },
  { id: 'premium7', emoji: '🥇', label: 'Ouro', premium: true },
  { id: 'premium8', emoji: '😎', label: 'Descolado', premium: true },
  { id: 'premium9', emoji: '🤝', label: 'Aperto', premium: true },
  { id: 'premium10', emoji: '🎉', label: 'Festa', premium: true },
  { id: 'premium11', emoji: '❤️', label: 'Coração', premium: true },
  { id: 'premium12', emoji: '💘', label: 'Paixão', premium: true },
  { id: 'premium13', emoji: '😜', label: 'Brincadeira', premium: true },
  { id: 'premium14', emoji: '🤣', label: 'Riso', premium: true },
  { id: 'premium15', emoji: '🤩', label: 'Impressionado', premium: true },
  { id: 'premium16', emoji: '🤑', label: 'Rico', premium: true },
  { id: 'free1', emoji: '😀', label: 'Sorriso', premium: false },
  { id: 'free2', emoji: '👍', label: 'Joinha', premium: false },
  { id: 'free3', emoji: '🙏', label: 'Por favor', premium: false },
  { id: 'free4', emoji: '👋', label: 'Tchau', premium: false },
  { id: 'free5', emoji: '😅', label: 'Suor', premium: false },
  { id: 'free6', emoji: '🐱', label: 'Gato', premium: false },
  { id: 'free7', emoji: '🍕', label: 'Pizza', premium: false },
  { id: 'free8', emoji: '🌹', label: 'Rosa', premium: false }
];

export const STICKER_IDS = new Set(STICKERS.map(s => s.id));

export function getSticker(stickerId) {
  return STICKERS.find(s => s.id === stickerId) || null;
}
