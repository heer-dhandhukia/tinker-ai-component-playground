export const PERMISSIONS = ['activeTab', 'scripting', 'sidePanel', 'storage'] as const;
export const ANTHROPIC_HOST = 'https://api.anthropic.com/*';
// Playwright cannot click the toolbar action, so activeTab is never granted in e2e.
// The e2e build (and only that build) gets host access instead. It has to be <all_urls>:
// captureVisibleTab accepts nothing narrower in place of activeTab.
export const E2E_HOST = '<all_urls>';
// Never granted at install. Requested for one origin at a time, when the user turns on
// "re-apply on reload" for a page on that origin.
export const OPTIONAL_HOSTS = ['http://*/*', 'https://*/*'] as const;

export interface TinkerManifest {
  name: string;
  description: string;
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  action: { default_title: string };
}

export function buildManifest(mode: string): TinkerManifest {
  return {
    name: 'Tinker',
    description: 'Experiment with UI directly on a running web page.',
    permissions: [...PERMISSIONS],
    host_permissions: mode === 'e2e' ? [ANTHROPIC_HOST, E2E_HOST] : [ANTHROPIC_HOST],
    optional_host_permissions: [...OPTIONAL_HOSTS],
    action: { default_title: 'Tinker with this page' },
  };
}
