// Dumps what React actually attaches to DOM nodes in both fixture apps, so the bridge is built
// on observed keys and fields rather than assumptions. Needs both fixture dev servers running.
//   node scripts/dump-fibers.mjs
import { chromium } from '@playwright/test';

const TARGETS = [
  {
    name: 'playground-app (React 19)',
    url: 'http://localhost:5173/',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Show promo' }).click();
      await page.getByRole('button', { name: 'Open settings' }).click();
      await page.waitForSelector('.MuiDialog-paper');
    },
    selectors: [
      'nav.navbar',
      '[data-section="css-modules"] h2',
      '[data-section="styled-components"] button',
      '[data-section="mui"] button',
      '.MuiDialog-paper',
      '[data-section="tailwind"] > div',
      '[data-testid="timer"]',
      '[data-testid="todo-items"] li',
      '[data-testid="promo-banner"]',
    ],
  },
  {
    name: 'react18-app (React 18)',
    url: 'http://localhost:5174/',
    prepare: async () => {},
    selectors: ['.profile-card', '.avatar', '.badge'],
  },
];

function inspect(selectors) {
  const typeName = (type) => {
    if (type == null) return null;
    if (typeof type === 'string') return `host:${type}`;
    if (typeof type === 'function') return type.displayName || type.name || '(anonymous fn)';
    if (typeof type === 'object') {
      const inner = type.render || type.type;
      const tag = String(type.$$typeof);
      const name = type.displayName || (inner && (inner.displayName || inner.name)) || '';
      return `${tag}:${name}`;
    }
    return typeof type;
  };
  const describe = (value) => {
    if (value == null) return value;
    if (value instanceof Error) return { kind: 'Error', stack: String(value.stack).split('\n').slice(0, 6) };
    if (typeof value === 'object') {
      if ('tag' in value && 'return' in value) return `fiber<${typeName(value.type)}>`;
      const out = {};
      for (const k of Object.keys(value).slice(0, 12)) {
        const v = value[k];
        out[k] = v instanceof Error
          ? { kind: 'Error', stack: String(v.stack).split('\n').slice(0, 6) }
          : typeof v === 'object' && v !== null ? `[${v.constructor?.name ?? 'object'}]` : typeof v === 'function' ? '[fn]' : v;
      }
      return out;
    }
    return typeof value === 'function' ? '[fn]' : value;
  };

  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const renderers = hook?.renderers ? [...hook.renderers.values()].map((r) => ({
    version: r.version, bundleType: r.bundleType, rendererPackageName: r.rendererPackageName,
    keys: Object.keys(r),
  })) : null;
  const root = document.getElementById('root');

  return {
    hook: hook ? { keys: Object.keys(hook), renderers } : null,
    rootContainerKeys: root ? Object.keys(root).filter((k) => k.startsWith('__react') || k.startsWith('_react')) : [],
    elements: selectors.map((selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, missing: true };
      const reactKeys = Object.keys(el).filter((k) => k.startsWith('__react'));
      const fiberKey = reactKeys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      const fiber = fiberKey ? el[fiberKey] : null;
      if (!fiber) return { selector, reactKeys, fiber: null };

      const debugFields = {};
      for (const k of Object.keys(fiber).filter((k) => k.startsWith('_debug'))) debugFields[k] = describe(fiber[k]);

      const returnChain = [];
      for (let f = fiber.return; f; f = f.return) returnChain.push({ tag: f.tag, type: typeName(f.type) });
      const ownerChain = [];
      for (let o = fiber._debugOwner; o; o = o._debugOwner ?? o.owner) {
        ownerChain.push({
          type: 'tag' in o ? typeName(o.type) : `non-fiber:${o.name}`,
          debugSource: describe(o._debugSource),
          hasDebugStack: Boolean(o._debugStack ?? o.debugStack),
        });
      }
      const propsKey = reactKeys.find((k) => k.startsWith('__reactProps$'));
      return {
        selector, reactKeys, fiberTag: fiber.tag, fiberKeys: Object.keys(fiber),
        debugFields, returnChain: returnChain.slice(0, 14), ownerChain,
        domPropsKeys: propsKey ? Object.keys(el[propsKey]) : null,
      };
    }),
  };
}

const browser = await chromium.launch();
for (const target of TARGETS) {
  const page = await browser.newPage();
  await page.goto(target.url);
  await target.prepare(page);
  console.log(`\n===== ${target.name} =====`);
  console.log(JSON.stringify(await page.evaluate(inspect, target.selectors), null, 1));
  await page.close();
}
await browser.close();
