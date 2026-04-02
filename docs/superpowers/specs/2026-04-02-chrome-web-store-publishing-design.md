# Pluck — Chrome Web Store Publishing (Unlisted)

**Date:** 2026-04-02
**Status:** Approved
**Goal:** Publish Pluck to the Chrome Web Store as an unlisted extension so colleagues (<20 people) can install it via a direct link, with automatic updates and persistent OAuth tokens.

---

## Context & Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Distribution method | Chrome Web Store (unlisted) | Auto-updates, easy install via link, no dev-mode nag popup |
| `gmail.readonly` scope | Keep | Required for "Send to Pluck" button to fetch Gmail attachments via API |
| `<all_urls>` in `host_permissions` | Remove | Reduces permission footprint for smoother review; `activeTab` covers fetch needs |
| `<all_urls>` in `content_scripts` | Keep | Required for auto-injecting "Send to Pluck" button on Gmail and page scanning everywhere |
| OAuth audience | External | Colleagues are on different email domains |
| OAuth verification | Full (including CASA for restricted scope) | Required for persistent tokens — testing mode has 7-day expiry |
| Privacy policy hosting | Public Google Doc | Free, no domain/hosting needed |
| Gemini API key | Each user enters their own | Current behavior, no change needed |

---

## Phase 1: Pre-Publishing Preparation

### 1.1 Code Changes

**Remove `<all_urls>` from `host_permissions` only:**

Change `manifest.json` `host_permissions` from:
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

`content_scripts.matches` stays as `["<all_urls>"]` — no change.

**Bump version** in `manifest.json` from `"1.1"` to `"1.2"`.

No other code changes required.

### 1.2 Assets to Create

| Asset | Requirements | Notes |
|---|---|---|
| Screenshots | 1-2 images, exactly 1280x800 px, PNG or JPG | Show Pluck in action (e.g., scanning a page, travel card results) |
| Store description | Up to 16,000 characters | Claude will draft this |
| Privacy policy | Public URL, describes data access/use/storage | Claude will draft; host as a public Google Doc |
| Store icon | 128x128 PNG | Already have this (`icons/icon128.png`) |

### 1.3 Accounts Needed

- **Chrome Web Store Developer Account** — $5 one-time fee
  - Register at: Chrome Web Store Developer Dashboard
  - Sign in with your Google account, pay via Google Pay
- **GCP Project** — already exists (`pluck-extension-492002`)

---

## Phase 2: Chrome Web Store Publishing

### 2.1 Package the Extension

Create a zip file containing **only** these files:

```
pluck-extension.zip
  manifest.json
  popup.html
  popup.js
  content.js
  background.js
  google-api.js
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
```

**Do NOT include:**
- `.git/`, `.claude/`, `.vscode/`, `.superpowers/`
- `docs/`, `work flows/`, `UI Design/`
- `icons/backup-v1/`, comparison images, SVGs, logo files
- `CLAUDE.md`, `.gitignore`, `.DS_Store`
- Any PDFs, `.eml` files, or test documents

### 2.2 Upload & Configure Store Listing

1. Go to the Chrome Web Store Developer Dashboard
2. Click "New Item" and upload the zip
3. Fill out the **Store Listing** tab:
   - **Name:** Pluck — Travel & Events (from manifest)
   - **Description:** (Claude will provide draft text)
   - **Category:** Productivity
   - **Language:** English
   - **Screenshots:** Upload 1-2 screenshots
4. Fill out the **Privacy** tab:
   - **Single purpose description:** Explain that Pluck converts travel confirmations, event invitations, and scheduling documents into Google Calendar events
   - **Permission justifications:** Why each permission is needed (Claude will provide text)
   - **Privacy policy URL:** Link to your public Google Doc
   - **Data use disclosures:** What data is collected/used (Claude will provide guidance)
5. Go to the **Distribution** tab:
   - Set **Visibility** to **Unlisted**
6. Click **Submit for Review**

### 2.3 Review Timeline

- Typical: **1-3 business days**
- May take longer due to `<all_urls>` in content_scripts — justification in the Privacy tab helps
- You'll receive an email when approved (or if changes are requested)

---

## Phase 3: OAuth Verification (run in parallel with Phase 2)

### 3.1 Configure OAuth Consent Screen

1. In Google Cloud Console, go to **Google Auth Platform > Audience**
2. Click **"Make external"**
3. Go to **Branding** and fill out:
   - App name: **Pluck — Travel & Events**
   - User support email: your email
   - App logo: upload your 128x128 icon
   - App homepage: link to your privacy policy Google Doc (or a simple landing page)
   - Privacy policy link: your public Google Doc
