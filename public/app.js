let threadId = 'session-' + Date.now();
const messagesList = document.getElementById('messages-list');
const welcomeCard = document.getElementById('welcome-card');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const statusBanner = document.getElementById('status-banner');
const clockDisplay = document.querySelector('.status-clock .clock-time');

// Update macOS clock display
function updateClock() {
  const now = new Date();
  if (clockDisplay) {
    clockDisplay.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
setInterval(updateClock, 1000);
updateClock();

// Segmented Navigation Control (Intelligence / FactLens Diffs / SQLite State)
document.querySelectorAll('.segmented-control .segment').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.segmented-control .segment').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.getAttribute('data-view'));
    if (target) target.classList.add('active');

    if (btn.getAttribute('data-view') === 'view-db') {
      loadDatabaseState();
    }
  });
});

// Database subtabs
document.querySelectorAll('.db-subtab').forEach((sub) => {
  sub.addEventListener('click', () => {
    document.querySelectorAll('.db-subtab').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.db-tab-pane').forEach((p) => p.classList.remove('active'));
    sub.classList.add('active');
    const pane = document.getElementById(sub.getAttribute('data-dbtab'));
    if (pane) pane.classList.add('active');
  });
});

// Auto-expand textarea & Enter to submit
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Prompt card click
document.querySelectorAll('.prompt-card').forEach((card) => {
  card.addEventListener('click', () => {
    userInput.value = card.getAttribute('data-query');
    userInput.focus();
  });
});

// Reset session
document.getElementById('btn-reset').addEventListener('click', () => {
  threadId = 'session-' + Date.now();
  messagesList.innerHTML = '';
  welcomeCard.style.display = 'flex';
  statusBanner.textContent = 'Session reset. New clean memory initialized.';
  setTimeout(() => (statusBanner.textContent = ''), 3000);
});

// Grader Quick Scenario Handlers
const PRESETS = {
  crm: {
    title: 'Monday CRM Shortlist',
    threadId: 'crm-eval-thread',
    turns: [
      {
        role: 'user',
        content: 'We need to shortlist 5 CRM tools for our 20-person sales team.',
        createdAt: '2026-11-09T09:30:00Z',
      },
      {
        role: 'assistant',
        content: `Here are 5 shortlisted CRM tools for a 20-person sales team:\n1. HubSpot Sales Hub - $20/seat/mo Starter plan\n2. Pipedrive - $14/user/mo Essential plan\n3. Zoho CRM - $14/user/mo Standard plan\n4. Close - $49/user/mo Startup plan\n5. Freshsales - $15/user/mo Growth plan`,
        createdAt: '2026-11-09T09:31:00Z',
      },
    ],
    query: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    nowOverride: '2026-11-14T10:00:00Z',
  },
  postgres: {
    title: 'Last Tuesday Postgres',
    threadId: 'postgres-eval-thread',
    turns: [
      {
        role: 'user',
        content: 'What are the top managed Postgres hosting providers and their pricing?',
        createdAt: '2026-11-03T14:00:00Z',
      },
      {
        role: 'assistant',
        content: `Top Postgres hosting options:\n1. Supabase: Pro tier starts at $25/month with 8GB storage and automatic backups.\n2. Neon: Serverless Postgres with autoscaling compute and a free tier with 0.5 GB storage.`,
        createdAt: '2026-11-03T14:01:00Z',
      },
    ],
    query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    nowOverride: '2026-11-14T10:00:00Z',
  },
  nov3: {
    title: '3 Nov Answer Check',
    threadId: 'nov3-eval-thread',
    turns: [
      {
        role: 'user',
        content: 'Can you recommend a fast headless browser for web scraping?',
        createdAt: '2026-11-03T11:00:00Z',
      },
      {
        role: 'assistant',
        content: 'I recommend Playwright. It has official support for Chromium, Firefox, and WebKit with fast async execution and auto-waiting.',
        createdAt: '2026-11-03T11:01:00Z',
      },
    ],
    query: 'What did I ask you on 3 November? Is your answer still correct today?',
    nowOverride: '2026-11-14T10:00:00Z',
  },
  empty: {
    title: 'Missing Memory Boundary Test',
    threadId: 'empty-test-thread',
    turns: [],
    query: 'On Monday we shortlisted 5 email marketing tools. Has any of them changed pricing?',
    nowOverride: '2026-11-14T10:00:00Z',
  },
};

