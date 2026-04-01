'use strict';

// Listen for text extraction requests from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_TEXT') {
    try {
      // For Gmail: extract the open email body
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
