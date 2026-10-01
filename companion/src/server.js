import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { applyPlan, createPlan, publicPlan } from './plan.js';
import { createProject } from './project.js';
import { REVIEW_PAGE } from './ui.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PLANS = 5;

const sameToken = (given, expected) => {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

function send(response, status, body, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  response.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    // The page only talks to this server and loads nothing from elsewhere.
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'",
  });
  response.end(payload);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('The request is too large.'), { status: 413 }));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('The request body is not valid JSON.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

/**
 * Starts the companion on 127.0.0.1. Every API call needs the session token, and requests
 * whose Host or Origin is not this server are refused (other websites, DNS rebinding).
 * @param {{ root: string, port?: number }} options
 */
export async function startServer({ root, port = 4317 }) {
  const project = createProject(root);
  const token = randomBytes(24).toString('hex');
  /** @type {Map<string, ReturnType<typeof createPlan>>} */
  const plans = new Map();

  const server = http.createServer(async (request, response) => {
    try {
      const address = /** @type {import('node:net').AddressInfo} */ (server.address());
      const allowedHosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
      if (!allowedHosts.has(request.headers.host ?? '')) return send(response, 403, { error: 'Unexpected Host header.' });
      const origin = request.headers.origin;
      if (origin && !allowedHosts.has(origin.replace(/^http:\/\//, ''))) return send(response, 403, { error: 'Cross-origin requests are not accepted.' });

      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (request.method === 'GET' && url.pathname === '/') return send(response, 200, REVIEW_PAGE, 'text/html');
      if (!url.pathname.startsWith('/api/')) return send(response, 404, { error: 'Not found.' });
      if (!sameToken(request.headers['x-tinker-token'], token)) return send(response, 401, { error: 'Missing or wrong session token.' });

      if (request.method === 'GET' && url.pathname === '/api/info') return send(response, 200, { root: project.root });
      if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' });
      if (!(request.headers['content-type'] ?? '').startsWith('application/json')) return send(response, 415, { error: 'Send JSON.' });
      const body = await readJson(request);

      if (url.pathname === '/api/plan') {
        let plan;
        try {
          plan = createPlan(project.root, body?.changeset);
        } catch {
          return send(response, 400, { error: 'That is not a Tinker changeset (version 1).' });
        }
        plans.set(plan.id, plan);
        while (plans.size > MAX_PLANS) plans.delete(plans.keys().next().value);
        return send(response, 200, publicPlan(plan));
      }

      if (url.pathname === '/api/apply') {
        const plan = plans.get(body?.planId);
        if (!plan) return send(response, 404, { error: 'That plan is no longer available; create a new one.' });
        const approved = Array.isArray(body.approved) ? body.approved.filter((id) => typeof id === 'string') : [];
        return send(response, 200, applyPlan(plan, approved));
      }
      return send(response, 404, { error: 'Not found.' });
    } catch (error) {
      return send(response, error.status ?? 500, { error: error.status ? error.message : 'The companion hit an internal error.' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const { port: actualPort } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    token,
    port: actualPort,
    root: project.root,
    url: `http://127.0.0.1:${actualPort}/#token=${token}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        // Browsers keep connections alive; without this, close() would wait for them.
        server.closeAllConnections();
      }),
  };
}
