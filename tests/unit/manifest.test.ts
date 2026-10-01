import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../src/shared/manifest';

describe('buildManifest', () => {
  it('asks for only the minimal permissions in production', () => {
    const manifest = buildManifest('production');
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
    expect(manifest.host_permissions).toEqual(['https://api.anthropic.com/*']);
    // Optional: nothing is granted until the user opts in to re-apply on reload for an origin.
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
  });

  it('adds host access only in the e2e build', () => {
    expect(buildManifest('e2e').host_permissions).toEqual([
      'https://api.anthropic.com/*',
      '<all_urls>',
    ]);
    expect(buildManifest('development').host_permissions).toEqual(['https://api.anthropic.com/*']);
  });
});
