import { createServer } from 'vite';

(async () => {
  const server = await createServer({
    root: '.',
    server: {
      host: '0.0.0.0',
      port: 1420,
    },
  });
  await server.listen();
  console.log('Vite dev server running on http://0.0.0.0:1420');
})();
