# Chrome Web Store Publishing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Pluck as an unlisted Chrome Web Store extension and complete OAuth verification so colleagues can install via link with persistent Google auth.

**Architecture:** Minimal code changes (manifest only), then a series of asset creation tasks (description, privacy policy, justifications), packaging, and guided manual steps for the CWS dashboard and GCP console.

**Tech Stack:** Chrome Extension MV3, Chrome Web Store Developer Dashboard, Google Cloud Console

**Spec:** `docs/superpowers/specs/2026-04-02-chrome-web-store-publishing-design.md`

---

## Task 1: Update manifest.json for Store Publishing

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Remove `<all_urls>` from `host_permissions`**

In `manifest.json`, change the `host_permissions` array from:

```json
"host_permissions": [
    "https://generativelanguage.googleapis.com/*",
    "https://www.googleapis.com/*",
    "<all_urls>"
]
```

To:

```json
"host_permissions": [
    "https://generativelanguage.googleapis.com/*",
    "https://www.googleapis.com/*"
]
```

Do NOT touch `content_scripts.matches` — it stays as `["<all_urls>"]`.

- [ ] **Step 2: Bump the version number**

In `manifest.json`, change:

```json
"version": "1.1"
```

To:

```json
"version": "1.2"
```

- [ ] **Step 3: Verify the extension still works**

1. Go to `chrome://extensions` in Chrome
2. Click the refresh icon on the Pluck extension card
3. Open the Pluck popup — confirm it loads without errors
4. Test "Scan this page" on any webpage — confirm it still works
5. Open Gmail, open an email with an attachment — confirm the "Send to Pluck" button still appears

- [ ] **Step 4: Verify syntax**

Run:
```bash
node --check popup.js
```
Expected: no output (clean exit = no syntax errors). This confirms nothing was accidentally broken.

- [ ] **Step 5: Commit**

```bash
git add manifest.json
git commit -m "chore: remove <all_urls> from host_permissions and bump version to 1.2 for CWS publishing"
```

---

## Task 2: Draft the Store Description

**Files:**
- Create: `docs/store-listing/description.txt`

- [ ] **Step 1: Create the store listing directory**

```bash
mkdir -p docs/store-listing
```

- [ ] **Step 2: Write the store description**

Create `docs/store-listing/description.txt` with this content (copy-paste into the CWS dashboard later):

```
Pluck converts travel confirmations, event invitations, and scheduling documents into Google Calendar events — instantly, without manual copy-pasting.

HOW IT WORKS

Drop a file, paste content, or scan the current page. Pluck uses AI to extract event details (dates, times, locations, confirmation numbers) and creates ready-to-add Google Calendar entries.

TRAVEL MODE
• Drop PDF flight confirmations, hotel bookings, or charter trip sheets
• Extracts flights, hotels, and private jet itineraries
• Handles multi-passenger documents with seat assignments and confirmation codes
• Creates individual calendar events with all details pre-filled

EVENT DETECTION
• Scan any webpage, paste text, or drop images
• Detects dinners, meetings, appointments, press schedules, ceremonies, and more
• Shows editable event cards — review and adjust before adding to your calendar
• Handles Zoom links, party sizes, venue addresses, and time zones

GMAIL INTEGRATION
• "Send to Pluck" button appears on emails with PDF or image attachments
• One click extracts travel or event data directly from the attachment
• No need to download files first

GOOGLE CALENDAR
• Add events directly to any of your Google calendars
• Choose which calendar to use for each event
• All event details (title, time, location, notes) pre-filled and editable

PRIVACY
• Your data is processed by Google's Gemini AI and stays between you and Google
• No data is stored on external servers
• No analytics or tracking
• You provide your own Gemini API key
```

- [ ] **Step 3: Commit**

```bash
git add docs/store-listing/description.txt
git commit -m "docs: add Chrome Web Store listing description"
```

---

## Task 3: Draft the Privacy Policy

**Files:**
- Create: `docs/store-listing/privacy-policy.txt`

- [ ] **Step 1: Write the privacy policy**

Create `docs/store-listing/privacy-policy.txt` with the following content. After reviewing, you'll copy this into a Google Doc and make it publicly viewable.

