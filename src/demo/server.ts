import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createDemoApp } from './app.js';

const { app } = createDemoApp();
const assets = fileURLToPath(new URL('../../apps/staff-web/dist/', import.meta.url));
// The compiled file lives in dist/demo; the source entry is in src/demo.
app.use(express.static(assets));
app.get('*', (_req, res) => res.sendFile(assets + 'index.html'));
const server = createServer(app);
const port = Number(process.env.PORT ?? 4173);
server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log('Restaurant Call Agent demo: http://127.0.0.1:' + port)
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
