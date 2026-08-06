import "./globals.css";

export const metadata = {
  title: "NexChat - Amigos, Matchmaking e Videochamadas",
  description: "Conecte-se com amigos e faça chamadas de vídeo aleatórias instantaneamente.",
  manifest: "/manifest.json",
  themeColor: "#EAC847",
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
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#EAC847" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
