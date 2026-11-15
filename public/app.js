// Minimi Full-Page Frosted Glass Chat Agent
let threadId = 'session-' + Date.now();
const messagesList = document.getElementById('messages-list');
const welcomeCard = document.getElementById('welcome-card');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const clockDisplay = document.getElementById('clock-display');
const appSidebar = document.getElementById('app-sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnNewChat = document.getElementById('btn-new-chat');
const navThreadTitle = document.getElementById('nav-thread-title');
const chatViewport = document.getElementById('chat-viewport');
const dbModal = document.getElementById('db-modal');
const btnToggleDb = document.getElementById('btn-toggle-db');
const btnCloseDb = document.getElementById('btn-close-db');

// Live macOS Clock
function updateClock() {
  const now = new Date();
  if (clockDisplay) {
    clockDisplay.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
setInterval(updateClock, 1000);
updateClock();

// Textarea Auto-Resize & Keyboard Handling (No arrows, no resize handles)
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

// Collapsible Left Navigation Sidebar (ChatGPT / Claude style)
if (btnToggleSidebar && appSidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    appSidebar.classList.toggle('collapsed');
  });
}

// New Chat Button
if (btnNewChat) {
  btnNewChat.addEventListener('click', () => {
    startNewSession('New Session');
  });
}

function startNewSession(title) {
  threadId = 'session-' + Date.now();
  messagesList.innerHTML = '';
  if (welcomeCard) welcomeCard.style.display = 'flex';
  if (navThreadTitle) navThreadTitle.textContent = title || 'New Session';
  userInput.value = '';
  userInput.style.height = 'auto';
  document.querySelectorAll('.history-item').forEach((item) => item.classList.remove('active'));
}

// 4 Canonical Evaluation Scenarios
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
        content: `Here are 5 shortlisted CRM tools for a 20-person sales team:
1. HubSpot Sales Hub - $20/seat/mo Starter plan
2. Pipedrive - $14/user/mo Essential plan
3. Zoho CRM - $14/user/mo Standard plan
4. Close - $49/user/mo Startup plan
5. Freshsales - $15/user/mo Growth plan`,
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
        content: `Top Postgres hosting options:
1. Supabase: Pro tier starts at $25/month with 8GB storage and automatic backups.
2. Neon: Serverless Postgres with autoscaling compute and a free tier with 0.5 GB storage.`,
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
    title: 'Missing Memory Test',
    threadId: 'empty-test-thread',
    turns: [],
    query: 'On Monday we shortlisted 5 email marketing tools. Has any of them changed pricing?',
    nowOverride: '2026-11-14T10:00:00Z',
  },
};

// Handle Scenario Activation
async function activateScenario(key) {
  const p = PRESETS[key];
  if (!p) return;

  threadId = p.threadId;
  if (navThreadTitle) navThreadTitle.textContent = p.title;

  // Highlight active sidebar item
  document.querySelectorAll('.history-item').forEach((item) => {
    if (item.getAttribute('data-preset') === key) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Seed baseline turns into SQLite
  if (p.turns.length > 0) {
    try {
      await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: p.threadId,
          title: p.title,
          turns: p.turns,
        }),
      });
    } catch (e) {
      console.warn('Scenario seeding warning:', e);
    }
  }

  userInput.value = p.query;
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  userInput.focus();
}

// Sidebar Scenario Item Click
document.querySelectorAll('.history-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-preset');
    activateScenario(key);
  });
});

// Welcome Quick-Cards Click
document.querySelectorAll('.quick-card').forEach((card) => {
  card.addEventListener('click', () => {
    const q = card.getAttribute('data-query');
    if (!q) return;

    if (q.includes('CRM')) activateScenario('crm');
    else if (q.includes('Postgres')) activateScenario('postgres');
    else if (q.includes('3 November')) activateScenario('nov3');
    else {
      userInput.value = q;
      userInput.focus();
    }
  });
});

// Robust Markdown & HTML Table Parser
function renderMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const result = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  function formatInline(cell) {
    let c = cell.trim();
    // Bolding
    c = c.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    c = c.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Status tags
    c = c.replace(/\[Changed\]/g, '<span class="status-tag changed">[Changed]</span>');
    c = c.replace(/\[No change found\]/g, '<span class="status-tag no-change">[No change found]</span>');
    c = c.replace(/\[Unverified\]/g, '<span class="status-tag unverified">[Unverified]</span>');
    // Markdown links
    c = c.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return c;
  }

  function flushTable() {
    if (tableHeader.length > 0) {
      let html = '<div class="table-wrapper"><table class="markdown-table"><thead><tr>';
      tableHeader.forEach((h) => (html += `<th>${formatInline(h)}</th>`));
      html += '</tr></thead><tbody>';
      tableRows.forEach((row) => {
        html += '<tr>';
        row.forEach((cell) => (html += `<td>${formatInline(cell)}</td>`));
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      result.push(html);
    }
    inTable = false;
    tableHeader = [];
    tableRows = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Markdown Table Detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((s) => s.trim());
      // Check if separator line (| :--- | :--- |)
      const isSep = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSep) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        flushTable();
      }

      if (trimmed.startsWith('### ')) {
        result.push(`<h3 class="md-h3">${formatInline(trimmed.slice(4))}</h3>`);
      } else if (trimmed.startsWith('## ')) {
        result.push(`<h2 class="md-h2">${formatInline(trimmed.slice(3))}</h2>`);
      } else if (trimmed.startsWith('# ')) {
        result.push(`<h1 class="md-h1">${formatInline(trimmed.slice(2))}</h1>`);
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        result.push(`<li class="md-li">${formatInline(trimmed.slice(2))}</li>`);
      } else if (/^\d+\.\s/.test(trimmed)) {
        const itemText = trimmed.replace(/^\d+\.\s+/, '');
        result.push(`<li class="md-num-li">${formatInline(itemText)}</li>`);
      } else if (trimmed.length > 0) {
        result.push(`<p class="md-p">${formatInline(trimmed)}</p>`);
      }
    }
  }

  if (inTable) flushTable();

  return result.join('');
}

