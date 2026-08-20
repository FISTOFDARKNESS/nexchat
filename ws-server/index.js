const http = require('http');
const { handleHttpRequest, attachWebSocket } = require('./core');

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET não definido. Defina a variável de ambiente JWT_SECRET antes de iniciar o ws-server.');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 8080;

const server = http.createServer(handleHttpRequest);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`[ws-server] listening on port ${PORT}`);
});
