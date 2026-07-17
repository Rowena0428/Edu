import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

const { app } = await import('../server.js');

test('POST /api/process should be handled by the local server', async () => {
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const response = await fetch(`http://127.0.0.1:${port}/api/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chatRoomId: 'chinese', text: '請生成一份測試題目', action: 'generate', mode: 'generate' }),
  });

  const body = await response.json().catch(() => ({}));
  assert.notEqual(response.status, 404, 'expected /api/process to be available');
  assert.ok(body.error === undefined || body.success === true || body.text !== undefined, 'expected a valid API response body');

  server.close();
  await once(server, 'close');
});
