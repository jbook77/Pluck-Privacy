# Gmail Attachment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to click a "Send to Pluck" button injected into Gmail emails, which automatically fetches attached PDFs/images via the Gmail API and loads them into the extension popup for extraction.

**Architecture:** A content script watches Gmail's DOM for open emails with attachments and injects a button. Clicking it sends the Gmail message ID to the background service worker, which fetches the attachment bytes via the Gmail API using the existing OAuth token and stores them in `chrome.storage.session`. When the popup opens, it detects the pending files, loads them into `loadedFiles`, and auto-extracts.

**Tech Stack:** Chrome MV3, Gmail REST API v1, `chrome.storage.session`, `chrome.runtime.sendMessage`, `MutationObserver`

---

## File Structure

| File | Change |
|---|---|
| `manifest.json` | Add `gmail.readonly` OAuth scope + `unlimitedStorage` permission |
| `background.js` | Add `FETCH_GMAIL_ATTACHMENTS` handler + `_fetchGmailAttachments()` + helpers |
| `content.js` | Add Gmail button injection via MutationObserver |
| `popup.js` | Add `loadGmailFiles()` + check `pending_gmail_files` on init + `GMAIL_FILES_READY` listener |

---

### Task 1: Manifest — add Gmail scope and unlimitedStorage

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add `gmail.readonly` to OAuth scopes and `unlimitedStorage` to permissions**

Open `manifest.json`. The current `oauth2.scopes` array ends with `"https://www.googleapis.com/auth/calendar.readonly"`. Add the Gmail scope after it. Also add `"unlimitedStorage"` to the `permissions` array.

Replace the `permissions` block and `oauth2.scopes` block so they read:

```json
"permissions": [
  "storage",
  "activeTab",
  "scripting",
  "identity",
  "unlimitedStorage"
],
```

```json
"scopes": [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly"
]
```

- [ ] **Step 2: Verify manifest is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add gmail.readonly scope and unlimitedStorage for Gmail attachment fetch"
```

---

### Task 2: Background — Gmail API attachment fetching

**Files:**
- Modify: `background.js`

The background service worker already handles `SIGN_IN`. Add a handler for `FETCH_GMAIL_ATTACHMENTS` that:
1. Gets the cached OAuth token (non-interactive)
2. Fetches the Gmail message's full payload
3. Recursively finds all parts with a `filename` and `body.attachmentId` where MIME type is `application/pdf` or starts with `image/`
4. Downloads each attachment's base64url data and converts it to standard base64
5. Stores the results in `chrome.storage.session` as `pending_gmail_files`
6. Sets the extension badge to `!` to signal the user
7. Tries to notify the popup via `chrome.runtime.sendMessage` (silently ignores the error if popup is closed)
8. Responds to the content script with `{ ok: true, count: N }` or `{ ok: false, error: ... }`

- [ ] **Step 1: Add the message handler and all helper functions to `background.js`**

Replace the entire contents of `background.js` with:

```javascript
'use strict';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SIGN_IN') {
    _doSignIn().then(result => sendResponse({ ok: true, ...result }))
               .catch(e  => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'FETCH_GMAIL_ATTACHMENTS') {
    _fetchGmailAttachments(msg.messageId)
      .then(count => sendResponse({ ok: true, count }))
      .catch(e   => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

async function _doSignIn() {
  const token = await _getToken(true);
  const userInfo = await _fetchUserInfo(token);
  const calendars = await _fetchCalendarList(token);
  await chrome.storage.local.set({ google_account: userInfo, google_calendars: calendars });
  return { userInfo, calendars };
}

function _getToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Not signed in'));
      } else {
        resolve(token);
      }
    });
  });
}

async function _fetchUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Could not fetch user info');
  const d = await res.json();
  return { email: d.email, name: d.name };
}

async function _fetchCalendarList(token) {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Could not fetch calendar list');
  const data = await res.json();
  return (data.items || []).map(cal => ({
    id: cal.id,
    name: cal.summary,
    color: cal.backgroundColor || '#4285f4',
    accessRole: cal.accessRole || 'reader'
  }));
}

// ── Gmail attachment fetching ─────────────────────────────────────────────────

