# Skill: Inject a "Send to Extension" Button in Gmail

## What This Does

When a user opens an email in Gmail that has PDF or image attachments, this feature **injects a button directly into the Gmail UI** (next to the attachment area). Clicking it fetches the attachments via the Gmail API and loads them into the extension's popup — no downloading, no drag-and-drop, no copy-paste.

The feature also includes a **toggle switch in the extension's settings** so users can turn the Gmail button on or off without disabling the extension.

---

## Architecture Overview

Three parts work together:

1. **Content script** (runs inside Gmail tab) — detects emails with attachments, injects the button, sends a message to the background when clicked
2. **Background service worker** — receives the message, fetches attachment data via Gmail API, stores files in `chrome.storage.session`, badges the extension icon
3. **Popup** — on open, checks `chrome.storage.session` for pending files, loads them into the extension's normal processing flow

```
Gmail tab                    Background SW              Popup
─────────                    ─────────────              ─────
[User opens email]
  │
  ├─ content.js detects
  │  attachments, injects
  │  "Send to Extension" btn
  │
  ├─ [User clicks button] ──→ FETCH_GMAIL_ATTACHMENTS
  │                            │
  │                            ├─ getAuthToken()
  │                            ├─ Gmail API: get message
  │                            ├─ Gmail API: get attachments
  │                            ├─ Filter out inline images
  │                            ├─ Store in session storage
  │                            ├─ Badge icon with "!"
  │                            └─ Send GMAIL_FILES_READY ──→ [if open] load files
  │                                                          [if closed] files wait
  │                                                           in session storage
  ├─ [Button shows "Sent ✓"]
```

---

## Prerequisites Checklist

### 1. Gmail API Scope

Add to `manifest.json > oauth2 > scopes`:

```json
"https://www.googleapis.com/auth/gmail.readonly"
```

### 2. Gmail API Enabled in GCP

Go to **APIs & Services > Enabled APIs** in your Google Cloud Console project:

- [ ] **Gmail API** is enabled (this is separate from the OAuth scope — both are required)

### 3. Required Permissions in `manifest.json`

```json
"permissions": ["storage", "identity", "unlimitedStorage"]
```

- `unlimitedStorage` — attachment data (base64 PDFs/images) can be large; without this, `chrome.storage.session` may hit quota limits

### 4. Content Script Registered for Gmail

In `manifest.json > content_scripts`, ensure your content script runs on Gmail:

```json
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["content.js"],
  "run_at": "document_idle"
}]
```

Or more targeted: `"matches": ["https://mail.google.com/*"]`

### 5. Host Permissions

```json
"host_permissions": [
  "https://www.googleapis.com/*"
]
```

Required for `fetch()` calls to the Gmail API from the background service worker.

### 6. OAuth Token Access

Same as the Drive/Calendar skill — you need a `getAuthToken()` function. See that skill's prerequisites.

---

## Implementation

### Part 1: Background Service Worker — Fetch Gmail Attachments

This code goes in your background service worker (e.g., `background.js`).

#### Session Storage Access

At the **top** of the service worker, add this line so the popup can read session storage:

```javascript
chrome.storage.session.setAccessLevel({
  accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
});
```

Without this, `chrome.storage.session` is only accessible from the service worker in MV3.

#### Message Listener

```javascript
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH_GMAIL_ATTACHMENTS') {
    _fetchGmailAttachments(msg.messageId)
      .then(count => sendResponse({ ok: true, count }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }
});
```

#### Attachment Fetching Logic

