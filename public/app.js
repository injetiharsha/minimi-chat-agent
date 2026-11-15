const threadId = 'session-' + Date.now();
const messagesList = document.getElementById('messages-list');
const welcomeCard = document.getElementById('welcome-card');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const statusBanner = document.getElementById('status-banner');
const clockDisplay = document.getElementById('clock-display');

// Update clock display
function updateClock() {
  const now = new Date();
  clockDisplay.textContent = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
setInterval(updateClock, 1000);
updateClock();

// Auto-expand textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = userInput.scrollHeight + 'px';
});

// Prompt chip click handler
document.querySelectorAll('.prompt-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    userInput.value = chip.getAttribute('data-query');
    userInput.focus();
  });
});

// Quick Seed Grader Buttons
document.getElementById('btn-seed-crm').addEventListener('click', async () => {
  statusBanner.textContent = 'Seeding Monday CRM Shortlist (2026-11-09)...';
  await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId,
      title: 'CRM Evaluation',
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
    }),
  });
  statusBanner.textContent = '✓ Seeded Monday CRM Shortlist. Ready to test!';
  userInput.value = 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?';
  userInput.focus();
  await loadHistory();
});

document.getElementById('btn-seed-postgres').addEventListener('click', async () => {
  statusBanner.textContent = 'Seeding Last Tuesday Postgres Hosting (2026-11-03)...';
  await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId,
      title: 'Postgres Hosting',
      turns: [
        {
          role: 'user',
          content: 'What are the top managed Postgres hosting providers and their pricing?',
          createdAt: '2026-11-03T14:00:00Z',
        },
        {
          role: 'assistant',
          content: `Here are the top Postgres hosting providers:
1. Supabase: Pro tier starts at $25/month with 8GB storage and automatic backups.
2. Neon: Serverless Postgres with autoscaling compute and a free tier with 0.5 GB storage.`,
          createdAt: '2026-11-03T14:01:00Z',
        },
      ],
    }),
  });
  statusBanner.textContent = '✓ Seeded Last Tuesday Postgres chat. Ready to test!';
  userInput.value = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';
  userInput.focus();
  await loadHistory();
});

document.getElementById('btn-seed-nov3').addEventListener('click', async () => {
  statusBanner.textContent = 'Seeding 3 November Question...';
  await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId,
      title: '3 November Question',
      turns: [
        {
          role: 'user',
          content: 'What is the pricing model for Neon serverless Postgres?',
          createdAt: '2026-11-03T11:00:00Z',
        },
        {
          role: 'assistant',
          content: 'Neon offers a Free tier with 0.5 GB storage and pay-as-you-go compute units at $0.16/CU-hour.',
          createdAt: '2026-11-03T11:01:00Z',
        },
      ],
    }),
  });
  statusBanner.textContent = '✓ Seeded 3 Nov chat. Ready to test!';
  userInput.value = 'What did I ask you on 3 November? Is your answer still correct today?';
  userInput.focus();
  await loadHistory();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  window.location.reload();
});

async function loadHistory() {
  const res = await fetch(`/api/history/${threadId}`);
  const data = await res.json();
  if (data.turns && data.turns.length > 0) {
    if (welcomeCard) welcomeCard.style.display = 'none';
    messagesList.innerHTML = '';
    data.turns.forEach((t) => appendMessage(t.role, t.content, t.created_at));
  }
}

function appendMessage(role, text, timestamp = new Date().toISOString()) {
  if (welcomeCard) welcomeCard.style.display = 'none';
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `${role === 'user' ? 'You' : 'Minimi'} • ${timeStr}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = renderMarkdown(text);

  row.appendChild(meta);
  row.appendChild(bubble);
  messagesList.appendChild(row);
  row.scrollIntoView({ behavior: 'smooth' });
  return bubble;
}

// Minimal markdown converter (tables, bold, links, code)
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table><tbody>';
      }
      if (line.includes('---')) continue; // skip divider
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      tableHtml += '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
    } else {
      if (inTable) {
        inTable = false;
        tableHtml += '</tbody></table>';
        processedLines.push(tableHtml);
      }
      processedLines.push(line);
    }
  }
  if (inTable) {
    tableHtml += '</tbody></table>';
    processedLines.push(tableHtml);
  }

  html = processedLines.join('\n');

  // Bold & Italics
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Markdown links
  html = html.replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Linebreaks
  html = html.replace(/\n\n/g, '<br><br>');

  return html;
}

// Form Submission & SSE Handler
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  userInput.style.height = 'auto';

  // Append user bubble
  appendMessage('user', text);

  // Prepare assistant bubble
  const assistantBubble = appendMessage('assistant', '');
  statusBanner.textContent = 'Thinking...';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        threadId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();
          continue;
        }
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
              preambleDiv.className = 'preamble-pill';
              preambleDiv.innerHTML = `⚡ ${data.text}`;
              assistantBubble.parentNode.insertBefore(preambleDiv, assistantBubble);
            }
          } catch {}
        }
      }
    }
    statusBanner.textContent = '';
  } catch (err) {
    statusBanner.textContent = 'Error: ' + err.message;
  }
});

// Database Visualizer Logic
const dbModal = document.getElementById('db-modal');
const btnViewDb = document.getElementById('btn-view-db');
const btnCloseDb = document.getElementById('btn-close-db');

btnViewDb.addEventListener('click', async () => {
  dbModal.style.display = 'flex';
  await loadDatabaseState();
});

btnCloseDb.addEventListener('click', () => {
  dbModal.style.display = 'none';
});

// Tab switching
document.querySelectorAll('.db-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.db-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.db-tab-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const targetPane = document.getElementById(tab.getAttribute('data-tab'));
    if (targetPane) targetPane.classList.add('active');
  });
});

async function loadDatabaseState() {
  try {
    const res = await fetch('/api/db');
    const data = await res.json();

    // Render Threads
    renderTable('tab-threads', data.threads, ['id', 'title', 'created_at']);

    // Render Turns
    renderTable('tab-turns', data.turns, ['id', 'thread_id', 'role', 'content', 'created_at']);

    // Render Observations
    renderTable('tab-observations', data.observations, ['id', 'entity', 'attribute', 'value', 'currency', 'plan', 'as_of']);

    // Render Cache
    renderTable('tab-cache', data.cacheStats, ['total_cached']);
  } catch (e) {
    console.error('Failed to load DB state:', e);
  }
}

function renderTable(containerId, rows, columns) {
  const container = document.getElementById(containerId);
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No records found in this table.</p>';
    return;
  }

  let html = '<table class="db-table"><thead><tr>';
  columns.forEach((col) => {
    html += `<th>${col}</th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach((row) => {
    html += '<tr>';
    columns.forEach((col) => {
      let val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
      if (val.length > 80) val = val.slice(0, 80) + '...';
      html += `<td title="${String(row[col] || '')}">${val}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}