```
PRIVACY POLICY — Pluck: Travel & Events
Last updated: April 2026

1. WHAT PLUCK DOES

Pluck is a Chrome browser extension that extracts event and travel details from documents, emails, and web pages, and helps you add them to Google Calendar.

2. WHAT DATA PLUCK ACCESSES

When you use Pluck, it may access the following data depending on which features you use:

• Page content: When you click "Scan this page," Pluck reads the visible text on the current browser tab. This only happens when you explicitly request it.

• Files you provide: When you drop or paste a file (PDF, image, email), Pluck reads that file to extract event details.

• Gmail attachments: When you click "Send to Pluck" on a Gmail message, Pluck reads the attachments (PDFs and images) from that specific email using the Gmail API. It does not read your email body, subject line, or any other emails.

• Google Calendar: Pluck reads your list of calendars (names and IDs) so you can choose where to add events. When you add an event, Pluck creates a calendar entry with the details you've reviewed and approved.

• Google Drive: When you save event-related files, Pluck may store them in your Google Drive using the Drive API. It only accesses files that you explicitly choose to save through Pluck.

• Your email address: Pluck retrieves your Google account email to display who is signed in.

3. HOW YOUR DATA IS PROCESSED

• Event extraction is performed by Google's Gemini AI model. The content you provide (page text, file data) is sent directly from your browser to Google's Gemini API for processing. Pluck does not route this data through any intermediary server.

• Google Calendar and Gmail interactions go directly from your browser to Google's APIs.

• Pluck has no backend server. All processing happens in your browser or via direct calls to Google APIs.

4. WHAT DATA PLUCK STORES

• Your Gemini API key is stored locally in your browser's extension storage. It is never transmitted anywhere except directly to Google's Gemini API.

• Your Google sign-in session is managed by Chrome's built-in identity system.

• Pluck does not maintain any database, user accounts, or server-side storage.

5. WHAT DATA PLUCK SHARES

Pluck does not share your data with any third parties. Data flows only between your browser and Google's APIs (Gemini, Calendar, Gmail, Drive).

6. ANALYTICS AND TRACKING

Pluck does not include any analytics, telemetry, crash reporting, or tracking of any kind.

7. DATA RETENTION

Pluck does not retain any of your data after you close the extension popup. There is no server-side storage, so there is nothing to delete.

8. CHANGES TO THIS POLICY

If this privacy policy is updated, the changes will be reflected in this document with an updated date.

9. CONTACT

For questions about this privacy policy or how Pluck handles your data, contact: [YOUR EMAIL ADDRESS]
```

**Important:** Replace `[YOUR EMAIL ADDRESS]` with your actual email before publishing.

- [ ] **Step 2: Create a public Google Doc**

