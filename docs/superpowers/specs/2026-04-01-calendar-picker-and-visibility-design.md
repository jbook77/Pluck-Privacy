# Calendar Picker & Visibility Settings — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

---

## Summary

Two related improvements to the calendar picker and settings panel:

1. **Fix dropdown overlap** — the picker dropdown currently opens downward and overlaps the footer. Fix by opening upward.
2. **Calendar visibility controls** — add per-calendar toggle switches in Settings so users can hide calendars they don't want appearing in the picker dropdown.

---

## 1. Dropdown Opens Upward

The `.cal-picker-dropdown` CSS currently uses `top: calc(100% + 2px)` which opens below the button, overlapping the footer.

**Change:** Replace with `bottom: calc(100% + 2px)` so the dropdown opens above the picker button. No JS changes needed — purely a CSS fix.

---

## 2. Calendar Visibility in Settings

### Storage

Hidden calendars stored in `chrome.storage.local` under key `google_hidden_calendars` as an array of calendar IDs:

```json
["calendarId1", "calendarId2"]
```

### Settings Panel UI

The existing alias cards in `renderAliasCard()` get a sliding toggle switch in the top-right of each card:

- **Toggle ON (visible):** thumb slides right, track color matches the calendar's dot color
- **Toggle OFF (hidden):** thumb slides left, track is gray (`#444`), card dims to 50% opacity
- Section headers split cards into "My Calendars" and "Other Calendars" (matching Google's grouping — owned calendars vs. shared/subscribed)

Toggle CSS uses a `::after` pseudo-element sliding left/right with a CSS transition.

### Calendar Picker Filtering

`renderCalendarPicker()` reads `google_hidden_calendars` from storage and filters them out before rendering dropdown items. Hidden calendars are excluded from both the dropdown list and from auto-selection via aliases.

If the currently `selectedCalendarId` is hidden, fall back to the first visible calendar.

### Functions to add/modify

| Function | Change |
|---|---|
| `renderAliasCard(cal, aliases)` | Add toggle switch markup; read hidden state from a passed-in `hiddenIds` array |
| `renderSettingsBody()` | Pass `hiddenIds` into `renderAliasCard`; split into My/Other sections |
| `wireAliasEvents(aliases)` | Add toggle click handler: update `google_hidden_calendars` in storage, re-render picker |
| `renderCalendarPicker(calendars, selectedId)` | Filter out hidden calendars before rendering |
| `tryAutoSelectCalendar(events)` | Skip hidden calendars when auto-selecting |

### My vs. Other Calendars grouping

Google's Calendar API returns a `primary` field (true/false) and an `accessRole`. Owned calendars have `accessRole: "owner"`. Use this to split into two groups. The `google_calendars` array currently stores `{ id, name, color }` — add `primary: cal.primary || false` and `accessRole: cal.accessRole` when fetching in `background.js` and `google-api.js`.

---

## What's Not Changing

- Alias management behavior is unchanged
- Hidden calendars still exist in Google Calendar — this is display-only filtering
- Sign-out clears `google_hidden_calendars` along with other Google state
