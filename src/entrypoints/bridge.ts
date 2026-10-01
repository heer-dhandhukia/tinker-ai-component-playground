import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { startBridge } from '../bridge/boot';

// Runs in the page's MAIN world (injected by the background via chrome.scripting).
// It has no extension APIs and must never expose anything privileged to the page.
export default defineUnlistedScript(() => {
  startBridge();
});