// Collapsible Reasoning Accordion Builder (Gemini / Antigravity style)
function createReasoningAccordion(steps) {
  const block = document.createElement('div');
  block.className = 'reasoning-block';

  const header = document.createElement('div');
  header.className = 'reasoning-header';
  header.innerHTML = `
    <div class="reasoning-title-group">
      <svg class="reasoning-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
      <span>Reasoning Steps</span>
      <span class="reasoning-step-count">${steps.length} steps</span>
    </div>
    <span style="font-size:0.72rem; color:var(--text-muted);">Expand</span>
  `;

  const body = document.createElement('div');
  body.className = 'reasoning-body';
  body.innerHTML = steps
    .map(
      (s, idx) => `
    <div class="reasoning-step-item">
      <span class="step-num">${idx + 1}.</span>
      <div class="step-text">
        <strong style="color:var(--text-main); font-weight:600;">${escapeText(s.title)}:</strong>
        <span>${escapeText(s.detail)}</span>
      </div>
    </div>
  `
    )
    .join('');

  header.addEventListener('click', () => {
    block.classList.toggle('open');
    const hint = header.querySelector('span:last-child');
    if (hint) {
      hint.textContent = block.classList.contains('open') ? 'Collapse' : 'Expand';
    }
  });

  block.appendChild(header);
  block.appendChild(body);
  return block;
}

function escapeText(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Chat Form Submission & SSE Streaming
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = userInput.value.trim();
  if (!query) return;

  if (welcomeCard) welcomeCard.style.display = 'none';
  userInput.value = '';
  userInput.style.height = 'auto';

  // 1. Render User Message
  const userWrapper = document.createElement('div');
  userWrapper.className = 'msg-wrapper user';
  userWrapper.innerHTML = `<div class="chat-bubble">${escapeText(query)}</div>`;
  messagesList.appendChild(userWrapper);

  // 2. Prepare Assistant Message Container
  const assistantWrapper = document.createElement('div');
  assistantWrapper.className = 'msg-wrapper assistant';

  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'chat-bubble';
  assistantBubble.innerHTML = '';
  assistantWrapper.appendChild(assistantBubble);
  messagesList.appendChild(assistantWrapper);

  chatViewport.scrollTop = chatViewport.scrollHeight;

  let reasoningBlockAppended = false;

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

            // Token delta
            if (data.delta) {
              accumulatedText += data.delta;
              assistantBubble.innerHTML = renderMarkdown(accumulatedText);
            }
            // Collapsible reasoning steps event
            else if (data.steps && !reasoningBlockAppended) {
              const accordion = createReasoningAccordion(data.steps);
              assistantWrapper.insertBefore(accordion, assistantBubble);
              reasoningBlockAppended = true;
            }
            // Tool call status update
            else if (data.status) {
              // Subtle search status if needed
            }
            // Error
            else if (data.error) {
              assistantBubble.innerHTML = `<span style="color:#ef4444;">${escapeText(data.error)}</span>`;
            }
          } catch {}
        }
      }
      chatViewport.scrollTop = chatViewport.scrollHeight;
    }
  } catch (err) {
    assistantBubble.innerHTML = `<span style="color:#ef4444;">${escapeText(err.message)}</span>`;
  }
});

// Database Inspector Modal (Dev Testing)
if (btnToggleDb && dbModal) {
  btnToggleDb.addEventListener('click', async () => {
    dbModal.style.display = 'flex';
    await loadDatabaseInspector();
  });
}

if (btnCloseDb && dbModal) {
  btnCloseDb.addEventListener('click', () => {
    dbModal.style.display = 'none';
  });
}

document.querySelectorAll('.db-tab-btn').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.db-tab-btn').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.db-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById(tab.getAttribute('data-tab'));
    if (target) target.classList.add('active');
  });
});

async function loadDatabaseInspector() {
  try {
    const res = await fetch('/api/db');
    const data = await res.json();

    renderRawDbTable('tab-threads', data.threads, ['id', 'title', 'created_at']);
    renderRawDbTable('tab-turns', data.turns, ['id', 'thread_id', 'role', 'content', 'created_at']);
    renderRawDbTable('tab-observations', data.observations, ['id', 'entity', 'attribute', 'value', 'currency', 'plan', 'as_of']);
    renderRawDbTable('tab-cache', data.cacheStats, ['total_cached']);
  } catch (e) {
    console.error('Failed to load database inspector:', e);
  }
}

function renderRawDbTable(containerId, rows, columns) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding:12px; font-size:0.8rem;">No records found in this table.</p>';
    return;
  }

  let html = '<table class="db-raw-table"><thead><tr>';
  columns.forEach((col) => (html += `<th>${col}</th>`));
  html += '</tr></thead><tbody>';

  rows.forEach((row) => {
    html += '<tr>';
    columns.forEach((col) => {
      let val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
      if (val.length > 70) val = val.slice(0, 70) + '...';
      html += `<td title="${escapeText(String(row[col] || ''))}">${escapeText(val)}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}
