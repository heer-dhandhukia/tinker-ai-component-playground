const MAX_DEPTH = 3;
const MAX_KEYS = 30;
const MAX_ITEMS = 20;
const MAX_STRING = 200;

function elementTypeName(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return (type as { displayName?: string }).displayName || type.name || 'Anonymous';
  if (typeof type === 'object' && type !== null) {
    const named = type as { displayName?: unknown };
    if (typeof named.displayName === 'string') return named.displayName;
  }
  return 'Component';
}

/**
 * Turns arbitrary page values (component props) into small, structured-cloneable data:
 * depth-limited, functions as "[fn]", no DOM nodes, no React elements, no cycles.
 * Page objects can have hostile getters, so every read is guarded.
 */
export function safeSerialize(value: unknown): unknown {
  return serialize(value, 0, []);
}

function serialize(value: unknown, depth: number, ancestors: object[]): unknown {
  switch (typeof value) {
    case 'string':
      return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
    case 'undefined':
      return value;
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return '[symbol]';
    case 'function':
      return '[fn]';
  }
  if (value === null) return null;
  const object = value as Record<string, unknown>;

  try {
    if (ancestors.includes(object)) return '[circular]';
    if (typeof object.nodeType === 'number' && typeof object.nodeName === 'string') return '[DOM node]';
    if (typeof object.$$typeof === 'symbol') return `[element <${elementTypeName(object.type)}>]`;
    if (object instanceof Date) return Number.isNaN(object.getTime()) ? '[date]' : object.toISOString();

    const isArray = Array.isArray(object);
    if (depth >= MAX_DEPTH) return isArray ? '[array]' : '[object]';
    const path = [...ancestors, object];

    if (isArray) {
      const items = object.slice(0, MAX_ITEMS).map((item) => serialize(item, depth + 1, path));
      if (object.length > MAX_ITEMS) items.push(`… ${object.length - MAX_ITEMS} more`);
      return items;
    }

    const keys = Object.keys(object);
    const out: Record<string, unknown> = {};
    for (const key of keys.slice(0, MAX_KEYS)) {
      try {
        out[key] = serialize(object[key], depth + 1, path);
      } catch {
        out[key] = '[unreadable]';
      }
    }
    if (keys.length > MAX_KEYS) out['…'] = `${keys.length - MAX_KEYS} more`;
    return out;
  } catch {
    return '[unreadable]';
  }
}
