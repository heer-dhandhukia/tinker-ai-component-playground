// The review page: load a changeset, read the proposed diffs, choose where each element's
// change goes, approve. Plain HTML and script, served only on 127.0.0.1.
export const REVIEW_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tinker companion</title>
<style>
  :root { color-scheme: light dark; font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  body { max-width: 980px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 0; }
  .muted { opacity: .7; } .mono, pre, textarea { font: 12px/1.5 ui-monospace, 'SF Mono', Menlo, monospace; }
  textarea { width: 100%; box-sizing: border-box; padding: 8px; }
  button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); background: transparent; color: inherit; cursor: pointer; }
  button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; } button:disabled { opacity: .4; cursor: default; }
  .element { margin-top: 16px; padding: 12px 14px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; }
  .option { margin-top: 10px; } .option label { display: flex; gap: 8px; align-items: baseline; }
  .unresolved { opacity: .75; } .reason { margin: 2px 0 0 24px; }
  pre.diff { margin: 6px 0 0 24px; padding: 8px 10px; overflow: auto; border-radius: 6px; background: color-mix(in srgb, currentColor 6%, transparent); }
  .add { color: #15803d; } .del { color: #b91c1c; } .hunk { opacity: .6; }
  .note { margin-top: 8px; padding: 6px 10px; border-radius: 6px; background: color-mix(in srgb, #d97706 18%, transparent); }
  .bar { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
  #result { margin-top: 16px; }
</style>
</head>
<body>
<h1>Tinker companion</h1>
<p class="muted">Project: <span class="mono" id="root"></span>. Nothing is written until you press "Apply approved changes".</p>

<section id="load">
  <p>Paste a JSON changeset exported from Tinker, or choose the downloaded file.</p>
  <textarea id="changeset" rows="8" aria-label="Changeset JSON" placeholder='{ "version": 1, "tool": "tinker", … }'></textarea>
  <div class="bar">
    <input type="file" id="file" accept="application/json,.json" aria-label="Changeset file">
    <button class="primary" id="plan">Show proposed edits</button>
  </div>
</section>
<p id="error" class="note" hidden role="alert"></p>
<section id="review" hidden>
  <div id="elements"></div>
  <div class="bar">
    <button class="primary" id="apply">Apply approved changes</button>
    <span class="muted" id="summary"></span>
  </div>
</section>
<section id="result" hidden></section>

<script>
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const $ = (id) => document.getElementById(id);
let plan = null;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) node.append(child);
  return node;
}

async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tinker-token': token }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: 'The companion returned an unreadable response.' }));
  if (!response.ok) throw new Error(data.error || 'Request failed (' + response.status + ')');
  return data;
}

function showError(message) { $('error').textContent = message; $('error').hidden = !message; }

function renderDiff(diff) {
  const pre = el('pre', { class: 'diff' });
  for (const line of diff.split('\\n')) {
    const kind = line.startsWith('@@') ? 'hunk' : line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : '';
    pre.append(el('span', { class: kind, text: line + '\\n' }));
  }
  return pre;
}

function updateSummary() {
  const chosen = [...document.querySelectorAll('input[type=radio]:checked')].filter((input) => input.value !== '');
  $('summary').textContent = chosen.length + ' of ' + plan.elements.length + ' elements will be written';
  $('apply').disabled = chosen.length === 0;
}

function renderPlan() {
  $('elements').replaceChildren(...plan.elements.map((element) => {
    const name = 'element-' + element.index;
    const options = element.options.map((option) => {
      const ready = option.status === 'ready';
      const input = el('input', { type: 'radio', name, value: option.id });
      if (!ready) input.disabled = true;
      if (option.id === element.defaultOption) input.checked = true;
      const scope = option.scope === 'shared' ? ' (affects every element that uses it)' : ' (this element only)';
      return el('div', { class: ready ? 'option' : 'option unresolved' }, [
        el('label', {}, [input, el('span', { text: option.label + (ready ? scope : '') })]),
        ready ? renderDiff(option.diff) : el('p', { class: 'reason muted', text: 'Not available: ' + option.reason }),
      ]);
    });
    const skip = el('input', { type: 'radio', name, value: '' });
    if (!element.defaultOption) skip.checked = true;
    return el('div', { class: 'element' }, [
      el('h2', { text: (element.index + 1) + '. ' + element.title }),
      el('p', { class: 'mono muted', text: element.changes.join('; ') || 'no style changes' }),
      ...element.skipped.map((note) => el('p', { class: 'note', text: note })),
      ...options,
      el('div', { class: 'option' }, el('label', {}, [skip, el('span', { text: 'Do not write this element' })])),
    ]);
  }));
  document.querySelectorAll('input[type=radio]').forEach((input) => input.addEventListener('change', updateSummary));
  $('review').hidden = false;
  $('result').hidden = true;
  updateSummary();
}

$('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) $('changeset').value = await file.text();
});

$('plan').addEventListener('click', async () => {
  showError('');
  let changeset;
  try { changeset = JSON.parse($('changeset').value); } catch { return showError('That is not valid JSON.'); }
  try { plan = await api('/api/plan', { changeset }); renderPlan(); } catch (error) { showError(error.message); }
});

$('apply').addEventListener('click', async () => {
  const approved = [...document.querySelectorAll('input[type=radio]:checked')].map((input) => input.value).filter(Boolean);
  if (!confirm('Write ' + approved.length + ' approved change(s) to the source files in ' + plan.root + '?')) return;
  showError('');
  try {
    const result = await api('/api/apply', { planId: plan.id, approved });
    $('review').hidden = true;
    $('result').replaceChildren(
      el('h2', { text: result.written.length + ' file(s) written' }),
      ...result.written.map((entry) => el('div', {}, [el('p', { class: 'mono', text: entry.file }), renderDiff(entry.diff)])),
      ...result.failed.map((entry) => el('p', { class: 'note', text: 'Not written: ' + (entry.file || entry.option) + ' — ' + entry.reason })),
    );
    $('result').hidden = false;
  } catch (error) { showError(error.message); }
});

fetch('/api/info', { headers: { 'x-tinker-token': token } }).then((r) => r.json()).then((info) => {
  if (info.error) showError(info.error + ' Open the link printed in the terminal.'); else $('root').textContent = info.root;
});
</script>
</body>
</html>
`;
