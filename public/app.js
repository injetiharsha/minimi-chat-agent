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
const btnScrollBottom = document.getElementById('btn-scroll-bottom');
const btnModelPicker = document.getElementById('btn-model-picker');
const modelPickerCurrent = document.getElementById('model-picker-current');
const modelPopover = document.getElementById('model-popover');
const modelPopoverList = document.getElementById('model-popover-list');

// Active Model State
let currentProvider = 'google';
let currentModel = 'gemini-3.5-flash-lite';
let currentModelName = 'Gemini 3.5 Flash Lite';

// ==========================================================================
// Typewriter Placeholder Animation (Dynamic typing, blinking cursor, backspacing)
// ==========================================================================
const PLACEHOLDER_PROMPTS = [
  'Ask a question or check if past information changed...',
  'What did I ask you on 3 November? Is your answer still correct today?',
  'Last Tuesday I asked you about Postgres hosting. Has any pricing changed?',
  'On Monday we shortlisted 5 CRM tools. Did any of them change pricing?',
  'Get top tier hosting platforms and their prices...',
];

let typePromptIdx = 0;
let typeCharIdx = 0;
let isBackspacing = false;
let typewriterTimer = null;
let isUserTypingOrFocused = false;

function tickTypewriter() {
  if (isUserTypingOrFocused || userInput.value.length > 0) {
    userInput.placeholder = '';
    return;
  }

  const currentPhrase = PLACEHOLDER_PROMPTS[typePromptIdx];

  if (!isBackspacing) {
    typeCharIdx++;
    userInput.placeholder = currentPhrase.slice(0, typeCharIdx) + (typeCharIdx % 2 === 0 ? '|' : '');
    if (typeCharIdx >= currentPhrase.length) {
      userInput.placeholder = currentPhrase;
      isBackspacing = true;
      typewriterTimer = setTimeout(tickTypewriter, 2200);
      return;
    }
    typewriterTimer = setTimeout(tickTypewriter, 45);
  } else {
    typeCharIdx--;
    userInput.placeholder = currentPhrase.slice(0, typeCharIdx) + (typeCharIdx % 2 === 0 ? '|' : '');
    if (typeCharIdx <= 0) {
      isBackspacing = false;
      typePromptIdx = (typePromptIdx + 1) % PLACEHOLDER_PROMPTS.length;
      typewriterTimer = setTimeout(tickTypewriter, 450);
      return;
    }
    typewriterTimer = setTimeout(tickTypewriter, 20);
  }
}

userInput.addEventListener('focus', () => {
  isUserTypingOrFocused = true;
  userInput.placeholder = '';
  clearTimeout(typewriterTimer);
});

userInput.addEventListener('blur', () => {
  if (userInput.value.trim() === '') {
    isUserTypingOrFocused = false;
    typeCharIdx = 0;
    isBackspacing = false;
    typewriterTimer = setTimeout(tickTypewriter, 300);
  }
});

// Start typewriter animation
typewriterTimer = setTimeout(tickTypewriter, 500);

