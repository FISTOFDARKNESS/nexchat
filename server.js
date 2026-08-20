const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { createServer } = require('http');
const next = require('next');
const { handleHttpRequest, attachWebSocket } = require('./ws-server/core');

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET não definido. Defina a variável de ambiente JWT_SECRET (segredo forte) antes de iniciar o servidor.');
  process.exit(1);
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    
    if (path.startsWith('/internal/') || path === '/health' || path.startsWith('/health/v1')) {
      return handleHttpRequest(req, res);
    }
    return handle(req, res);
  });

  attachWebSocket(server);

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> NexChat ready on http://localhost:${port} (Next.js + WebSocket)`);
  });
});
