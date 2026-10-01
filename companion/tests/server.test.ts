import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';
import { golden, read, tempProject } from './helpers';

let server: Awaited<ReturnType<typeof startServer>>;
let root: string;
beforeEach(async () => {
  root = tempProject();
  server = await startServer({ root, port: 0 });
});
afterEach(() => server.close());

const base = () => `http://127.0.0.1:${server.port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tinker-token': server.token, ...headers },
    body: JSON.stringify(body),
  });

describe('companion server', () => {
  it('listens on loopback only and serves the review page', async () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#token=[0-9a-f]{48}$/);
    const page = await fetch(base());
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await page.text();
    expect(html).toContain('Tinker companion');
    expect(html).not.toContain(server.token); // the token only travels in the link's fragment
  });

  it('refuses API calls without the session token', async () => {
    for (const token of ['', 'wrong', `${server.token}x`]) {
      const response = await post('/api/plan', { changeset: golden('css-modules-card') }, { 'x-tinker-token': token });
      expect(response.status).toBe(401);
    }
  });

  it('refuses other origins and unexpected hosts, even with the token', async () => {
    const crossOrigin = await post('/api/plan', { changeset: golden('css-modules-card') }, { origin: 'https://evil.example' });
    expect(crossOrigin.status).toBe(403);
    // fetch() will not send a forged Host header, so use a raw request (this is DNS rebinding).
    const reboundStatus = await new Promise<number>((resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port: server.port, path: '/api/info', method: 'GET', headers: { host: 'evil.example', 'x-tinker-token': server.token } },
        (response) => resolve(response.statusCode ?? 0),
      );
      request.on('error', reject);
      request.end();
    });
    expect(reboundStatus).toBe(403);
  });

  it('plans, then writes only what was approved', async () => {
    const plan = await (await post('/api/plan', { changeset: golden('css-modules-card') })).json();
    expect(plan.elements[0].options[0]).toMatchObject({ status: 'ready', file: 'src/components/UserCard.module.css' });
    expect(plan).not.toHaveProperty('internal');
    expect(read(root, 'src/components/UserCard.module.css')).not.toContain('padding-top'); // planning wrote nothing

    const nothing = await (await post('/api/apply', { planId: plan.id, approved: [] })).json();
    expect(nothing).toEqual({ written: [], failed: [] });

    const result = await (await post('/api/apply', { planId: plan.id, approved: [plan.elements[0].defaultOption] })).json();
    expect(result.written.map((entry: any) => entry.file)).toEqual(['src/components/UserCard.module.css']);
    expect(read(root, 'src/components/UserCard.module.css')).toContain('padding-top: var(--space-3);');
  });

  it('rejects bad input without leaking details', async () => {
    expect((await post('/api/plan', { changeset: { version: 2 } })).status).toBe(400);
    expect((await post('/api/apply', { planId: 'nope', approved: [] })).status).toBe(404);
    const notJson = await fetch(`${base()}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tinker-token': server.token }, body: '{' });
    expect(notJson.status).toBe(400);
    const wrongType = await fetch(`${base()}/api/plan`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-tinker-token': server.token }, body: '{}' });
    expect(wrongType.status).toBe(415);
    expect((await fetch(`${base()}/etc/passwd`)).status).toBe(404);
  });
});
