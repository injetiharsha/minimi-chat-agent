// Minimi Full-Page Frosted Glass Chat Agent
let threadId = 'session-' + Date.now();
let chatSessions = [];

try {
  chatSessions = JSON.parse(localStorage.getItem('minimi_chat_sessions') || '[]');
} catch (e) {
  chatSessions = [];
}

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
const recentChatsList = document.getElementById('recent-chats-list');
const dbModal = document.getElementById('db-modal');
const btnToggleDb = document.getElementById('btn-toggle-db');
const btnCloseDb = document.getElementById('btn-close-db');

// Render Recent Chats in Left Sidebar
function renderRecentChats() {
  if (!recentChatsList) return;
  recentChatsList.innerHTML = '';

  if (chatSessions.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'no-chats-hint';
    hint.style.cssText = 'padding: 6px 12px; font-size: 0.74rem; color: var(--text-muted);';
    hint.textContent = 'No recent chats yet';
    recentChatsList.appendChild(hint);
    return;
  }

  chatSessions.slice(0, 15).forEach((session) => {
    const btn = document.createElement('button');
    btn.className = 'history-item' + (session.id === threadId ? ' active' : '');
    btn.setAttribute('data-thread-id', session.id);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-title';
    titleSpan.textContent = session.title;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'history-date';
    dateSpan.textContent = new Date(session.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    btn.appendChild(titleSpan);
    btn.appendChild(dateSpan);

    btn.addEventListener('click', async () => {
      switchThread(session.id, session.title);
    });

    recentChatsList.appendChild(btn);
  });
}

function saveChatSession(id, title) {
  const existingIdx = chatSessions.findIndex((s) => s.id === id);
  if (existingIdx >= 0) {
    chatSessions[existingIdx].timestamp = Date.now();
  } else {
    chatSessions.unshift({
      id,
      title: title.length > 28 ? title.slice(0, 28) + '...' : title,
      timestamp: Date.now(),
    });
  }
  try {
    localStorage.setItem('minimi_chat_sessions', JSON.stringify(chatSessions));
  } catch (e) {}
  renderRecentChats();
}

async function switchThread(id, title) {
  threadId = id;
  if (navThreadTitle) navThreadTitle.textContent = title;
  if (welcomeCard) welcomeCard.style.display = 'none';
  messagesList.innerHTML = '';

  // Update active state in sidebar
  document.querySelectorAll('.history-item').forEach((item) => {
    if (item.getAttribute('data-thread-id') === id) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Fetch thread history from backend
  try {
    const res = await fetch(`/api/threads/${id}/turns`);
    if (res.ok) {
      const data = await res.json();
      if (data.turns && data.turns.length > 0) {
        data.turns.forEach((turn) => {
          const wrapper = document.createElement('div');
          wrapper.className = `msg-wrapper ${turn.role}`;
          const bubble = document.createElement('div');
          bubble.className = 'chat-bubble';
          bubble.innerHTML = renderMarkdown(turn.content);
          wrapper.appendChild(bubble);
          messagesList.appendChild(wrapper);
        });
        chatViewport.scrollTop = chatViewport.scrollHeight;
      }
    }
  } catch (e) {
    console.warn('Failed to load thread turns:', e);
  }
}

// Live Clock
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

// Dynamic Typing Placeholder with Blinking Cursor & Backspacing
const PLACEHOLDER_TEXTS = [
  'Ask a question or check if past information changed...',
  'Has Supabase pricing changed since last Tuesday?',
  'On Monday we shortlisted 5 CRM tools for sales...',
  'What did I ask you on 3 November?',
  'Get me top hosting platforms and their pricings...',
];

let textIdx = 0;
let charIdx = 0;
let isDeleting = false;
let typingActive = true;

function typePlaceholderLoop() {
  if (!typingActive || document.activeElement === userInput) {
    return;
  }
  const currentText = PLACEHOLDER_TEXTS[textIdx];
  if (isDeleting) {
    userInput.placeholder = currentText.substring(0, charIdx - 1) + ' |';
    charIdx--;
    if (charIdx <= 0) {
      isDeleting = false;
      textIdx = (textIdx + 1) % PLACEHOLDER_TEXTS.length;
      setTimeout(typePlaceholderLoop, 400);
      return;
    }
    setTimeout(typePlaceholderLoop, 30);
  } else {
    userInput.placeholder = currentText.substring(0, charIdx + 1) + ' |';
    charIdx++;
    if (charIdx >= currentText.length) {
      isDeleting = true;
      setTimeout(typePlaceholderLoop, 2400);
      return;
    }
    setTimeout(typePlaceholderLoop, 55);
  }
}

userInput.addEventListener('focus', () => {
  typingActive = false;
  userInput.placeholder = 'Ask a question or check if past information changed...';
});

userInput.addEventListener('blur', () => {
  if (!userInput.value.trim()) {
    typingActive = true;
    setTimeout(typePlaceholderLoop, 500);
  }
});

setTimeout(typePlaceholderLoop, 800);

// Textarea Auto-Resize
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

// Sidebar Toggle
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

// Evaluation Presets
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

async function activateScenario(key) {
  const p = PRESETS[key];
  if (!p) return;

  threadId = p.threadId;
  if (navThreadTitle) navThreadTitle.textContent = p.title;

  document.querySelectorAll('.history-item').forEach((item) => {
    if (item.getAttribute('data-preset') === key) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

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
    } catch (e) {}
  }

  userInput.value = p.query;
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  userInput.focus();
}

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-preset');
    activateScenario(key);
  });
});

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