async function _fetchGmailAttachments(messageId) {
  const token = await _getToken(false);

  // Fetch full message payload
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!msgRes.ok) throw new Error('Could not fetch Gmail message (status ' + msgRes.status + ')');
  const msg = await msgRes.json();

  // Collect all attachment parts recursively
  const attachParts = [];
  _collectAttachmentParts(msg.payload, attachParts);

  const qualifying = attachParts.filter(p => {
    const mt = (p.mimeType || '').toLowerCase();
    const fn = (p.filename || '').toLowerCase();
    return mt === 'application/pdf'
      || mt.startsWith('image/')
      || (mt === 'application/octet-stream' && fn.endsWith('.pdf'));
  });

  if (!qualifying.length) throw new Error('No PDF or image attachments found in this email');

  // Download each attachment
  const files = [];
  for (const part of qualifying) {
    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!attRes.ok) throw new Error('Could not fetch attachment: ' + part.filename);
    const attData = await attRes.json();

    // Gmail uses base64url — convert to standard base64
    const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/');
    const mimeType = (part.mimeType === 'application/octet-stream' && part.filename.toLowerCase().endsWith('.pdf'))
      ? 'application/pdf'
      : part.mimeType;

    files.push({
      name: part.filename,
      base64,
      mimeType,
      kind: mimeType === 'application/pdf' ? 'travel' : 'image'
    });
  }

  // Store for popup to pick up
  await chrome.storage.session.set({ pending_gmail_files: files });

  // Badge the icon so user knows files are waiting
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#3ecf8e' });

  // Notify popup if it's already open (ignore error if it's not)
  chrome.runtime.sendMessage({ type: 'GMAIL_FILES_READY' }, () => {
    void chrome.runtime.lastError; // suppress "no receiver" error
  });

  return files.length;
}

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

- [ ] **Step 2: Verify syntax**

```bash
node --check background.js && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: background handles FETCH_GMAIL_ATTACHMENTS via Gmail API"
```

---

### Task 3: Content script — inject "Send to Pluck" button in Gmail

**Files:**
- Modify: `content.js`

The content script already handles `GET_PAGE_TEXT`. Add a second responsibility: when on `mail.google.com`, watch for emails with attachments and inject a "Send to Pluck" button near the attachment area.

Key details:
- Use a `MutationObserver` on `document.body` to detect Gmail SPA navigation
- Find the open email by looking for `[data-message-id]` elements that also contain an attachment area (`[data-legacy-attachment-id], .aQH, .aZo`)
- Track the last injected message ID to avoid re-injecting on unrelated DOM mutations
- The button is a styled `<button>` inserted immediately after the attachment container
- On click: send `{ type: 'FETCH_GMAIL_ATTACHMENTS', messageId }` to background, show "Sending…" while waiting, then show success or error

- [ ] **Step 1: Replace `content.js` with the new version that adds Gmail button injection**

```javascript
'use strict';

// ── Page text extraction (existing) ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_TEXT') {
    try {
      let text = '';
      const gmailBody = document.querySelector('.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s');
      if (gmailBody) {
        text = gmailBody.innerText;
      } else {
        text = document.body ? document.body.innerText : '';
      }
      sendResponse({ text: text.slice(0, 20000) });
    } catch(e) {
      sendResponse({ text: '', error: e.message });
    }
  }
  return true;
});

// ── Gmail "Send to Pluck" button injection ────────────────────────────────────
// Wrap in if-block — bare top-level return is a SyntaxError in content scripts
if (location.hostname === 'mail.google.com') {

  let _lastInjectedMsgId = null;

  function _findOpenEmailWithAttachments() {
    // Gmail marks each expanded message with data-message-id.
    // We look for one that also contains an attachment strip.
    const candidates = document.querySelectorAll('[data-message-id]');
    for (const el of candidates) {
      const attachArea = el.querySelector('[data-legacy-attachment-id], .aQH, .aZo');
      if (attachArea) {
        return { messageId: el.getAttribute('data-message-id'), attachArea };
      }
    }
    return null;
  }

  function _injectPluckButton(messageId, attachArea) {
    if (_lastInjectedMsgId === messageId) return;   // already injected for this message
    _lastInjectedMsgId = messageId;

    // Remove any previous button
    const old = document.getElementById('pluck-gmail-wrap');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.id = 'pluck-gmail-wrap';
    wrap.style.cssText = 'margin:6px 0 2px; padding:0 8px;';

    const btn = document.createElement('button');
    btn.id = 'pluck-gmail-btn';
    btn.textContent = '✈ Send to Pluck';
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
            btn.textContent = '✓ Sent (' + resp.count + ' file' + (resp.count === 1 ? '' : 's') + ') — open Pluck';
            btn.style.color = '#3ecf8e';
            btn.style.borderColor = '#3ecf8e';
          } else {
            const err = (resp && resp.error) || 'Unknown error';
            btn.textContent = '✗ ' + err;
            btn.style.color = '#ff6b6b';
            btn.style.borderColor = '#ff6b6b';
            btn.disabled = false;
          }
        }
      );
    });

    wrap.appendChild(btn);
    // Insert immediately after the attachment area container
    const container = attachArea.closest('.aQH, .aZo, .aJ6');
    if (container) {
      container.insertAdjacentElement('afterend', wrap);
    } else {
      attachArea.insertAdjacentElement('afterend', wrap);
    }
  }

  // Watch for Gmail SPA navigation and email opens
  const _gmailObserver = new MutationObserver(() => {
    const result = _findOpenEmailWithAttachments();
    if (result) {
      _injectPluckButton(result.messageId, result.attachArea);
    }
  });

  _gmailObserver.observe(document.body, { childList: true, subtree: true });

} // end if (mail.google.com)
```

