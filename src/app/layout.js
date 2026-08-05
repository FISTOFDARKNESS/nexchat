import "./globals.css";

export const metadata = {
  title: "NexChat - Amigos, Matchmaking e Videochamadas",
  description: "Conecte-se com amigos e faça chamadas de vídeo aleatórias instantaneamente.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