```javascript
async function _fetchGmailAttachments(messageId) {
  if (!messageId) throw new Error('No message ID provided');

  // Gmail DOM IDs may have prefixes like "#msg-f:" or "msg-f:" — strip them
  messageId = messageId.replace(/^#?msg-[a-z]:/, '');

  // Gmail DOM stores IDs as decimal but the API expects hex
  if (/^\d+$/.test(messageId)) {
    messageId = BigInt(messageId).toString(16);
  }

  const token = await getAuthToken(false);

  // Try as message ID first; if that fails, try as thread ID
  let msgJson;
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );

  if (msgRes.ok) {
    msgJson = await msgRes.json();
  } else {
    // Might be a thread ID — try threads endpoint
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(messageId)}?format=full`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!threadRes.ok) {
      throw new Error('Could not fetch Gmail message (msg status '
        + msgRes.status + ', thread status ' + threadRes.status + ')');
    }
    const threadJson = await threadRes.json();
    const msgs = threadJson.messages || [];
    // Find the message with attachments (prefer the last/most recent one)
    msgJson = msgs.reverse().find(m => {
      const parts = [];
      _collectAttachmentParts(m.payload, parts);
      return parts.length > 0;
    });
    if (!msgJson) throw new Error('No message with attachments found in this thread');
  }

  // Collect all attachment parts recursively
  const attachParts = [];
  _collectAttachmentParts(msgJson.payload, attachParts);
  const resolvedMessageId = msgJson.id;

  // Filter: keep only real attachments (PDFs and images), skip inline images
  const qualifying = attachParts.filter(p => {
    const mt = (p.mimeType || '').toLowerCase();
    const fn = (p.filename || '').toLowerCase();

    // Skip inline images (email signatures, logos)
    const headers = p.headers || [];
    const disposition = headers.find(h => h.name.toLowerCase() === 'content-disposition');
    const contentId = headers.find(h => h.name.toLowerCase() === 'content-id');
    if (disposition && disposition.value.toLowerCase().startsWith('inline')) return false;
    if (contentId && mt.startsWith('image/')) return false;

    // Keep PDFs and images
    return mt === 'application/pdf'
      || mt.startsWith('image/')
      || (mt === 'application/octet-stream' && fn.endsWith('.pdf'));
  });

  if (!qualifying.length) throw new Error('No PDF or image attachments found in this email');

  // Download each attachment
  const files = [];
  for (const part of qualifying) {
    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(resolvedMessageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!attRes.ok) throw new Error('Could not fetch attachment: ' + part.filename);
    const attData = await attRes.json();

    // Gmail uses base64url encoding — convert to standard base64
    const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/');
    const mimeType = (part.mimeType === 'application/octet-stream'
      && part.filename.toLowerCase().endsWith('.pdf'))
      ? 'application/pdf' : part.mimeType;

    files.push({
      name: part.filename,
      base64,
      mimeType,
      kind: mimeType === 'application/pdf' ? 'document' : 'image'
    });
  }

  // Store for popup to pick up
  await chrome.storage.session.set({ pending_gmail_files: files });

  // Badge the icon so user knows files are waiting
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#3ecf8e' });

  // Notify popup if it's already open
  chrome.runtime.sendMessage({ type: 'GMAIL_FILES_READY' }, () => {
    void chrome.runtime.lastError; // suppress "no receiver" error
  });

  return files.length;
}

// Recursively collect parts that have attachment IDs
function _collectAttachmentParts(part, result) {
  if (!part) return;
  if (part.filename && part.body && part.body.attachmentId) {
    result.push(part);
  }
  if (part.parts) {
    part.parts.forEach(p => _collectAttachmentParts(p, result));
  }
}
```

**Key details on inline image filtering:**
Gmail emails (especially replies/forwards) embed signature images, logos, and tracking pixels as MIME parts. These look like attachments but aren't real files the user cares about. The filter checks two things:
- `Content-Disposition: inline` header → skip
- Has a `Content-ID` header AND is an image → skip (embedded CID image)

Without this filter, a single email can produce 6-8 "attachments" that are just signature images.

---

### Part 2: Content Script — Button Injection in Gmail

This code runs inside the Gmail tab. Wrap it in a hostname check so it only activates on Gmail.

```javascript
if (location.hostname === 'mail.google.com') {

  let _lastInjectedMsgId = null;
  let _gmailButtonEnabled = true;

  // Read initial setting
  chrome.storage.local.get('gmail_button_enabled', r => {
    _gmailButtonEnabled = r.gmail_button_enabled !== false; // default: on
    if (!_gmailButtonEnabled) _removeButton();
  });

  // React to setting changes in real time (no page reload needed)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.gmail_button_enabled) {
      _gmailButtonEnabled = changes.gmail_button_enabled.newValue !== false;
      if (!_gmailButtonEnabled) _removeButton();
    }
  });

  function _removeButton() {
    const old = document.getElementById('ext-gmail-wrap');
    if (old) old.remove();
    _lastInjectedMsgId = null;
  }

  function _findOpenEmailWithAttachments() {
    // Gmail marks each expanded message with data-message-id
    const candidates = document.querySelectorAll('[data-message-id]');
    for (const el of candidates) {
      const attachArea = el.querySelector('[data-legacy-attachment-id], .aQH, .aZo');
      if (attachArea) {
        return { messageId: el.getAttribute('data-message-id'), attachArea };
      }
    }
    return null;
  }

  function _injectButton(messageId, attachArea) {
    if (_lastInjectedMsgId === messageId) return;
    _lastInjectedMsgId = messageId;

    const old = document.getElementById('ext-gmail-wrap');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.id = 'ext-gmail-wrap';
    wrap.style.cssText = 'margin:6px 0 2px; padding:0 8px;';

    const btn = document.createElement('button');
    btn.id = 'ext-gmail-btn';
    // Customize this text and styling for your extension
    btn.textContent = '📎 Send to Extension';
    btn.style.cssText = [
      'background:#1a1a2e',
      'color:#3ecf8e',
      'border:1px solid #3ecf8e',
      'border-radius:4px',
      'padding:5px 14px',
      'font-size:12px',
      'font-family:sans-serif',
      'cursor:pointer',
      'line-height:1.4'
    ].join(';');

    btn.addEventListener('click', () => {
      btn.textContent = 'Sending…';
      btn.disabled = true;
      chrome.runtime.sendMessage(
        { type: 'FETCH_GMAIL_ATTACHMENTS', messageId },
        (resp) => {
          if (resp && resp.ok) {
            btn.textContent = '✓ Sent (' + resp.count + ' file'
              + (resp.count === 1 ? '' : 's') + ') — open extension';
            btn.style.color = '#3ecf8e';
            btn.style.borderColor = '#3ecf8e';
          } else {
            btn.textContent = '✗ ' + ((resp && resp.error) || 'Unknown error');
            btn.style.color = '#ff6b6b';
            btn.style.borderColor = '#ff6b6b';
            btn.disabled = false;
          }
        }
      );
    });

    wrap.appendChild(btn);
    const container = attachArea.closest('.aQH, .aZo, .aJ6');
    if (container) {
      container.insertAdjacentElement('afterend', wrap);
    } else {
      attachArea.insertAdjacentElement('afterend', wrap);
    }
  }

  // MutationObserver watches for Gmail SPA navigation (throttled)
  let _scanTimer = null;
  const _observer = new MutationObserver(() => {
    if (_scanTimer) return;
    _scanTimer = setTimeout(() => {
      _scanTimer = null;
      if (!_gmailButtonEnabled) return;
      const result = _findOpenEmailWithAttachments();
      if (result) {
        _injectButton(result.messageId, result.attachArea);
      } else if (_lastInjectedMsgId) {
        _removeButton();
      }
    }, 300);
  });

  _observer.observe(document.body, { childList: true, subtree: true });

} // end Gmail-only block
```

**Why MutationObserver with throttle:**
Gmail is a single-page app. Opening an email doesn't trigger a page load — the DOM mutates in place. A `MutationObserver` on `document.body` catches these changes. The 300ms throttle prevents performance issues from Gmail's frequent DOM updates.

**Why the deduplication (`_lastInjectedMsgId`):**
Without it, every DOM mutation (Gmail makes hundreds per second) would re-inject the button.

---

### Part 3: Popup — Pick Up Pending Files

When the popup opens, check session storage for files sent from Gmail:

```javascript
async function pickUpPendingGmailFiles() {
  const r = await new Promise(resolve =>
    chrome.storage.session.get('pending_gmail_files', resolve)
  );
  if (!r.pending_gmail_files || !r.pending_gmail_files.length) return;

  const files = r.pending_gmail_files;

  // Clear session storage and badge
  await new Promise(resolve =>
    chrome.storage.session.remove('pending_gmail_files', resolve)
  );
  chrome.action.setBadgeText({ text: '' });

  // Load files into your extension's normal processing flow
  // This part is specific to your extension — adapt as needed
  loadFiles(files);
}