4. Go to **Data Access** and confirm your scopes:
   - `userinfo.email` (non-sensitive)
   - `drive.file` (non-sensitive)
   - `calendar.events` (sensitive)
   - `calendar.readonly` (sensitive)
   - `gmail.readonly` (restricted)
5. **Publish the consent screen to production** — in Audience settings, click "Publish App" to move out of Testing mode. This allows anyone (not just manually-added test users) to authorize with Google. They'll see the "unverified app" warning until verification completes, but they won't be blocked.

### 3.2 Domain Verification

If your privacy policy is hosted on Google Docs, this step may not be required. If you use a custom domain:
1. Go to Google Search Console
2. Add and verify the domain used for your privacy policy/homepage
3. Add the verified domain in the OAuth consent screen settings

### 3.3 Submit for Verification

1. In Google Auth Platform, click **"Prepare for verification"** or **"Submit for verification"**
2. Provide:
   - A written explanation of how each scope is used (Claude will draft this)
   - A demo video or walkthrough showing the extension in action — record your screen using each Google-connected feature: signing in, "Send to Pluck" on a Gmail email, adding an event to Google Calendar. A simple screen recording (QuickTime, Loom, etc.) is sufficient; no editing needed.
3. Google reviews and assigns your **CASA tier** (2-5 business days)

### 3.4 Complete CASA Requirements

| Tier | What you do | Cost | Time |
|---|---|---|---|
| Tier 1 | Fill out a self-assessment security questionnaire | Free | 1-2 hours |
| Tier 2 | Run an automated security scan and submit results | Free/low | A few hours |
| Tier 3 | Hire a third-party assessor for a full audit | $4,500-$75,000+ | 4-8 weeks |

For a small unlisted extension with <20 users and no backend server, Tier 1 or 2 is most likely.

### 3.5 What Colleagues Experience During Verification

While OAuth verification is pending (1-3 weeks):
- Colleagues **can install and use Pluck** normally
- When they first sign in with Google, they'll see a one-time **"This app isn't verified"** warning screen — they click "Advanced" then "Go to Pluck (unsafe)" to proceed
- Google OAuth tokens **expire every 7 days** — they'll need to re-sign-in weekly (takes ~10 seconds, same Google sign-in flow)
- **Gemini-powered features work fine** without Google auth (scanning, PDFs, pasting)
- Only Google-connected features need re-auth (Send to Pluck, direct calendar creation)

After verification completes: warning disappears, tokens persist indefinitely.

---

## Phase 4: Post-Publishing

### 4.1 Link Store Extension to OAuth

1. After CWS approval, note the **permanent extension ID** from the Developer Dashboard
2. In Google Cloud Console > Google Auth Platform > Clients, edit the "Pluck" OAuth client
3. Update the **Application ID** field to the new store extension ID
4. Test that OAuth works with the store-installed version

### 4.2 Sync Local Dev Environment

1. In the CWS Developer Dashboard, go to Package > "View public key"
2. Copy the public key
3. Add a `"key"` field to your **local** `manifest.json` (not the store version):
   ```json
   "key": "YOUR_PUBLIC_KEY_HERE"
   ```
4. Reload the extension locally — it should now show the same extension ID as the store version
5. This ensures OAuth works identically in both dev and store versions

### 4.3 Share With Colleagues

1. Copy the store URL: `https://chromewebstore.google.com/detail/pluck/EXTENSION_ID`
2. Send it to colleagues — they click, install, done
3. They'll need to:
   - Enter their own Gemini API key (one-time setup)
   - Sign in with Google for calendar/Gmail features
   - Dismiss the "unverified app" warning if OAuth verification is still pending

### 4.4 Future Updates

A separate workflow document will be created for the ongoing dev-to-store update cycle (syncing local changes to the published store version).

---

## Estimated Timeline

| Milestone | When |
|---|---|
| Code changes + assets ready | Day 1-2 |
| Extension uploaded + submitted to CWS | Day 2 |
| OAuth verification submitted | Day 2 (parallel) |
| CWS review approved — colleagues can install | Day 3-5 |
| CASA tier assigned | Day 5-9 |
| CASA tier requirements completed | Day 7-12 |
| OAuth verification approved — full smooth experience | Week 2-3 |

---

## Appendices (to be drafted during implementation)

- **A: Store Description** — full text for CWS listing
- **B: Privacy Policy** — full text for Google Doc
- **C: Permission Justifications** — text for CWS Privacy tab
- **D: OAuth Scope Justifications** — text for verification submission
- **E: Packaging Script** — command to create the zip with only required files