// ==========================================================================
// Scroll To Bottom Floating Button
// ==========================================================================
if (chatViewport && btnScrollBottom) {
  chatViewport.addEventListener('scroll', () => {
    const distanceFromBottom = chatViewport.scrollHeight - chatViewport.scrollTop - chatViewport.clientHeight;
    if (distanceFromBottom > 160) {
      btnScrollBottom.style.display = 'flex';
    } else {
      btnScrollBottom.style.display = 'none';
    }
  });

  btnScrollBottom.addEventListener('click', () => {
    chatViewport.scrollTo({
      top: chatViewport.scrollHeight,
      behavior: 'smooth',
    });
  });
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

// ==========================================================================
// Render Recent Chats in Left Sidebar & SQLite Synchronization
// ==========================================================================
async function syncThreadsFromDatabase() {
  try {
    const res = await fetch('/api/db');
    if (!res.ok) return;
    const data = await res.json();
    if (data.threads && Array.isArray(data.threads)) {
      data.threads.forEach((dbThread) => {
        const exists = chatSessions.some((s) => s.id === dbThread.id);
        if (!exists) {
          chatSessions.push({
            id: dbThread.id,
            title: dbThread.title || 'Conversation',
            timestamp: new Date(dbThread.created_at || Date.now()).getTime(),
            turns: [],
          });
        }
      });
      // Sort newest first
      chatSessions.sort((a, b) => b.timestamp - a.timestamp);
      renderRecentChats();
    }
  } catch (err) {
    console.warn('Could not sync threads from SQLite:', err);
  }
}

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

  chatSessions.slice(0, 20).forEach((session) => {
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

function recordTurn(tId, role, content) {
  let session = chatSessions.find((s) => s.id === tId);
  if (!session) {
    session = {
      id: tId,
      title: content.length > 28 ? content.slice(0, 28) + '...' : content,
      timestamp: Date.now(),
      turns: [],
    };
    chatSessions.unshift(session);
  }
  if (!session.turns) session.turns = [];
  session.turns.push({ role, content, createdAt: new Date().toISOString() });
  session.timestamp = Date.now();

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

  // Fetch turns from server backend
  try {
    const res = await fetch(`/api/threads/${id}/turns`);
    if (res.ok) {
      const data = await res.json();
      if (data.turns && data.turns.length > 0) {
        data.turns.forEach((turn) => {
          renderPastMessageBubble(turn.role, turn.content);
        });
        chatViewport.scrollTop = chatViewport.scrollHeight;
        return;
      }
    }
  } catch (e) {
    console.warn('Failed to load thread history from server:', e);
  }

  // Fallback to local stored turns
  const localSession = chatSessions.find((s) => s.id === id);
  if (localSession && localSession.turns && localSession.turns.length > 0) {
    localSession.turns.forEach((turn) => {
      renderPastMessageBubble(turn.role, turn.content);
    });
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }
}

// Clipboard Helper
async function copyToClipboard(text, btnElement, successLabel = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    const origHtml = btnElement.innerHTML;
    btnElement.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>${successLabel}</span>
    `;
    setTimeout(() => {
      btnElement.innerHTML = origHtml;
    }, 2000);
  } catch (err) {
    console.warn('Clipboard write failed:', err);
  }
}

function renderPastMessageBubble(role, content) {
  if (role === 'user') {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper user';
    wrapper.innerHTML = `
      <div class="user-msg-group">
        <button class="btn-copy-user" title="Copy message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <div class="chat-bubble">${escapeText(content)}</div>
      </div>
    `;
    const copyBtn = wrapper.querySelector('.btn-copy-user');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyToClipboard(content, copyBtn, '✓'));
    }
    messagesList.appendChild(wrapper);
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper assistant';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerHTML = renderMarkdown(content);

    // Assistant copy footer
    const footer = document.createElement('div');
    footer.className = 'msg-footer';
    footer.innerHTML = `
      <span class="msg-timestamp">Saved turn</span>
      <button class="btn-copy-msg" title="Copy response">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      </button>
    `;
    const copyBtn = footer.querySelector('.btn-copy-msg');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyToClipboard(content, copyBtn));
    }
    bubble.appendChild(footer);
    wrapper.appendChild(bubble);
    messagesList.appendChild(wrapper);
    attachCopyHandlers(bubble);
  }
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
  if (welcomeCard) welcomeCard.style.display = 'none';
  messagesList.innerHTML = '';

  document.querySelectorAll('.history-item').forEach((item) => {
    if (item.getAttribute('data-preset') === key) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Render past scenario turns into the chat view immediately
  if (p.turns && p.turns.length > 0) {
    p.turns.forEach((turn) => {
      renderPastMessageBubble(turn.role, turn.content);
    });
    chatViewport.scrollTop = chatViewport.scrollHeight;

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

  // Pre-fill query
  userInput.value = p.query;
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  userInput.focus();

  // Save session record and update left sidebar
  recordTurn(p.threadId, 'system', p.title);
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

// ==========================================================================
// Full Robust Markdown Parser with Table Normalization & Code Highlighting
// ==========================================================================
function renderMarkdown(text) {
  if (!text) return '';

  // 1. Separate glue headers like "2026.Verification Summary" -> "\n\n### Verification Summary\n\n"
  text = text.replace(/([^\n])(Verification Summary|###\s*)/gi, '$1\n\n### Verification Summary\n\n');
  text = text.replace(/###\s*###\s*Verification Summary/g, '### Verification Summary');

  // 2. Normalize pipe tables where rows were collapsed onto one line separated by ||
  text = text.replace(/\|\s*\|\s*/g, '|\n|');

  const lines = text.split('\n');
  const result = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];

  function formatInline(cell) {
    let c = cell.trim();
    // Bold
    c = c.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    c = c.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code
    c = c.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Status formatting:
    // "No change found" without square brackets, clean text
    c = c.replace(/`?\[?No change found\]?`?/gi, '<span style="font-weight:600; color:var(--text-main);">No change found</span>');
    // "Changed" IS important, so it is bolded
    c = c.replace(/`?\[?Changed\]?`?/gi, '<strong style="color:var(--text-main); font-weight:700;">Changed</strong>');
    c = c.replace(/`?\[?Unverified\]?`?/gi, '<em>Unverified</em>');
    c = c.replace(/`?\[?Not comparable\]?`?/gi, '<em>Not comparable</em>');
    // Markdown links
    c = c.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return c;
  }

  function flushTable() {
    if (tableHeader.length > 0) {
      let html = '<div class="table-wrapper">';
      html += '<div class="table-header-toolbar"><span>Verification Matrix</span><button class="btn-copy-table" title="Copy table content"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy Table</span></button></div>';
      html += '<table class="markdown-table"><thead><tr>';
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

    // Fenced Code Block Detection
    if (trimmed.startsWith('```')) {
      if (inTable) flushTable();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
        codeLines = [];
      } else {
        // Close code block
        const rawCode = codeLines.join('\n');
        result.push(renderCodeBlock(rawCode, codeLang));
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    // Table Line Detection
    const isTableLine = trimmed.startsWith('|') && trimmed.includes('|', 1);
    if (isTableLine) {
      let clean = trimmed;
      if (clean.startsWith('|')) clean = clean.slice(1);
      if (clean.endsWith('|')) clean = clean.slice(0, -1);
      const cells = clean.split('|').map((s) => s.trim());
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

  if (inCodeBlock) {
    result.push(renderCodeBlock(codeLines.join('\n'), codeLang));
  }
  if (inTable) flushTable();

  return result.join('');
}

function renderCodeBlock(code, lang) {
  const language = lang || 'code';
  return `
    <div class="code-wrapper">
      <div class="code-header">
        <span class="code-language">${escapeText(language)}</span>
        <button class="btn-copy-code" title="Copy code snippet">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
      </div>
      <pre class="code-content"><code>${escapeText(code)}</code></pre>
    </div>
  `;
}

function attachCopyHandlers(container) {
  // Code block copy buttons
  container.querySelectorAll('.btn-copy-code').forEach((btn) => {
    btn.onclick = () => {
      const code = btn.closest('.code-wrapper')?.querySelector('code')?.textContent || '';
      copyToClipboard(code, btn);
    };
  });

  // Table copy buttons
  container.querySelectorAll('.btn-copy-table').forEach((btn) => {
    btn.onclick = () => {
      const table = btn.closest('.table-wrapper')?.querySelector('table');
      if (table) {
        let tsv = '';
        table.querySelectorAll('tr').forEach((row) => {
          const cells = Array.from(row.querySelectorAll('th, td')).map((c) => c.innerText.trim());
          tsv += cells.join('\t') + '\n';
        });
        copyToClipboard(tsv, btn, 'Table Copied!');
      }
    };
  });
}

// ==========================================================================
// Gemini / Antigravity Style Dynamic Reasoning Telemetry Accordion
// ==========================================================================
class LiveTelemetryManager {
  constructor(parentContainer) {
    this.parent = parentContainer;
    this.stepsMap = new Map();
    this.startTime = Date.now();

    this.container = document.createElement('div');
    this.container.className = 'reasoning-block';
    this.parent.appendChild(this.container);

    // Initial reading memory context step
    this.handleStep({
      id: 'memory-check',
      status: 'done',
      title: 'Reading context & memory',
      detail: 'Retrieved conversational memory and established temporal boundary.',
    });

    // Active live thinking state
    this.thinkingStep = document.createElement('div');
    this.thinkingStep.className = 'reasoning-step-item';
    this.thinkingStep.innerHTML = `
      <div class="reasoning-step-header">
        <div class="reasoning-step-left">
          <div class="telemetry-spinner"></div>
          <span class="reasoning-step-title" id="telemetry-thinking-title">Thinking...</span>
        </div>
        <div class="reasoning-step-right">
          <span class="reasoning-step-time" id="telemetry-thinking-time">1s</span>
          <svg class="reasoning-step-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    `;
    this.container.appendChild(this.thinkingStep);

    this.thinkingTitleEl = this.thinkingStep.querySelector('#telemetry-thinking-title');
    this.thinkingTimeEl = this.thinkingStep.querySelector('#telemetry-thinking-time');

    // Ticking elapsed seconds
    this.timerInterval = setInterval(() => {
      const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
      if (this.thinkingTimeEl) {
        this.thinkingTimeEl.textContent = `${elapsedSec}s`;
      }
    }, 1000);
  }

  handleStep(data) {
    let item = this.stepsMap.get(data.id);
    if (!item) {
      item = document.createElement('div');
      item.className = 'reasoning-step-item';
      // Insert before active thinking step if present
      if (this.thinkingStep && this.thinkingStep.parentNode === this.container) {
        this.container.insertBefore(item, this.thinkingStep);
      } else {
        this.container.appendChild(item);
      }
      this.stepsMap.set(data.id, item);
    }

    const isRunning = data.status === 'running';
    item.innerHTML = `
      <div class="reasoning-step-header">
        <div class="reasoning-step-left">
          ${isRunning 
            ? '<div class="telemetry-spinner"></div>' 
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>'}
          <span class="reasoning-step-title">${escapeText(data.title)}</span>
        </div>
        <div class="reasoning-step-right">
          ${data.time ? `<span class="reasoning-step-time">${escapeText(data.time)}</span>` : ''}
          <svg class="reasoning-step-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
      ${data.detail ? `<div class="reasoning-step-detail">${escapeText(data.detail)}</div>` : ''}
    `;

    const headerEl = item.querySelector('.reasoning-step-header');
    if (headerEl) {
      headerEl.onclick = () => {
        item.classList.toggle('open');
      };
    }
  }

  finalize(totalSeconds) {
    clearInterval(this.timerInterval);
    const sec = totalSeconds || Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

    // Convert any lingering spinners across all steps into clean completed checks
    this.stepsMap.forEach((item) => {
      const spinner = item.querySelector('.telemetry-spinner');
      if (spinner) {
        spinner.outerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      }
    });

    if (this.thinkingStep) {
      this.thinkingStep.innerHTML = `
        <div class="reasoning-step-header">
          <div class="reasoning-step-left">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span class="reasoning-step-title">Thought for ${sec}s</span>
          </div>
          <div class="reasoning-step-right">
            <svg class="reasoning-step-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
        <div class="reasoning-step-detail">Grounded real-time verification across temporal conversation history and live search.</div>
      `;

      const headerEl = this.thinkingStep.querySelector('.reasoning-step-header');
      if (headerEl) {
        headerEl.onclick = () => {
          this.thinkingStep.classList.toggle('open');
        };
      }
    }
  }
}

function escapeText(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Staged Non-Glitching Stream Renderer
function createStreamRenderer(targetContainer) {
  let rawText = '';
  let renderScheduled = false;

  function update() {
    renderScheduled = false;
    targetContainer.innerHTML = renderMarkdown(rawText);
    attachCopyHandlers(targetContainer);
  }

  return {
    appendToken(delta) {
      rawText += delta;
      if (!renderScheduled) {
        renderScheduled = true;
        requestAnimationFrame(update);
      }
    },
    finalize() {
      targetContainer.innerHTML = renderMarkdown(rawText);
      attachCopyHandlers(targetContainer);
    },
    getText() {
      return rawText;
    },
  };
}

// ==========================================================================
// Chat Form Submission
// ==========================================================================
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = userInput.value.trim();
  if (!query) return;

  if (welcomeCard) welcomeCard.style.display = 'none';
  userInput.value = '';
  userInput.style.height = 'auto';

  // 1. Record user turn
  recordTurn(threadId, 'user', query);

  // 2. Render user message bubble with copy button
  const userWrapper = document.createElement('div');
  userWrapper.className = 'msg-wrapper user';
  userWrapper.innerHTML = `
    <div class="user-msg-group">
      <button class="btn-copy-user" title="Copy prompt">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <div class="chat-bubble">${escapeText(query)}</div>
    </div>
  `;
  const copyUserBtn = userWrapper.querySelector('.btn-copy-user');
  if (copyUserBtn) {
    copyUserBtn.addEventListener('click', () => copyToClipboard(query, copyUserBtn, '✓'));
  }
  messagesList.appendChild(userWrapper);

  // 3. Prepare assistant wrapper (NO empty chat bubble box created yet!)
  const assistantWrapper = document.createElement('div');
  assistantWrapper.className = 'msg-wrapper assistant';
  messagesList.appendChild(assistantWrapper);

  // Initialize live Antigravity reasoning telemetry
  const telemetryManager = new LiveTelemetryManager(assistantWrapper);

  chatViewport.scrollTop = chatViewport.scrollHeight;

  let assistantBubble = null;
  let streamRenderer = null;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: query,
        threadId,
        provider: currentProvider,
        model: currentModel,
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

            // Live sequential telemetry step event
            if (data.id && (data.status === 'running' || data.status === 'done')) {
              if (data.id === 'thinking' && data.status === 'done') {
                telemetryManager.finalize(data.totalSeconds);
              } else if (data.id === 'thinking' && data.status === 'running') {
                // Ignore duplicate running event
              } else {
                telemetryManager.handleStep(data);
              }
              chatViewport.scrollTop = chatViewport.scrollHeight;
            }
            // First token arrives -> finalize thinking and create response container
            else if (data.delta) {
              if (!assistantBubble) {
                telemetryManager.finalize();
                assistantBubble = document.createElement('div');
                assistantBubble.className = 'chat-bubble';
                assistantWrapper.appendChild(assistantBubble);
                streamRenderer = createStreamRenderer(assistantBubble);
              }
              if (streamRenderer) {
                streamRenderer.appendToken(data.delta);
              }
            }
            // Done event
            else if (data.success && streamRenderer) {
              telemetryManager.finalize();
              streamRenderer.finalize();
              appendAssistantFooter(assistantBubble, streamRenderer.getText());
              recordTurn(threadId, 'assistant', streamRenderer.getText());
            }
            // Error event
            else if (data.error) {
              telemetryManager.finalize();
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

    telemetryManager.finalize();
    if (streamRenderer && assistantBubble && !assistantBubble.querySelector('.msg-footer')) {
      streamRenderer.finalize();
      appendAssistantFooter(assistantBubble, streamRenderer.getText());
      recordTurn(threadId, 'assistant', streamRenderer.getText());
    }
  } catch (err) {
    telemetryManager.finalize();
    if (!assistantBubble) {
      assistantBubble = document.createElement('div');
      assistantBubble.className = 'chat-bubble';
      assistantWrapper.appendChild(assistantBubble);
    }
    assistantBubble.innerHTML = `<span style="color:#ef4444;">${escapeText(err.message)}</span>`;
  }
});

function appendAssistantFooter(bubble, text) {
  if (!bubble || bubble.querySelector('.msg-footer')) return;
  const footer = document.createElement('div');
  footer.className = 'msg-footer';
  footer.innerHTML = `
    <span class="msg-timestamp">Just now</span>
    <button class="btn-copy-msg" title="Copy response">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      <span>Copy</span>
    </button>
  `;
  const copyBtn = footer.querySelector('.btn-copy-msg');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyToClipboard(text, copyBtn));
  }
  bubble.appendChild(footer);
}

// ==========================================================================
// Dynamic Model Picker Popover (Grouped by Provider, Checks Active Keys)
// ==========================================================================
async function initModelPicker() {
  try {
    const res = await fetch('/api/models');
    if (!res.ok) return;
    const data = await res.json();
    renderModelPopover(data);
  } catch (err) {
    console.warn('Failed to load models list:', err);
  }
}

function renderModelPopover(config) {
  if (!modelPopoverList) return;
  modelPopoverList.innerHTML = '';

  const groups = [
    { provider: 'google', title: 'Google Gemini' },
    { provider: 'openai', title: 'OpenAI' },
    { provider: 'anthropic', title: 'Anthropic' },
  ];

  groups.forEach((g) => {
    const groupModels = (config.models || []).filter((m) => m.provider === g.provider);
    if (groupModels.length === 0) return;

    const groupTitle = document.createElement('div');
    groupTitle.className = 'model-popover-group-title';
    groupTitle.textContent = g.title;
    modelPopoverList.appendChild(groupTitle);

    groupModels.forEach((m) => {
      const isSelected = m.id === currentModel;
      const item = document.createElement('div');
      item.className = 'model-popover-item' + (!m.available ? ' disabled' : '') + (isSelected ? ' selected' : '');

      let badgeClass = 'unavailable';
      if (m.available) {
        badgeClass = m.badge.includes('Active') || m.badge.includes('Fast') ? 'active' : 'notice';
      }

      item.innerHTML = `
        <span class="model-item-title">${escapeText(m.name)}</span>
        <div class="model-item-meta">
          <span class="model-badge ${badgeClass}">${escapeText(m.badge)}</span>
          ${isSelected ? '<svg class="model-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
      `;

      if (m.available) {
        item.addEventListener('click', () => {
          currentProvider = m.provider;
          currentModel = m.id;
          currentModelName = m.name;
          if (modelPickerCurrent) modelPickerCurrent.textContent = m.name;
          closeModelPopover();
          renderModelPopover(config);
        });
      }

      modelPopoverList.appendChild(item);
    });
  });
}

function toggleModelPopover() {
  if (!modelPopover) return;
  const isVisible = modelPopover.style.display !== 'none';
  if (isVisible) {
    closeModelPopover();
  } else {
    modelPopover.style.display = 'block';
    if (btnModelPicker) btnModelPicker.classList.add('open');
  }
}

function closeModelPopover() {
  if (modelPopover) modelPopover.style.display = 'none';
  if (btnModelPicker) btnModelPicker.classList.remove('open');
}

if (btnModelPicker) {
  btnModelPicker.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleModelPopover();
  });
}

document.addEventListener('click', (e) => {
  if (modelPopover && modelPopover.style.display !== 'none' && !e.target.closest('.model-picker-container')) {
    closeModelPopover();
  }
});

initModelPicker();

// Initial sync of existing threads from SQLite database & localStorage
syncThreadsFromDatabase();
