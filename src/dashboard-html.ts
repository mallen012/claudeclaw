export const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ClaudeClaw Dashboard</title>
<style>
  :root {
    --bg: #0a0e14;
    --panel: #12161f;
    --panel-raised: #1a1f2b;
    --border: #232836;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #7c9cf0;
    --accent-2: #c9a3ff;
    --success: #3fb950;
    --danger: #f85149;
    --warning: #d29922;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 14px; }
  .blur-sensitive .sensitive { filter: blur(6px); transition: filter .2s; }
  .blur-sensitive .sensitive:hover { filter: blur(0); }
  header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; border-bottom: 1px solid var(--border); background: var(--panel); position: sticky; top: 0; z-index: 10; }
  header h1 { font-size: 16px; margin: 0; letter-spacing: 0.5px; }
  header nav { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }
  header nav button { background: transparent; color: var(--muted); border: 1px solid transparent; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
  header nav button:hover { background: var(--panel-raised); color: var(--text); }
  header nav button.active { background: var(--panel-raised); color: var(--text); border-color: var(--border); }
  header .spacer { flex: 1; }
  main { padding: 24px; max-width: 1400px; margin: 0 auto; }
  .grid { display: grid; gap: 16px; }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .card h2 { margin: 0 0 12px 0; font-size: 14px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .stat { font-size: 28px; font-weight: 600; margin: 4px 0 0 0; }
  .stat-label { color: var(--muted); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  tr:last-child td { border-bottom: none; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 12px; background: var(--panel-raised); font-size: 11px; color: var(--muted); }
  .pill.success { color: var(--success); border: 1px solid var(--success); }
  .pill.danger { color: var(--danger); border: 1px solid var(--danger); }
  .pill.warning { color: var(--warning); border: 1px solid var(--warning); }
  .pill.accent { color: var(--accent); border: 1px solid var(--accent); }
  button.primary { background: var(--accent); color: #0a0e14; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; font-size: 13px; }
  button.primary:hover { filter: brightness(1.1); }
  button.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
  button.ghost:hover { background: var(--panel-raised); }
  input, textarea, select { background: var(--panel-raised); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; width: 100%; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); }
  .flex { display: flex; gap: 8px; align-items: center; }
  .flex-col { display: flex; flex-direction: column; gap: 12px; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .memory-item { border-left: 3px solid var(--border); padding: 10px 12px; margin-bottom: 8px; background: var(--panel-raised); border-radius: 0 6px 6px 0; }
  .memory-item.pinned { border-left-color: var(--accent-2); }
  .memory-item .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .memory-item .meta { color: var(--muted); font-size: 11px; }
  .memory-item button { background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 14px; }
  .memory-item button:hover { color: var(--accent-2); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .hive-entry { padding: 8px 12px; margin-bottom: 6px; background: var(--panel-raised); border-radius: 6px; font-size: 12px; }
  .hive-entry .ag { color: var(--accent); font-weight: 600; }
  .hive-entry .ts { color: var(--muted); float: right; }
  .audit-row.blocked { color: var(--danger); }
  .audit-row.kill { color: var(--danger); font-weight: 600; }
  .audit-row.unlock { color: var(--success); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .form-grid textarea { grid-column: 1 / -1; min-height: 80px; resize: vertical; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); display: inline-block; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
</head>
<body>

<header>
  <h1>🦀 CLAUDECLAW</h1>
  <nav id="nav">
    <button data-tab="overview" class="active">Overview</button>
    <button data-tab="memory">Memory</button>
    <button data-tab="agents">Agents</button>
    <button data-tab="missions">Missions</button>
    <button data-tab="hive">Hive Mind</button>
    <button data-tab="audit">Audit</button>
    <button data-tab="warroom">War Room</button>
  </nav>
  <span class="spacer"></span>
  <label class="small muted flex"><input type="checkbox" id="blurToggle" style="width:auto; margin-right:4px" /> Blur sensitive</label>
  <span class="small muted"><span class="live-dot"></span> live</span>
</header>

<main>

<!-- Overview -->
<div id="tab-overview" class="tab-panel active">
  <div class="grid grid-3">
    <div class="card">
      <h2>Messages today</h2>
      <p class="stat" id="msgToday">—</p>
      <p class="stat-label">Across all agents</p>
    </div>
    <div class="card">
      <h2>Tokens today</h2>
      <p class="stat" id="tokToday">—</p>
      <p class="stat-label">Input + output</p>
    </div>
    <div class="card">
      <h2>Est cost today</h2>
      <p class="stat" id="costToday">—</p>
      <p class="stat-label">Rough estimate</p>
    </div>
  </div>

  <div class="grid grid-2" style="margin-top: 16px;">
    <div class="card">
      <h2>Agents</h2>
      <table id="agentsTable">
        <thead><tr><th>Agent</th><th>Model</th><th>Status</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="card">
      <h2>Recent hive mind</h2>
      <div id="hiveMiniFeed"></div>
    </div>
  </div>
</div>

<!-- Memory -->
<div id="tab-memory" class="tab-panel">
  <div class="card">
    <div class="flex" style="margin-bottom: 12px;">
      <h2 style="margin:0">Memory timeline</h2>
      <span class="spacer" style="flex:1"></span>
      <select id="memoryAgentFilter"></select>
      <button class="ghost" onclick="loadMemory()">Reload</button>
    </div>
    <div id="memoryList"></div>
  </div>
</div>

<!-- Agents -->
<div id="tab-agents" class="tab-panel">
  <div class="card">
    <h2>Configured agents</h2>
    <div id="agentsDetail"></div>
    <button class="ghost" style="margin-top:12px" onclick="reloadAgents()">Reload agent.yaml</button>
  </div>
</div>

<!-- Missions -->
<div id="tab-missions" class="tab-panel">
  <div class="card">
    <h2>New mission</h2>
    <div class="form-grid">
      <input id="mName" placeholder="Name" />
      <input id="mCron" placeholder='Cron e.g. "0 9 * * *"' />
      <input id="mChatId" placeholder="Chat ID (blank = default)" />
      <select id="mAgent"></select>
      <textarea id="mPrompt" placeholder="Prompt to run when this mission fires"></textarea>
    </div>
    <button class="primary" style="margin-top:12px" onclick="createMission()">Schedule</button>
  </div>
  <div class="card" style="margin-top: 16px;">
    <h2>Scheduled missions</h2>
    <table id="missionsTable">
      <thead><tr><th>ID</th><th>Name</th><th>Agent</th><th>Cron</th><th>Next run</th><th>Status</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<!-- Hive -->
<div id="tab-hive" class="tab-panel">
  <div class="card">
    <h2>Cross-agent activity</h2>
    <div id="hiveFeed"></div>
  </div>
</div>

<!-- Audit -->
<div id="tab-audit" class="tab-panel">
  <div class="card">
    <h2>Security audit log</h2>
    <table id="auditTable">
      <thead><tr><th>When</th><th>Action</th><th>Chat</th><th>Agent</th><th>Detail</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<!-- War Room -->
<div id="tab-warroom" class="tab-panel">
  <div class="card">
    <h2>War Room</h2>
    <p class="muted">Voice room for talking to your agents in real time.</p>
    <p><a href="http://localhost:7860" target="_blank">Open War Room (port 7860)</a></p>
    <p class="small muted">Start the Python server: <code>python warroom/server.py</code></p>
  </div>
</div>

</main>

<script>
const token = new URLSearchParams(location.search).get('token') || '';
const tokenQS = token ? '?token=' + encodeURIComponent(token) : '';

const tabs = document.querySelectorAll('#nav button');
tabs.forEach(b => b.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + b.dataset.tab).classList.add('active');
  if (b.dataset.tab === 'memory') loadMemory();
  if (b.dataset.tab === 'missions') loadMissions();
  if (b.dataset.tab === 'hive') loadHive();
  if (b.dataset.tab === 'audit') loadAudit();
}));

document.getElementById('blurToggle').addEventListener('change', (e) => {
  document.body.classList.toggle('blur-sensitive', e.target.checked);
});

async function j(url, opts={}) {
  const full = url + (url.includes('?') ? '&' : '?') + (token ? 'token=' + encodeURIComponent(token) : '');
  const r = await fetch(full, opts);
  return r.json();
}

async function loadOverview() {
  const u = await j('/api/usage');
  document.getElementById('msgToday').textContent = u.usage.messages ?? 0;
  document.getElementById('tokToday').textContent = ((u.usage.input_tokens ?? 0) + (u.usage.output_tokens ?? 0)).toLocaleString();
  document.getElementById('costToday').textContent = '$' + ((u.usage.estimated_cost ?? 0)).toFixed(2);
  const a = await j('/api/agents');
  const tb = document.querySelector('#agentsTable tbody');
  tb.innerHTML = a.agents.map(ag => \`<tr><td>\${ag.emoji||''} \${ag.name} <span class="muted small">@\${ag.id}</span></td><td>\${ag.model||'—'}</td><td><span class="pill success">ready</span></td></tr>\`).join('');
  const h = await j('/api/hive?limit=5');
  document.getElementById('hiveMiniFeed').innerHTML = h.entries.slice(0, 5).map(e =>
    \`<div class="hive-entry"><span class="ag">@\${e.agent_id}</span> \${escapeHtml(e.summary).slice(0, 120)}<span class="ts">\${ago(e.created_at)}</span></div>\`
  ).join('') || '<p class="muted small">No activity yet.</p>';
  // Populate agent filters
  const select = document.getElementById('memoryAgentFilter');
  if (select.options.length <= 1) {
    select.innerHTML = a.agents.map(x => \`<option value="\${x.id}">\${x.emoji||''} \${x.name}</option>\`).join('');
  }
  const mSelect = document.getElementById('mAgent');
  mSelect.innerHTML = a.agents.map(x => \`<option value="\${x.id}">\${x.name}</option>\`).join('');
  const detail = document.getElementById('agentsDetail');
  detail.innerHTML = a.agents.map(ag => \`
    <div class="card" style="margin-bottom:8px; background: var(--panel-raised);">
      <strong>\${ag.emoji||''} \${ag.name}</strong> <span class="muted">@\${ag.id}</span>
      <p class="small muted" style="margin:4px 0">\${ag.description||''}</p>
      <p class="small"><span class="muted">cwd:</span> <code>\${ag.cwd || '(project root)'}</code></p>
      <p class="small"><span class="muted">model:</span> \${ag.model} · <span class="muted">max turns:</span> \${ag.max_turns}</p>
    </div>
  \`).join('');
}

async function loadMemory() {
  const agent = document.getElementById('memoryAgentFilter').value || 'main';
  const m = await j('/api/memory?agent=' + agent + '&limit=100');
  const out = m.memories.map(x => \`
    <div class="memory-item \${x.pinned?'pinned':''}">
      <div class="bar">
        <span class="small muted">\${ago(x.created_at)} · importance \${x.importance.toFixed(2)} · salience \${x.salience.toFixed(1)}</span>
        <button onclick="togglePin(\${x.id}, \${!x.pinned})" title="\${x.pinned?'Unpin':'Pin'}">\${x.pinned?'📌':'📍'}</button>
      </div>
      <div class="sensitive">\${escapeHtml(x.summary || x.content)}</div>
      \${x.entities.length ? '<div class="small muted" style="margin-top:4px">' + x.entities.map(e => '<span class="pill">' + escapeHtml(e) + '</span>').join(' ') + '</div>' : ''}
    </div>
  \`).join('');
  document.getElementById('memoryList').innerHTML = out || '<p class="muted">No memories yet.</p>';
}

async function togglePin(id, pinned) {
  await fetch('/api/memory/' + id + '/pin' + tokenQS, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pinned})
  });
  loadMemory();
}

async function loadMissions() {
  const m = await j('/api/missions');
  const tb = document.querySelector('#missionsTable tbody');
  tb.innerHTML = m.missions.map(x => \`
    <tr>
      <td>\${x.id}</td>
      <td>\${escapeHtml(x.name)}</td>
      <td>@\${x.agent_id}</td>
      <td><code>\${x.cron||'one-shot'}</code></td>
      <td>\${x.next_run ? new Date(x.next_run).toLocaleString() : '—'}</td>
      <td>\${x.enabled ? '<span class="pill success">enabled</span>' : '<span class="pill warning">paused</span>'}</td>
      <td>
        <button class="ghost small" onclick="toggleMission(\${x.id})">\${x.enabled?'Pause':'Resume'}</button>
        <button class="ghost small" onclick="deleteMission(\${x.id})">Delete</button>
      </td>
    </tr>
  \`).join('') || '<tr><td colspan="7" class="muted">No missions scheduled.</td></tr>';
}

async function createMission() {
  const body = {
    name: document.getElementById('mName').value,
    cron: document.getElementById('mCron').value,
    chat_id: document.getElementById('mChatId').value || undefined,
    agent_id: document.getElementById('mAgent').value || 'main',
    prompt: document.getElementById('mPrompt').value,
  };
  if (!body.name || !body.prompt) { alert('Name and prompt are required'); return; }
  const r = await fetch('/api/missions' + tokenQS, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });
  if (r.ok) { document.getElementById('mName').value = ''; document.getElementById('mPrompt').value = ''; loadMissions(); }
}

async function toggleMission(id) {
  await fetch('/api/missions/' + id + '/toggle' + tokenQS, {method: 'POST'});
  loadMissions();
}

async function deleteMission(id) {
  if (!confirm('Delete mission ' + id + '?')) return;
  await fetch('/api/missions/' + id + tokenQS, {method: 'DELETE'});
  loadMissions();
}

async function loadHive() {
  const h = await j('/api/hive');
  document.getElementById('hiveFeed').innerHTML = h.entries.map(e =>
    \`<div class="hive-entry"><span class="ag">@\${e.agent_id}</span> <strong>\${e.action_type}</strong> — \${escapeHtml(e.summary)}<span class="ts">\${ago(e.created_at)}</span></div>\`
  ).join('') || '<p class="muted">No hive entries yet.</p>';
}

async function loadAudit() {
  const a = await j('/api/audit');
  const tb = document.querySelector('#auditTable tbody');
  tb.innerHTML = a.entries.map(e => \`
    <tr class="audit-row \${e.action}">
      <td>\${new Date(e.created_at).toLocaleString()}</td>
      <td>\${e.action}</td>
      <td>\${e.chat_id||'—'}</td>
      <td>\${e.agent_id||'—'}</td>
      <td class="sensitive small muted">\${e.metadata ? escapeHtml(e.metadata).slice(0, 200) : '—'}</td>
    </tr>
  \`).join('') || '<tr><td colspan="5" class="muted">No audit entries yet.</td></tr>';
}

async function reloadAgents() {
  await fetch('/api/agents/reload' + tokenQS, {method: 'POST'});
  loadOverview();
}

function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
}

// Live events via SSE
function startSSE() {
  const es = new EventSource('/api/events' + tokenQS);
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      if (ev.type === 'assistant_message' || ev.type === 'user_message') {
        if (document.querySelector('#nav button.active').dataset.tab === 'overview') loadOverview();
      }
      if (ev.type === 'hive_mind') {
        if (document.querySelector('#nav button.active').dataset.tab === 'hive') loadHive();
      }
    } catch {}
  };
  es.onerror = () => setTimeout(startSSE, 5000);
}

// Initial loads
loadOverview();
startSSE();
setInterval(loadOverview, 15000);
document.getElementById('memoryAgentFilter').addEventListener('change', loadMemory);
</script>
</body>
</html>`