// Call on popup open
document.addEventListener('DOMContentLoaded', () => {
  pickUpPendingGmailFiles();
});

// Also listen for files arriving while popup is already open
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GMAIL_FILES_READY') {
    pickUpPendingGmailFiles();
  }
});
```

---

### Part 4: Settings Toggle (Optional but Recommended)

Add a toggle in your settings UI that controls whether the Gmail button appears. The content script already reads and reacts to this setting (see Part 2).

**Storage key:** `gmail_button_enabled` (boolean, defaults to `true` if absent)

**Toggle UI example** (adapt to your settings layout):

```html
<div class="gmail-toggle-row">
  <span>Show button in Gmail</span>
  <button class="toggle-switch" id="gmail-btn-toggle"></button>
</div>
```

```javascript
// Read current value
const enabled = await new Promise(r =>
  chrome.storage.local.get('gmail_button_enabled', d =>
    r(d.gmail_button_enabled !== false)
  )
);

// Toggle on click
document.getElementById('gmail-btn-toggle').addEventListener('click', async () => {
  const cur = await new Promise(r =>
    chrome.storage.local.get('gmail_button_enabled', d =>
      r(d.gmail_button_enabled !== false)
    )
  );
  await chrome.storage.local.set({ gmail_button_enabled: !cur });
  // Re-render your settings UI
});
```

The content script picks up changes in real time via `chrome.storage.onChanged` — no Gmail page reload needed.

---

## Gotchas and Lessons Learned

| Issue | Solution |
|---|---|
| **Gmail API returns 403** | The Gmail API is not enabled in GCP Console (separate from the OAuth scope) |
| **Gmail API returns 400 with the message ID** | Gmail's DOM `data-message-id` attribute uses decimal IDs; the API expects hex. Convert with `BigInt(id).toString(16)` |
| **Message ID has a prefix like `#msg-f:`** | Strip it: `messageId.replace(/^#?msg-[a-z]:/, '')` |
| **Too many "attachments" fetched (signature images, logos)** | Filter by `Content-Disposition` and `Content-ID` headers (see inline image filtering above) |
| **Popup can't read `chrome.storage.session`** | Must call `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` in the service worker |
| **Gmail base64 data has `-` and `_` characters** | Gmail uses base64url encoding. Convert to standard base64: `.replace(/-/g, '+').replace(/_/g, '/')` |
| **Button re-injects on every tiny DOM change** | Track `_lastInjectedMsgId` and skip if the message hasn't changed |
| **Old cached OAuth token doesn't include Gmail scope** | Must revoke and re-prompt (see Token Refresh section in the Drive/Calendar skill) |

---

## File Structure

Adapt to your codebase. The three logical pieces are:

- **content.js** — Gmail button injection (runs in Gmail tab)
- **background.js** — Gmail API fetch + session storage (service worker)
- **popup.js** — Pick up pending files on open