document.querySelectorAll('.preset-pill').forEach((pill) => {
  pill.addEventListener('click', async () => {
    const key = pill.getAttribute('data-preset');
    const p = PRESETS[key];
    if (!p) return;

    statusBanner.textContent = `Seeding ${p.title} into SQLite...`;
    threadId = p.threadId;

    if (p.turns.length > 0) {
      await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: p.threadId,
          title: p.title,
          turns: p.turns,
        }),
      });
    }

    userInput.value = p.query;
    userInput.focus();
    statusBanner.textContent = `✓ Seeded ${p.title}. Press Send or Return to execute verification.`;
  });
});

// Markdown parser
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^### (.*$)/gim, '<h3 style="font-size: 1.05rem; font-weight:700; margin: 12px 0 6px;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size: 1.2rem; font-weight:700; margin: 14px 0 8px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="font-size: 1.35rem; font-weight:700; margin: 16px 0 10px;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`\[Changed\]`/gim, '<span style="background:var(--amber-bg); color:var(--amber); padding:2px 8px; border-radius:4px; font-weight:600; font-family:var(--font-mono); font-size:0.76rem;">[Changed]</span>')
    .replace(/`\[No change found\]`/gim, '<span style="background:var(--emerald-bg); color:var(--emerald); padding:2px 8px; border-radius:4px; font-weight:600; font-family:var(--font-mono); font-size:0.76rem;">[No change found]</span>')
    .replace(/`\[Unverified\]`/gim, '<span style="background:rgba(168,85,247,0.15); color:var(--purple); padding:2px 8px; border-radius:4px; font-weight:600; font-family:var(--font-mono); font-size:0.76rem;">[Unverified]</span>')
    .replace(/`([^`]+)`/gim, '<code style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); font-size:0.82rem;">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>')
    .replace(/\n\n/gim, '<br><br>');
}

// Chat submission & SSE stream
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = userInput.value.trim();
  if (!query) return;

  welcomeCard.style.display = 'none';
  userInput.value = '';
  userInput.style.height = 'auto';

  // Append user bubble
  const userRow = document.createElement('div');
  userRow.className = 'msg-row user';
  userRow.innerHTML = `<div class="msg-bubble">${query}</div>`;
  messagesList.appendChild(userRow);

  // Append assistant placeholder
  const assistantRow = document.createElement('div');
  assistantRow.className = 'msg-row assistant';
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'msg-bubble';
  assistantBubble.innerHTML = '<span style="color:var(--text-muted); font-family:var(--font-mono); font-size:0.8rem;">Connecting to agent...</span>';
  assistantRow.appendChild(assistantBubble);
  messagesList.appendChild(assistantRow);

  const scrollViewport = document.getElementById('chat-viewport');
  scrollViewport.scrollTop = scrollViewport.scrollHeight;

  statusBanner.textContent = 'Resolving temporal memory & fanning out live search...';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: query,
        threadId,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.delta) {
              accumulatedText += data.delta;
              assistantBubble.innerHTML = renderMarkdown(accumulatedText);
              statusBanner.textContent = '';
            } else if (data.status) {
              statusBanner.textContent = data.status;
            } else if (data.text) {
              // Preamble event
              const preambleDiv = document.createElement('div');
              preambleDiv.className = 'preamble-badge';
              preambleDiv.innerHTML = `⚡ ${data.text}`;
              assistantBubble.parentNode.insertBefore(preambleDiv, assistantBubble);
            }
          } catch {}
        }
      }
      scrollViewport.scrollTop = scrollViewport.scrollHeight;
    }
    statusBanner.textContent = '';
  } catch (err) {
    assistantBubble.innerHTML = `<span style="color:#ef4444;">Error: ${err.message}</span>`;
    statusBanner.textContent = '';
  }
});

// Live Database Inspector
async function loadDatabaseState() {
  try {
    const res = await fetch('/api/db');
    const data = await res.json();

    renderTable('tab-threads', data.threads, ['id', 'title', 'created_at']);
    renderTable('tab-turns', data.turns, ['id', 'thread_id', 'role', 'content', 'created_at']);
    renderTable('tab-observations', data.observations, ['id', 'entity', 'attribute', 'value', 'currency', 'plan', 'as_of']);
    renderTable('tab-cache', data.cacheStats, ['total_cached']);
  } catch (e) {
    console.error('Failed to load database state:', e);
  }
}

function renderTable(containerId, rows, columns) {
  const container = document.getElementById(containerId);
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding:14px; font-size:0.82rem;">No records found in this table.</p>';
    return;
  }

  let html = '<table class="db-table"><thead><tr>';
  columns.forEach((col) => (html += `<th>${col}</th>`));
  html += '</tr></thead><tbody>';

  rows.forEach((row) => {
    html += '<tr>';
    columns.forEach((col) => {
      let val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
      if (val.length > 70) val = val.slice(0, 70) + '...';
      html += `<td title="${String(row[col] || '')}">${val}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}