- [ ] **Step 2: Verify syntax**

```bash
node --check content.js && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: inject Send to Pluck button in Gmail emails with attachments"
```

---

### Task 4: Popup — receive and load pending Gmail files

**Files:**
- Modify: `popup.js`

Two changes needed:

**A.** In `DOMContentLoaded` (after the Google sign-in state is restored, around line 123), add:
- Check `chrome.storage.session` for `pending_gmail_files` on every popup open; if present, call `loadGmailFiles()` and clear the session key + badge
- Add a `chrome.runtime.onMessage` listener for `GMAIL_FILES_READY` that does the same

**B.** Add the `loadGmailFiles(files)` function after the `handlePaste` / `flashDropZone` block (around line 477).

- [ ] **Step 1: Add `loadGmailFiles()` function after `flashDropZone()`**

Find the line:

```javascript
// ─── Main extraction ──────────────────────────────────────────────────────────
```

Insert the following block immediately before it:

```javascript
// ─── Gmail file intake ────────────────────────────────────────────────────────
function loadGmailFiles(files) {
  files.forEach(f => {
    loadedFiles.push({
      name:      f.name,
      base64:    f.base64,
      mimeType:  f.mimeType,
      kind:      f.kind,
      previewSrc: null
    });
  });
  renderFileList();
  document.getElementById('extract-btn').disabled = false;
  clearResults();
  flashDropZone();
  clearTimeout(autoExtractDebounce);
  autoExtractDebounce = setTimeout(runExtract, 150);
}

async function _pickUpPendingGmailFiles() {
  const r = await new Promise(resolve => chrome.storage.session.get('pending_gmail_files', resolve));
  if (!r.pending_gmail_files || !r.pending_gmail_files.length) return;
  const files = r.pending_gmail_files;
  await new Promise(resolve => chrome.storage.session.remove('pending_gmail_files', resolve));
  chrome.action.setBadgeText({ text: '' });
  loadGmailFiles(files);
}

```

- [ ] **Step 2: Wire up the pending-file check and message listener in `DOMContentLoaded`**

Find this block near the end of `DOMContentLoaded` (around line 113–123):

```javascript
  // Restore Google sign-in state
  chrome.storage.local.get(['google_account', 'google_calendars', 'google_last_calendar'], async (r) => {
    if (r.google_account) {
      googleAccount = r.google_account;
      googleCalendars = r.google_calendars || [];
      renderFooterSignedIn(googleAccount);
      await renderCalendarPicker(googleCalendars, r.google_last_calendar || null);
    } else {
      renderFooterSignedOut();
    }
  });
});
```

Replace it with:

```javascript
  // Restore Google sign-in state
  chrome.storage.local.get(['google_account', 'google_calendars', 'google_last_calendar'], async (r) => {
    if (r.google_account) {
      googleAccount = r.google_account;
      googleCalendars = r.google_calendars || [];
      renderFooterSignedIn(googleAccount);
      await renderCalendarPicker(googleCalendars, r.google_last_calendar || null);
    } else {
      renderFooterSignedOut();
    }
    // Pick up any files sent from Gmail while popup was closed
    _pickUpPendingGmailFiles();
  });

  // Also pick up files if popup is already open when Gmail sends them
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GMAIL_FILES_READY') {
      _pickUpPendingGmailFiles();
    }
  });
});
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: popup picks up pending Gmail files on open or GMAIL_FILES_READY message"
```

---

## Manual Test Plan

After all tasks are complete, reload the extension at `chrome://extensions` (click the refresh icon on the extension card).

1. **Re-authorize Google** — because a new OAuth scope was added, users need to re-authorize. Go to the extension popup → sign out → sign in again. Chrome will prompt for the new `gmail.readonly` permission.

2. **Basic happy path:**
   - Open Gmail, open an email that has PDF attachments (e.g., a travel confirmation)
   - Verify a green "✈ Send to Pluck" button appears below the attachment area
   - Click it — button should change to "Sending…" then "✓ Sent (N files) — open Pluck"
   - Click the extension icon to open the popup
   - Verify the PDF files appear in the file list and extraction runs automatically
   - Verify the extension badge `!` is cleared after popup opens

3. **Popup already open:**
   - Open the extension popup first
   - Then go to Gmail and click "Send to Pluck" on an email
   - Verify the files appear in the popup immediately without reopening it

4. **No attachments / non-PDF attachments:**
   - Open an email with no attachments or only `.docx` attachments
   - Verify no "Send to Pluck" button appears (or if it appears, clicking it shows an error: "No PDF or image attachments found")

5. **Multiple emails open:**
   - If Gmail is in split view with two emails open, verify the button appears on the one with attachments, not both

6. **Not signed in:**
   - Sign out of Google in the extension
   - Click "Send to Pluck" in Gmail
   - Verify an error is shown ("Not signed in")
