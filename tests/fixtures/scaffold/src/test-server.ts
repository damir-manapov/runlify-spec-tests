/**
 * Test entry point — starts Express with Apollo GraphQL server.
 * Outputs { port } to stdout so the test runner can connect.
 */
import express from 'express';
import {ApolloServer} from 'apollo-server-express';
import getSchema from './graph/schema';
import {createContext} from './adm/services/context';
import restRouter from './rest/restRouter';

const start = async () => {
  const app = express();

  app.get('/healthz', (_req, res) => {
    res.json({status: 'ok'});
  });

  app.use('/api', restRouter);

  const context = await createContext();
  const schema = await getSchema();

  const apolloServer = new ApolloServer({
    schema,
    context: () => ({context}),
    introspection: true,
  });

  await apolloServer.start();
  apolloServer.applyMiddleware({app, path: '/graphql'});

  const server = app.listen(0, () => {
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      console.log(JSON.stringify({port: addr.port}));
    }
  });

  const shutdown = async () => {
    await apolloServer.stop();
    await context.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
