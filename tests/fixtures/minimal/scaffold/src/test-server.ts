/**
 * Minimal test entry point for the generated backend.
 * Starts Express with the generated restRouter on a random port
 * and outputs { port } to stdout so the test runner can connect.
 */
import express from 'express';
import restRouter from './rest/restRouter';

const app = express();

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', restRouter);

const server = app.listen(0, () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    // The test runner reads this line to discover the port
    console.log(JSON.stringify({ port: addr.port }));
  }
});

const shutdown = () => {
  server.close(() => process.exit(0));
  // Force exit after 3s if connections hang
  setTimeout(() => process.exit(1), 3000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
