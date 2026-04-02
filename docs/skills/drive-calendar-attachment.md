# Skill: Attach Files to Google Calendar Events via Drive

## What This Does

When your extension creates a Google Calendar event, this feature **automatically uploads the source document (PDF, image, etc.) to Google Drive and attaches it to the calendar event**. The user sees the file as a clickable attachment inside their Google Calendar event — no manual upload needed.

Without this, extensions that create calendar events via URL parameters (`calendar.google.com/calendar/render?action=TEMPLATE&...`) cannot attach files. This skill replaces that URL-based approach with the Calendar API for event creation.

---

## Prerequisites Checklist

Before implementing, verify each of these. If any are missing, the steps to add them are included.

### 1. Google Cloud Project with OAuth

- [ ] A GCP project exists with OAuth 2.0 credentials (Chrome app type)
- [ ] The `client_id` is in `manifest.json` under `oauth2.client_id`

### 2. Required OAuth Scopes in `manifest.json`

Check that `manifest.json > oauth2 > scopes` includes:

```json
"scopes": [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events"
]
```

- `drive.file` — lets the extension upload files to the user's Drive (only files created by the app are accessible)
- `calendar.events` — lets the extension create/modify events on the user's calendars

If these scopes are new, users will need to re-authenticate. See "Token Refresh After Adding Scopes" below.

### 3. APIs Enabled in Google Cloud Console

Go to **APIs & Services > Enabled APIs** in the GCP project and confirm:

- [ ] **Google Drive API** is enabled
- [ ] **Google Calendar API** is enabled

These are separate from the OAuth scopes — the scopes grant permission, but the APIs must also be turned on for the project.

### 4. Host Permissions in `manifest.json`

```json
"host_permissions": [
  "https://www.googleapis.com/*"
]
```

This allows `fetch()` calls to Google's API endpoints from extension scripts.

### 5. OAuth Token Access

You need a function that returns a valid Google OAuth token. If the extension already uses `chrome.identity.getAuthToken`, you're set. Example:

```javascript
function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'Not signed in'));
      } else {
        resolve(token);
      }
    });
  });
}
```

---

## Implementation

### Step 1: Upload a File to Google Drive

This function takes a file object with `{ name, mimeType, base64 }` and uploads it via Drive's multipart upload endpoint. Returns the Drive file ID.

```javascript
async function uploadToDrive(token, file) {
  const metadata = { name: file.name, mimeType: file.mimeType };
  const boundary = 'upload_bnd_' + Date.now();
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    '--' + boundary,
    'Content-Type: ' + file.mimeType,
    'Content-Transfer-Encoding: base64',
    '',
    file.base64,
    '--' + boundary + '--'
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'Drive upload failed');
  }
  return (await res.json()).id;
}
```

**Key details:**
- Uses `multipart/related` encoding — metadata and file content in one request
- File content is sent as base64 (no need to decode to binary)
- `fields=id` limits the response to just the file ID (faster)
- `drive.file` scope means the extension can only access files it created — no access to the user's other Drive files

### Step 2: Create a Calendar Event with Attachment

This function creates a calendar event and optionally attaches Drive files to it.

```javascript
async function createCalendarEvent(token, calendarId, eventData, fileIds) {
  const event = {
    summary: eventData.title,
    start: { dateTime: eventData.startISO },
    end: { dateTime: eventData.endISO },
    location: eventData.location || '',
    description: eventData.description || ''
  };

  // Attach Drive files if any were uploaded
  if (fileIds && fileIds.length) {
    event.attachments = fileIds.map(id => ({
      fileUrl: 'https://drive.google.com/open?id=' + id
    }));
  }

  // supportsAttachments=true is REQUIRED when the event body contains attachments
  const qs = (fileIds && fileIds.length) ? '?supportsAttachments=true' : '';
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/'
      + encodeURIComponent(calendarId) + '/events' + qs,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'Calendar API error ' + res.status);
  }
  return await res.json(); // contains htmlLink to open the event
}
```

**Key details:**
- `supportsAttachments=true` query parameter is **mandatory** when attaching files — without it, the API silently drops the attachments
- `fileUrl` must be the `https://drive.google.com/open?id=` format
- The response includes `htmlLink` — a URL you can open in a new tab to show the user their created event
- `dateTime` values should be ISO 8601 with timezone offset (e.g., `2026-04-15T14:00:00-04:00`)

### Step 3: Wire It Together

Here's the typical calling pattern — upload file(s) first, then create the event with the returned file IDs:

```javascript
async function addEventWithAttachment(calendarId, eventData, files) {
  const token = await getAuthToken(false);

  // Upload each file to Drive
  const fileIds = [];
  for (const file of files) {
    const id = await uploadToDrive(token, file);
    fileIds.push(id);
  }

  // Create the event with attachments
  const created = await createCalendarEvent(token, calendarId, eventData, fileIds);

  // Open the event in a new tab (optional)
  chrome.tabs.create({ url: created.htmlLink, active: false });
}
```

### Graceful Fallback

If Drive upload fails (quota, network, etc.), you can fall back to creating the event without attachments, or fall back to the URL parameter approach:

```javascript
try {
  fileIds.push(await uploadToDrive(token, file));
} catch (e) {
  // Fall back to event creation without attachment
  // Or fall back to URL parameter approach:
  // chrome.tabs.create({ url: buildGcalUrl(eventData) });
}
```

---

## Token Refresh After Adding Scopes

If the extension previously had a cached OAuth token without Drive/Calendar scopes, the user must re-authenticate. Simply calling `getAuthToken(true)` may return the old cached token with old scopes.

To force a fresh consent prompt with all current scopes:

```javascript
async function forceReauthenticate() {
  try {
    const oldToken = await getAuthToken(false).catch(() => null);
    if (oldToken) {
      // Revoke at Google's end so Chrome re-prompts
      await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + oldToken);
      await new Promise(r =>
        chrome.identity.removeCachedAuthToken({ token: oldToken }, r)
      );
    }
  } catch (e) { /* no cached token */ }

  // Now getAuthToken will prompt with all manifest scopes
  return await getAuthToken(true);
}
```

Call this from your sign-in flow when adding these scopes for the first time.

---

## Gotchas and Lessons Learned

| Issue | Solution |
|---|---|
| Calendar event creates but has no attachment | You forgot `?supportsAttachments=true` in the query string |
| `403 Forbidden` from Drive or Calendar API | The API is not enabled in GCP Console (separate from OAuth scopes) |
| Old users don't get prompted for new scopes | Must revoke + remove cached token before re-prompting (see above) |
| Drive upload works but file isn't accessible | `drive.file` scope only lets the app access files it created — this is correct and expected |
| `Invalid value` error on event creation | Check that `dateTime` values are valid ISO 8601 with timezone |

---

## File Structure

This can be organized however fits your codebase. The reference implementation uses:

- **google-api.js** — `uploadToDrive()` and `createCalendarEvent()` functions (loaded by popup)
- **popup.js** — calling logic that wires upload → create → open tab
- **background.js** — token management (if needed from service worker context)