1. Open Google Docs and create a new document
2. Title it: "Privacy Policy — Pluck: Travel & Events"
3. Paste the privacy policy text from above
4. Replace `[YOUR EMAIL ADDRESS]` with your email
5. Click **Share** → **General access** → change to **"Anyone with the link"** → set to **"Viewer"**
6. Copy the shareable link — you'll need this for the CWS dashboard and OAuth consent screen
7. Save the link somewhere handy (you'll use it in Tasks 5 and 6)

- [ ] **Step 3: Commit**

```bash
git add docs/store-listing/privacy-policy.txt
git commit -m "docs: add privacy policy for Chrome Web Store and OAuth verification"
```

---

## Task 4: Draft Permission Justifications and Data Disclosures

**Files:**
- Create: `docs/store-listing/permission-justifications.txt`

- [ ] **Step 1: Write the permission justifications**

Create `docs/store-listing/permission-justifications.txt` with the following content. You'll copy-paste these into specific fields in the CWS dashboard.

```
=== SINGLE PURPOSE DESCRIPTION ===
(Paste this in the Privacy tab under "Single purpose")

Pluck extracts event and travel details from documents, emails, and web pages, and adds them to Google Calendar.


=== PERMISSION JUSTIFICATIONS ===
(Paste each into the corresponding permission field in the Privacy tab)

-- storage --
Stores the user's Gemini API key and extension preferences locally in the browser.

-- activeTab --
Reads the visible text content of the current page when the user clicks "Scan this page" to extract event details.

-- scripting --
Injects a content script to read page text for event extraction and to add the "Send to Pluck" button on Gmail pages.

-- identity --
Authenticates the user with Google to enable Google Calendar event creation and Gmail attachment reading.

-- unlimitedStorage --
Allows caching of large PDF and image files during the extraction process so they are not lost if the popup is briefly closed.

-- host_permissions: generativelanguage.googleapis.com --
Sends document content to Google's Gemini AI API for event and travel data extraction.

-- host_permissions: www.googleapis.com --
Communicates with Google Calendar API (to create events and list calendars), Gmail API (to read attachments from the current email), and Google Drive API (to save files).

-- content_scripts matching all URLs --
Injects a content script on all pages to enable two features: (1) reading page text when the user requests "Scan this page," and (2) adding the "Send to Pluck" button on Gmail email pages. The script only activates on user action or when Gmail is detected.


=== DATA USE DISCLOSURES ===
(For the Privacy tab checkboxes — check these items)

Does your extension collect or use any of the following data types?

[x] Website content — Yes: reads visible page text when user clicks "Scan this page"
[x] Web history — No
[x] Authentication information — Yes: Google OAuth token for Calendar/Gmail access
[ ] Personal communications — No: does not read email body or subjects; only reads attachments when user clicks "Send to Pluck"
[ ] Location — No
[ ] Financial and payment information — No
[ ] Health information — No
[ ] User activity — No

Is the data used for:
[x] Extension functionality — Yes, all data is used solely for extracting events and creating calendar entries
[ ] Analytics — No
[ ] Developer communications — No
[ ] Advertising — No
[ ] Credit or fraud monitoring — No
[ ] Personalization — No

Is the data transferred:
[ ] To a server — No (all API calls go directly to Google's servers from the browser)
[ ] To third parties — No
```

- [ ] **Step 2: Commit**

```bash
git add docs/store-listing/permission-justifications.txt
git commit -m "docs: add CWS permission justifications and data disclosures"
```

---

## Task 5: Draft OAuth Scope Justifications

**Files:**
- Create: `docs/store-listing/oauth-scope-justifications.txt`

- [ ] **Step 1: Write the OAuth scope justifications**

Create `docs/store-listing/oauth-scope-justifications.txt`. You'll paste these when submitting for OAuth verification in the Google Cloud Console.

```
=== OAUTH SCOPE JUSTIFICATION — for Google Verification Submission ===

App name: Pluck — Travel & Events
App type: Chrome Extension
Distribution: Unlisted on Chrome Web Store (shared privately with <20 users)

--- Scope: userinfo.email ---
Classification: Non-sensitive
Purpose: Displays the signed-in user's email address in the extension popup so they know which Google account is connected.
How it works: On sign-in, Pluck retrieves the user's email and displays it. No other profile data is accessed.

--- Scope: drive.file ---
Classification: Non-sensitive (app-created files only)
Purpose: Allows users to save event-related files (e.g., extracted itineraries) to their Google Drive.
How it works: When a user chooses to save a file, Pluck creates it in their Drive. It can only access files that Pluck itself created — it cannot browse or read other Drive files.

--- Scope: calendar.events ---
Classification: Sensitive
Purpose: Creates Google Calendar events from the travel and event data that Pluck extracts.
How it works: After Pluck extracts event details (date, time, title, location) from a document or web page, the user reviews and optionally edits the details, then clicks "Add to Calendar." Pluck creates the event via the Calendar API. It can also read events to avoid duplicates.

--- Scope: calendar.readonly ---
Classification: Sensitive
Purpose: Lists the user's Google Calendars so they can choose which calendar to add events to.
How it works: On sign-in, Pluck fetches the user's calendar list (names, IDs, colors) and presents a dropdown selector. No event data is read through this scope.

--- Scope: gmail.readonly ---
Classification: Restricted
Purpose: Reads PDF and image attachments from a specific Gmail message when the user clicks the "Send to Pluck" button.
How it works: Pluck injects a "Send to Pluck" button on Gmail email messages that contain attachments. When clicked, Pluck uses the Gmail API to fetch ONLY the attachments (PDFs and images) from that specific message. It does not read email bodies, subject lines, contact lists, or any other messages. The attachment data is processed locally in the browser via Google's Gemini AI to extract travel/event details.

Why a narrower scope won't work: There is no Gmail API scope that grants access to only attachments. gmail.readonly is the minimum scope that allows reading message parts (which includes attachment data). The extension does NOT use gmail.send, gmail.modify, or gmail.compose — it is strictly read-only and limited to the single message the user explicitly selects.

--- Data handling ---
• No data is stored on any external server. All processing happens in the user's browser.
• Document content is sent directly from the browser to Google's Gemini API for AI extraction.
• No analytics, tracking, or telemetry of any kind.
• The extension has no backend server or database.

--- Demo video guidance ---
Record a screen capture (QuickTime or Loom) showing:
1. Opening the Pluck popup and signing in with Google
2. The calendar selector dropdown (shows calendar.readonly in use)
3. Dropping a PDF and adding the extracted event to Google Calendar (shows calendar.events in use)
4. Opening a Gmail email with a PDF attachment, clicking "Send to Pluck," and showing the extracted travel data (shows gmail.readonly in use)
Keep it under 5 minutes. No editing needed — just a walkthrough.
```

- [ ] **Step 2: Commit**

```bash
git add docs/store-listing/oauth-scope-justifications.txt
git commit -m "docs: add OAuth scope justifications for Google verification submission"
```

---

## Task 6: Create the Packaging Script

**Files:**
- Create: `package-for-store.sh`

- [ ] **Step 1: Write the packaging script**

Create `package-for-store.sh` in the project root:

```bash
#!/bin/bash
# Package Pluck extension for Chrome Web Store upload
# Usage: ./package-for-store.sh

set -e

OUTPUT="pluck-extension.zip"

# Remove old package if it exists
rm -f "$OUTPUT"

# Create zip with only the required files
zip -r "$OUTPUT" \
  manifest.json \
  popup.html \
  popup.js \
  content.js \
  background.js \
  google-api.js \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  icons/icon128.png

echo ""
echo "Packaged: $OUTPUT"
echo "Contents:"
unzip -l "$OUTPUT"
echo ""
echo "Next step: Upload this file to the Chrome Web Store Developer Dashboard"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x package-for-store.sh
```

- [ ] **Step 3: Run it and verify the output**

```bash
./package-for-store.sh
```

Expected output: a `pluck-extension.zip` file listing exactly 10 files (manifest.json, popup.html, popup.js, content.js, background.js, google-api.js, and 4 icon PNGs). Verify no docs, git files, or extras are included.

- [ ] **Step 4: Add the zip to .gitignore**

Add this line to `.gitignore`:

```
pluck-extension.zip
```

- [ ] **Step 5: Commit**

```bash
git add package-for-store.sh .gitignore
git commit -m "build: add Chrome Web Store packaging script"
```

---

## Task 7: Take Screenshots

This task is manual — you'll take screenshots of Pluck in action.

- [ ] **Step 1: Prepare two screenshots**

You need 1-2 screenshots at exactly **1280x800 pixels**. Here's what to capture:

**Screenshot 1 — Travel extraction:**
1. Open Chrome and navigate to any webpage (or Gmail)
2. Open the Pluck popup
3. Drop a PDF travel confirmation (use one of your test PDFs)
4. Wait for the flight/hotel cards to appear
5. Take a screenshot of the full browser window showing the Pluck popup with travel results

**Screenshot 2 — Event detection:**
1. Navigate to a webpage with event information (or paste event text into Pluck)
2. Show the detected event cards with checkboxes and editable fields
3. Take a screenshot of the full browser window showing the results

**To resize screenshots to exactly 1280x800:**
- On Mac: Open the screenshot in Preview → Tools → Adjust Size → set to 1280x800 → Save
- Or use: `sips --resampleHeightWidth 800 1280 screenshot.png`

- [ ] **Step 2: Save screenshots**

Save them to `docs/store-listing/` as:
- `screenshot-1-travel.png`
- `screenshot-2-events.png`

These do NOT go in the extension zip — they're only for the store listing upload.

---

## Task 8: Register Chrome Web Store Developer Account

This task is manual — follow these steps in your browser.

- [ ] **Step 1: Register**

1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Accept the developer agreement
4. Pay the $5 one-time fee via Google Pay
5. You should now see an empty Developer Dashboard

---

## Task 9: Upload and Configure the Store Listing

This task is manual — follow these steps in the CWS Developer Dashboard.

- [ ] **Step 1: Upload the extension package**

1. In the Developer Dashboard, click **"New Item"**
2. Upload `pluck-extension.zip` (created in Task 6)
3. Wait for the upload to process

- [ ] **Step 2: Fill out the Store Listing tab**

1. **Name:** Should auto-fill as "Pluck — Travel & Events" from the manifest
2. **Description:** Copy-paste the full text from `docs/store-listing/description.txt`
3. **Category:** Select **Productivity**
4. **Language:** English
5. **Screenshots:** Upload your screenshot(s) from `docs/store-listing/screenshot-*.png`

- [ ] **Step 3: Fill out the Privacy tab**

Using `docs/store-listing/permission-justifications.txt` as your guide:

1. **Single purpose:** Paste the single purpose description
2. **Permission justifications:** Paste each permission's justification into its corresponding field
3. **Privacy policy URL:** Paste the shareable Google Doc link from Task 3
4. **Data use disclosures:** Check the boxes as indicated in the justifications file

- [ ] **Step 4: Set Distribution to Unlisted**

1. Go to the **Distribution** tab
2. Under **Visibility**, select **"Unlisted"**
3. Under **Regions**, select all regions (or just the ones your colleagues are in)

- [ ] **Step 5: Submit for Review**

1. Review all tabs for completeness (the dashboard will warn you if anything is missing)
2. Click **"Submit for Review"**
3. You'll receive an email when the review is complete (typically 1-3 business days)
4. **Write down the extension ID** shown in the dashboard URL — you'll need it in Task 11

---

## Task 10: Configure OAuth and Submit for Verification

This task is manual — do this in the Google Cloud Console. You can start this at the same time as Task 9 (they run in parallel).

- [ ] **Step 1: Make the OAuth audience External**

1. Go to Google Cloud Console → **Google Auth Platform → Audience**
2. Click **"Make external"**

- [ ] **Step 2: Update the Branding page**

1. Go to **Branding**
2. Set **App name** to: Pluck — Travel & Events
3. Set **User support email** to your email
4. Upload the **App logo**: use `icons/icon128.png`
5. Set **App homepage** to your privacy policy Google Doc link
6. Set **Privacy policy link** to the same Google Doc link
7. Save

- [ ] **Step 3: Confirm Data Access scopes**

1. Go to **Data Access**
2. Verify these scopes are listed:
   - `userinfo.email`
   - `drive.file`
   - `calendar.events`
   - `calendar.readonly`
   - `gmail.readonly`
3. If any are missing, add them

- [ ] **Step 4: Publish to production**

1. Go back to **Audience**
2. Click **"Publish App"** to move out of Testing mode
3. Confirm when prompted
4. This allows any user to authorize (with an "unverified" warning until verification completes)

- [ ] **Step 5: Domain verification (likely not needed)**

Since your privacy policy is hosted on Google Docs, Google typically does not require domain verification. However, if during the verification process Google asks you to verify a domain, here's what to do:
1. Go to Google Search Console (https://search.google.com/search-console)
2. Add the domain Google is asking about
3. Follow their verification steps (usually adding a DNS record or HTML file)
4. Return to the OAuth consent screen and link the verified domain

If this doesn't come up, skip this step entirely.

- [ ] **Step 6: Submit for OAuth verification**

1. Look for **"Prepare for verification"** or **"Submit for verification"** (location varies — check the Verification Center in the left sidebar)
2. When asked for justifications, paste the text from `docs/store-listing/oauth-scope-justifications.txt`
3. Upload or link your demo video (see the "Demo video guidance" section in that file for what to record)
4. Submit and wait for Google's response (2-5 business days for tier assignment)

- [ ] **Step 7: Complete CASA requirements when assigned**

Google will email you with your CASA tier and instructions. Follow them:
- **Tier 1:** Fill out a self-assessment questionnaire (free, ~1-2 hours)
- **Tier 2:** Run an automated scan tool and submit results (free/low cost, a few hours)
- **Tier 3:** You'll need to hire a third-party assessor (unlikely for your case — contact me if this happens)

---

## Task 11: Post-Publishing Setup

Do this after the CWS review approves your extension (you'll get an email).

- [ ] **Step 1: Note your permanent extension ID**

1. In the CWS Developer Dashboard, find your extension
2. The URL will be: `https://chrome.google.com/webstore/devconsole/.../EXTENSION_ID`
3. Write down the extension ID (a 32-character string of letters)

- [ ] **Step 2: Update OAuth client with the new extension ID**

1. Go to Google Cloud Console → **Google Auth Platform → Clients**
2. Click on the **"Pluck"** OAuth client
3. Update the **Application ID** field to your new store extension ID
4. Save

- [ ] **Step 3: Test the store version**

1. Open the store URL: `https://chromewebstore.google.com/detail/pluck/YOUR_EXTENSION_ID`
2. Install the store version (you may need to disable your local dev version first to avoid conflicts)
3. Test all features:
   - Open popup, enter Gemini API key
   - Sign in with Google
   - Scan a page
   - Drop a PDF
   - Click "Send to Pluck" on a Gmail email
   - Add an event to Google Calendar
4. If OAuth fails, double-check that the extension ID in the OAuth client matches

- [ ] **Step 4: Sync your local dev environment**

1. In the CWS Developer Dashboard, go to **Package** → **"View public key"**
2. Copy the entire public key string
3. Add it to your **local** `manifest.json` (the one you use for development), right after `"manifest_version"`:

```json
"key": "PASTE_YOUR_PUBLIC_KEY_HERE",
```

4. Go to `chrome://extensions`, reload your local extension
5. Verify the extension ID now matches the store version
6. This ensures OAuth works the same in both your dev and store copies

**Important:** When you run `package-for-store.sh` for future updates, you'll need to temporarily remove the `key` field before packaging (or update the script to strip it). We'll cover this in the dev-to-store sync workflow document.

- [ ] **Step 5: Share with colleagues**

Send your colleagues this message (customize as needed):

```
Hey! I built a Chrome extension called Pluck that converts travel confirmations,
event invitations, and scheduling documents into Google Calendar events.

Install it here: https://chromewebstore.google.com/detail/pluck/YOUR_EXTENSION_ID

After installing:
1. Click the Pluck icon in your Chrome toolbar (puzzle piece → pin it)
2. Click "Change API key" and enter a Gemini API key
   (get one free at https://aistudio.google.com/apikey)
3. Click "Sign in with Google" to connect your calendar

Then you can:
• Drop any PDF (flight confirmation, hotel booking) to extract travel details
• Paste text or images with event info
• Click "Scan this page" on any webpage
• Click "Send to Pluck" on Gmail emails with attachments

You might see a "This app isn't verified" warning when signing in with Google —
that's temporary while Google reviews the app. Just click "Advanced" then
"Go to Pluck" to continue. This will go away within a few weeks.
```

- [ ] **Step 6: Commit the key field update**

```bash
git add manifest.json
git commit -m "chore: add CWS public key to manifest for consistent extension ID in dev"
```

---

## Summary Checklist

Use this to track your overall progress:

- [ ] Task 1: Manifest updated (code change)
- [ ] Task 2: Store description written
- [ ] Task 3: Privacy policy written and published as Google Doc
- [ ] Task 4: Permission justifications written
- [ ] Task 5: OAuth scope justifications written
- [ ] Task 6: Packaging script created and tested
- [ ] Task 7: Screenshots taken
- [ ] Task 8: CWS developer account registered ($5)
- [ ] Task 9: Extension uploaded and submitted to CWS
- [ ] Task 10: OAuth set to External and submitted for verification
- [ ] Task 11: Post-publishing setup complete and shared with colleagues
