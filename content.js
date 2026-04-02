'use strict';

// Listen for text extraction requests from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_TEXT') {
    try {
      let text = document.body ? document.body.innerText : '';
      sendResponse({ text: text.slice(0, 20000) });
    } catch(e) {
      sendResponse({ text: '', error: e.message });
    }
  }
  if (msg.type === 'GET_GMAIL_MESSAGE_ID') {
    try {
      // Find the open/expanded email's message ID from Gmail DOM
      const expanded = document.querySelectorAll('[data-message-id]');
      // The last expanded message is the one the user is viewing
      const el = expanded.length ? expanded[expanded.length - 1] : null;
      sendResponse({ messageId: el ? el.getAttribute('data-message-id') : null });
    } catch(e) {
      sendResponse({ messageId: null, error: e.message });
    }
  }
  return true;
});

// ── Gmail "Send to Pluck" button injection ────────────────────────────────────
// Wrap in if-block — bare top-level return is a SyntaxError in content scripts
if (location.hostname === 'mail.google.com') {

  let _lastInjectedMsgId = null;
  let _gmailButtonEnabled = true; // default on

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
    btn.textContent = '\u2708 Send to Pluck';
    btn.style.cssText = [
      'background:#1E27AE',
      'color:#D4A830',
      'border:1px solid #D4A830',
      'border-radius:6px',
      'padding:5px 14px',
      'font-size:12px',
      'font-family:Poppins,sans-serif',
      'font-weight:600',
      'cursor:pointer',
      'line-height:1.4'
    ].join(';');

    btn.addEventListener('click', () => {
      btn.textContent = 'Sending\u2026';
      btn.disabled = true;
      // chrome.runtime.id is undefined when extension context is invalidated (e.g. after reload)
      if (!chrome.runtime || !chrome.runtime.id) {
        btn.textContent = '\u2717 Extension reloaded \u2014 refresh this page';
        btn.style.color = '#ff6b6b';
        btn.style.borderColor = '#ff6b6b';
        btn.disabled = false;
        return;
      }
      chrome.runtime.sendMessage(
        { type: 'FETCH_GMAIL_ATTACHMENTS', messageId },
        (resp) => {
          if (chrome.runtime.lastError) {
            btn.textContent = '\u2717 Extension reloaded \u2014 refresh this page';
            btn.style.color = '#ff6b6b';
            btn.style.borderColor = '#ff6b6b';
            btn.disabled = false;
            return;
          }
          if (resp && resp.ok) {
            btn.textContent = '\u2713 Sent (' + resp.count + ' file' + (resp.count === 1 ? '' : 's') + ') \u2014 open Pluck';
            btn.style.color = '#D4A830';
            btn.style.borderColor = '#D4A830';
          } else {
            const err = (resp && resp.error) || 'Unknown error';
            btn.textContent = '\u2717 ' + err;
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

  // Read initial setting
  chrome.storage.local.get('gmail_button_enabled', r => {
    _gmailButtonEnabled = r.gmail_button_enabled !== false; // default true
    if (!_gmailButtonEnabled) _removeButton();
  });

  // React to setting changes in real time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.gmail_button_enabled) {
      _gmailButtonEnabled = changes.gmail_button_enabled.newValue !== false;
      if (!_gmailButtonEnabled) {
        _removeButton();
      }
      // If re-enabled, the next observer tick will inject it
    }
  });

  function _removeButton() {
    const old = document.getElementById('pluck-gmail-wrap');
    if (old) old.remove();
    _lastInjectedMsgId = null;
  }

  // Watch for Gmail SPA navigation and email opens (throttled to avoid perf issues)
  let _gmailScanTimer = null;
  const _gmailObserver = new MutationObserver(() => {
    if (_gmailScanTimer) return;
    _gmailScanTimer = setTimeout(() => {
      _gmailScanTimer = null;
      if (!_gmailButtonEnabled) return;
      const result = _findOpenEmailWithAttachments();
      if (result) {
        _injectPluckButton(result.messageId, result.attachArea);
      } else if (_lastInjectedMsgId) {
        _removeButton();
      }
    }, 300);
  });

  _gmailObserver.observe(document.body, { childList: true, subtree: true });

} // end if (mail.google.com)
