import "./globals.css";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Erro ao registrar service worker:', err);
    });
  });
}

export const metadata = {
  title: "NexChat - Amigos, Matchmaking e Videochamadas",
  description: "Conecte-se com amigos e faça chamadas de vídeo aleatórias instantaneamente.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NexChat",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#EAC847",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#EAC847" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