// Markdown & Table Parser (Normal Bold & Italic Typography, No Badges)
function renderMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const result = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  function formatInline(cell) {
    let c = cell.trim();
    // Bold
    c = c.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    c = c.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code
    c = c.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Status text formatting (clean typography without badge shapes)
    c = c.replace(/`?\[?No change found\]?`?/gi, '<strong>No change found</strong>');
    c = c.replace(/`?\[?Changed\]?`?/gi, '<strong>Changed</strong>');
    c = c.replace(/`?\[?Unverified\]?`?/gi, '<em>Unverified</em>');
    c = c.replace(/`?\[?Not comparable\]?`?/gi, '<em>Not comparable</em>');
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

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((s) => s.trim());
      const isSep = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSep) continue;

      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
    } else {
      if (inTable) flushTable();

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

// Antigravity-Style Dynamic Reasoning Widget
function createDynamicReasoningWidget(steps) {
  const container = document.createElement('div');
  container.className = 'reasoning-block open';

  const header = document.createElement('div');
  header.className = 'reasoning-header';
  header.innerHTML = `
    <div class="reasoning-title-group">
      <svg class="reasoning-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
      <span>Reasoning Steps</span>
      <span class="reasoning-step-count">${steps.length} steps</span>
    </div>
    <span class="reasoning-toggle-hint" style="font-size:0.72rem; color:var(--text-muted);">Collapse</span>
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
        <span style="color:var(--text-sub);">${escapeText(s.detail)}</span>
      </div>
    </div>
  `
    )
    .join('');

  header.addEventListener('click', () => {
    container.classList.toggle('open');
    const hint = header.querySelector('.reasoning-toggle-hint');
    if (hint) {
      hint.textContent = container.classList.contains('open') ? 'Collapse' : 'Expand';
    }
  });

  container.appendChild(header);
  container.appendChild(body);
  return container;
}

function escapeText(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Chat Form Submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = userInput.value.trim();
  if (!query) return;

  if (welcomeCard) welcomeCard.style.display = 'none';
  userInput.value = '';
  userInput.style.height = 'auto';

  // 1. Add chat session to left sidebar
  saveChatSession(threadId, query);

  // 2. Render user bubble
  const userWrapper = document.createElement('div');
  userWrapper.className = 'msg-wrapper user';
  userWrapper.innerHTML = `<div class="chat-bubble">${escapeText(query)}</div>`;
  messagesList.appendChild(userWrapper);

  // 3. Prepare assistant wrapper (NO empty chat bubble box created yet!)
  const assistantWrapper = document.createElement('div');
  assistantWrapper.className = 'msg-wrapper assistant';
  messagesList.appendChild(assistantWrapper);

  chatViewport.scrollTop = chatViewport.scrollHeight;

  let reasoningBlock = null;
  let assistantBubble = null;
  let accumulatedText = '';

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            // Dynamic reasoning steps event
            if (data.steps && !reasoningBlock) {
              reasoningBlock = createDynamicReasoningWidget(data.steps);
              assistantWrapper.appendChild(reasoningBlock);
            }
            // Token generation event
            else if (data.delta) {
              accumulatedText += data.delta;
              // Only create the response text container when text actually appears!
              if (!assistantBubble) {
                assistantBubble = document.createElement('div');
                assistantBubble.className = 'chat-bubble';
                assistantWrapper.appendChild(assistantBubble);
              }
              assistantBubble.innerHTML = renderMarkdown(accumulatedText);
            }
            // Error event
            else if (data.error) {
              if (!assistantBubble) {
                assistantBubble = document.createElement('div');
                assistantBubble.className = 'chat-bubble';
                assistantWrapper.appendChild(assistantBubble);
              }
              assistantBubble.innerHTML = `<span style="color:#ef4444;">${escapeText(data.error)}</span>`;
            }
          } catch {}
        }
      }
      chatViewport.scrollTop = chatViewport.scrollHeight;
    }
  } catch (err) {
    if (!assistantBubble) {
      assistantBubble = document.createElement('div');
      assistantBubble.className = 'chat-bubble';
      assistantWrapper.appendChild(assistantBubble);
    }
    assistantBubble.innerHTML = `<span style="color:#ef4444;">${escapeText(err.message)}</span>`;
  }
});

// Database Inspector Modal
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

// Initial render of existing sessions
renderRecentChats();
