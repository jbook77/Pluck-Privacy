# Pluck → Google Calendar Event Format

This document describes exactly how the **Pluck** Chrome extension creates Google Calendar events, so any downstream tool that reads those events (e.g. a "day sheet" generator) can rely on consistent structure, titles, and notes formatting.

> **Source of truth in code:**
> - Extraction prompts (`TRAVEL_PROMPT`, `DETECT_PROMPT`): [extraction.js:8-39](../extraction.js#L8-L39)
> - Travel notes builder (`buildTravelDetails`): [popup.js:755-768](../popup.js#L755-L768)
> - URL fallback (no Google sign-in) (`gcalUrl`): [popup.js:770-788](../popup.js#L770-L788)
> - Calendar API event payload (`createCalendarEvent`): [google-api.js:102-141](../google-api.js#L102-L141)

---

## 1. The pipeline at a glance

1. **User input** — a PDF, `.eml` email, image, screenshot, pasted text, scanned web page, or URL.
2. **Routing** — Pluck classifies each input as `travel` (PDF/eml) or `event` (image/text/page).
   - Travel-only batch → `TRAVEL_PROMPT` (flights / hotels / charter jets).
   - Mixed batch or any non-travel input → `DETECT_PROMPT` (everything else).
3. **AI extraction** — the input plus the prompt are sent to **Gemini 2.5 Flash** (`gemini-2.5-flash`) with `temperature: 0`, `maxOutputTokens: 8192`. If that model is overloaded, Pluck retries with `gemini-2.5-flash-lite` and shows a "results may be less accurate" banner.
4. **Structured JSON** — Gemini returns `{ events: [...] }`. Pluck parses, merges duplicates (multi-passenger flight PDFs), and renders editable cards in the popup.
5. **Calendar write** — the user picks events, optionally edits any field inline, and clicks "Add to Google Calendar."
   - **Signed in to Google** → events are written via the Calendar API `events.insert` endpoint to the user-selected calendar, with the source PDF/image attached via Google Drive.
   - **Not signed in** → each event opens in a new tab as a Google Calendar `render?action=TEMPLATE` URL (the user clicks Save). No attachments possible in this mode.

---

## 2. Event types Pluck produces

Two extraction families, each with distinct `type` values.

### 2.1 Travel family (from `TRAVEL_PROMPT`)

| `type`    | Source documents                                                    |
| --------- | ------------------------------------------------------------------- |
| `flight`  | Commercial airline confirmations (American, Delta, United, etc.)    |
| `hotel`   | Hotel booking confirmations                                         |
| `charter` | Private/charter jet bookings (tail number, FBO, leg numbering)      |

### 2.2 Detected-event family (from `DETECT_PROMPT`)

The model is constrained to one of these literal `type` values:

`dinner`, `party`, `pickup`, `meeting`, `grooming`, `styling`, `performance`, `photo`, `interview`, `appointment`, `event`, `other`

Definitions (from the prompt):

- **dinner** — restaurant reservations
- **party** — after-parties, galas, celebrations, receptions, launch events
- **pickup** — car service, driver, airport transfer, ride to/from venue
- **meeting** — Zoom calls, in-person meetings, calls with guest lists
- **grooming** — haircuts, barber, nails, facials, skincare, spa
- **styling** — wardrobe fittings, getting dressed, outfit prep
- **performance** — concerts, live shows, music sets, soundchecks
- **photo** — photo shoots, press photos, campaign shoots, headshots
- **interview** — magazine/press/podcast interviews, Q&As
- **appointment** — generic scheduled appointments
- **event** — generic catch-all event
- **other** — anything that doesn't fit

> **Note:** The `type` value is in Gemini's JSON output but is **not** written to Google Calendar in any structured field. It only drives the UI tag color in the popup. If a downstream tool needs the type, it must infer it from the event title, location, or notes.

---

## 3. Calendar API payload (when user is signed in)

Events go to `POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?supportsAttachments=true`.

The payload Pluck sends:

```json
{
  "summary":     "<event title>",
  "location":    "<address, Zoom URL, or venue name>",
  "description": "<the notes block — see formats below>",
  "start": { "dateTime": "2026-05-12T19:00:00", "timeZone": "America/New_York" },
  "end":   { "dateTime": "2026-05-12T21:00:00", "timeZone": "America/New_York" },
  "attachments": [
    { "fileUrl": "https://drive.google.com/open?id=<driveFileId>" }
  ]
}
```

This example shows a **detected event** — note the `dateTime` has no UTC offset. **Detected events** send wall-clock `dateTime` with **no UTC offset** plus a named `timeZone` — Google resolves the offset, so DST is always correct. **Travel events** still send offset-bearing `dateTime` plus per-end named zones (§6). The URL fallback now appends `&ctz=<zone>` for detected events (see below).

For **cross-zone flights and charters** (travel events only), `start.timeZone` and `end.timeZone` are different — see §6. This makes Google Calendar show the depart time in the origin city's local zone and the arrive time in the destination city's local zone (the "Use separate start and end time zones" mode in the Calendar UI).

For all-day events (currently only available for detected events, via the user's "All-day event" toggle):

```json
{
  "start": { "date": "2026-05-12" },
  "end":   { "date": "2026-05-13" }
}
```

The `end.date` is **always one day after** the user-entered end date, because Google Calendar treats `end.date` as exclusive. Multi-day all-day events follow the same exclusive-end convention.

> **No `timeZone` field is sent.** The timezone is encoded in the `dateTime` string's offset (e.g. `-04:00`). See §6 for how Pluck picks the offset.

### URL fallback (not signed in)

If the user hasn't connected Google, Pluck opens this URL in a new tab per event:

```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text={title}
  &dates={start}/{end}
  &details={notes}
  &location={location}
  &ctz={zone}
```

`{start}` and `{end}` are converted to **UTC** (`YYYYMMDDTHHMMSSZ`) because the URL format requires it. For all-day events, format is `YYYYMMDD/YYYYMMDD` with the same exclusive-end-day rule.

For **detected timed events**, the UTC conversion is computed by converting the wall-clock time in the user's chosen `zone` to UTC (DST-correct), and Pluck appends `&ctz=<zone>` so Google Calendar displays the event in that zone rather than the viewer's default. For **travel events**, the offset already present in `dateTime` is used directly and no `&ctz=` is appended.

---

## 4. Title format per event type

Titles are produced by Gemini following strict patterns in the prompts. They are **the most important contract** for downstream parsing.

### 4.1 Flights (`type: "flight"`)

```
Fly {ORIGIN_CITY} to {DEST_CITY} ({IATA_AIRLINE_CODE} {FLIGHT_NUMBER})
```

Examples:
- `Fly Newark to Miami (AA 1692)`
- `Fly New York to Los Angeles (DL 421)`

Rules:
- Airline is the **2-letter IATA code** (AA, DL, UA, BA, AF), never the full name.
- City names are spelled out (no IATA airport code in the title — those are in `baseDetails`).

### 4.2 Hotels (`type: "hotel"`)

```
Stay at {HOTEL_NAME}
```

Examples: `Stay at The Beverly Hilton`, `Stay at Soho House New York`.

### 4.3 Charter / Private jets (`type: "charter"`)

```
Private: {DEPARTURE_CITY, ST} to {ARRIVAL_CITY, ST} ({ORIGIN_ICAO} → {DEST_ICAO})
```

Example: `Private: Toms River, NJ to Monticello, NY (KMJX → KMSV)`

> **Note the `→` arrow character (U+2192).** Each leg of a multi-leg charter is its own separate event.

### 4.4 Detected events

No fixed format — Gemini writes a **concise natural title**. Patterns it tends to follow:

| Type          | Typical title                                          |
| ------------- | ------------------------------------------------------ |
| `dinner`      | `Dinner at Soho House` / `Dinner — Carbone`            |
| `meeting`     | `Zoom — Copper Cup x Body Brokers` / `Meeting with X`  |
| `pickup`      | `Pickup to LAX` / `Car to Hotel`                       |
| `grooming`    | `Haircut at {salon}` / `Facial at {spa}`               |
| `styling`     | `Wardrobe fitting` / `Styling for {event}`             |
| `performance` | `Soundcheck` / `Concert at {venue}`                    |
| `photo`       | `Photo shoot for {publication}`                        |
| `interview`   | `Interview with {publication/host}`                    |
| `party`       | `{event} afterparty` / `Launch party — {brand}`        |

Downstream tools should **not** assume a delimiter. Use the calendar color (if calendar-aliasing is in use) or keyword matching on the title.

---

## 5. Description (notes) format per event type

The `description` field is the richest source of structured data. Pluck builds it from Gemini's `baseDetails` (travel) or `notes` (detected events), then appends additional info.

### 5.1 Flight description

```
{Origin City, ST/CC} ({IATA}) - {Dest City, ST/CC} ({IATA})
{Depart time}-{Arrive time} local
{X}hr {Y}min flight
Cabin Class: {CLASS}

{Passenger Name 1} - Seat {3A} | Conf: {ABCDEF}
{Passenger Name 2} - Seat {3B} | Conf: {ABCDEF}
{Passenger Name 3} - Seat {12C} | Conf: {GHIJKL}
```

Concrete example:

```
New York City, NY (JFK) - Los Angeles, CA (LAX)
8:00 AM-11:30 AM local
6hr 30min flight
Cabin Class: First

Kevin Jonas - Seat 1A | Conf: ABC123
Paul Kevin Jonas II - Seat 1B | Conf: ABC123
George Weir - Seat 2A | Conf: XYZ789
```

Notes on the passenger block:
- Always **preceded by a blank line** after the header block.
- **Sorted by seat number ascending** (numeric, then letter — `1A < 1B < 2A < 12C`).
- Format: `{Full Name} - Seat {Seat} | Conf: {ConfirmationCode}`. If no confirmation code, the ` | Conf: ...` segment is omitted.
- If multiple passengers come from separate PDF confirmations for the same flight, they are **merged into one event** (deduped by `name + seat`).

#### Passenger name formatting rules

Airline tickets store names as `LASTNAME/GIVEN1 GIVEN2`. Pluck normalizes:
- **Suffixed names** (II, III, Jr, Sr): use the LAST given name + suffix. `JONAS II/PAUL KEVIN` → `Kevin Jonas II`.
- **Unsuffixed names**: use the FIRST given name, drop middle names. `WEIR/GEORGE CYRIL` → `George Weir`.

### 5.2 Hotel description

```
{Full Address}
Check-In: {Day}, {Month} {Date}, {Year} at {Time}
Check-Out: {Day}, {Month} {Date}, {Year} at {Time}
Confirmation: {Number}
Room: {Room Type}
Guests: {N} Adults
```

Example:

```
9876 Wilshire Blvd, Beverly Hills, CA 90210
Check-In: Friday, May 9, 2026 at 3:00 PM
Check-Out: Sunday, May 11, 2026 at 11:00 AM
Confirmation: 12345678
Room: King Suite
Guests: 2 Adults
```

> Hotels are written as **timed events** (not all-day) using the check-in / check-out times above.

### 5.3 Charter description

```
{Aircraft Type} | {Tail Number}
Provider: {Charter Company} (Ref: {Reference Number})

DEPARTURE FBO
{FBO name}
{FBO address}
{FBO phone}

ARRIVAL FBO
{FBO name}
{FBO address}
{FBO phone}

Passengers ({N}):
1. {Name}
2. {Name}
3. {Name}
```

If `isQuote: true` was returned by Gemini (document is an estimate, not a confirmed booking), the popup shows a warning banner — the field is **not** preserved on the calendar event itself.

### 5.4 Detected events description

The notes field is free-form, written by Gemini following these guidelines:
- One item per line.
- Includes any of: confirmation number, party size, Zoom join URL/passcode, provider name, attendee/guest list with names + emails, special notes.
- **Restaurants:** party size is computed correctly. "Name +4" means the named person PLUS 4 = `Party of 5 total`.
- **Zoom meetings:** the full join URL goes in `location`; the meeting ID and passcode go in `notes`.
- **Invitations with guest lists:** every invitee's name (and email if available) appears on its own line.

When a user toggles "All-day event" on a detected event, Pluck **prepends** this line to notes (preserving the original time):

```
Original times: 7:00 PM – 9:00 PM

{rest of notes...}
```

This is a useful signal for downstream tools: if `notes` starts with `Original times:`, the event was originally timed but converted to all-day by the user.

---

## 6. Time zones — how Pluck handles them

This is the most error-prone area. Read carefully.

### 6.1 Output format

Gemini's raw `startISO`/`endISO` extraction is **ISO 8601 with an explicit numeric offset** for both event families, e.g.:

```
2026-05-12T19:00:00-04:00
2026-08-14T09:30:00+01:00
```

Gemini also returns a **named IANA timezone** (`timeZone` for detected events; `startTimeZone`/`endTimeZone` for travel events) alongside those offsets. What Pluck does with the offset from there **differs by event family**:

- **Travel events** send the offset-bearing `dateTime` string as-is, paired with separate `startTimeZone`/`endTimeZone`:
  - **Flights** (commercial): `startTimeZone` = origin city zone, `endTimeZone` = destination city zone. A JFK → LAX flight ends up with `America/New_York` on the depart side and `America/Los_Angeles` on the arrive side, so the Calendar UI shows departure in NY local time and arrival in LA local time (the "Use separate start and end time zones" mode).
  - **Charter / private jets**: same as flights. Each leg's start zone = origin FBO's zone, end zone = destination FBO's zone.
  - **Hotels**: both ends in the hotel's local zone (single zone — no split).
  - See §6.2 for the caveat on how travel events' offsets are chosen.
- **Detected events** (dinner, meeting, etc.) **discard the offset** before sending to Calendar. Pluck keeps only the wall-clock date and time from `startISO`/`endISO` and sends `dateTime` with **no offset** (e.g. `2026-05-12T19:00:00`), paired with a single `timeZone` applied to both start and end. Google Calendar resolves the actual offset from the named zone, so the result is correct regardless of DST.

Every detected-event card in the popup shows a **user-visible timezone dropdown** (Date/Time/Time zone edit row on the card). It defaults to whatever zone Gemini inferred (`ev.timeZone`), falling back to Eastern (`America/New_York`) if none was returned. The preset choices are Eastern, Central, Mountain, Pacific, Alaska, Hawaii, and London; if Gemini inferred some other IANA zone (e.g. `Europe/Paris`), that zone appears as an extra pass-through option so it isn't silently discarded. **Whatever zone is selected when the user clicks "Add to Google Calendar" is authoritative** — it, not Gemini's original offset, is what ends up in the `timeZone` field (and, for the signed-out path, in `&ctz=`).

### 6.2 How the offset is chosen

Gemini infers the offset from the event location. The prompts specify these defaults for **spring/summer (DST in effect)**:

| Location          | Offset     |
| ----------------- | ---------- |
| New York / NJ / East Coast US | `-04:00` |
| Los Angeles / West Coast US | `-07:00` |
| London            | `+01:00`  |
| Buenos Aires      | `-03:00`  |
| Dubai             | `+04:00`  |

> ⚠️ **Important caveat — travel events only:** `flight`/`hotel`/`charter` events' `dateTime` still carries this prompt-inferred, hard-coded spring/summer offset. For winter dates (Nov–Mar in the Northern Hemisphere), the offset will be **wrong by one hour** unless Gemini infers it from context. Downstream tools should **not** trust a travel event's offset blindly — if you have ground-truth knowledge of the event location, recompute against the actual local timezone.
>
> **Detected events are not affected by this caveat.** Their `dateTime` carries no offset at all — Google computes the correct offset from the named `timeZone` at calendar-render time, so detected events are DST-safe year-round regardless of what Gemini guessed.

For documents that state a time zone explicitly (e.g. "10:00 AM PT"), Gemini honors the stated zone.

For times stated **without** a time zone (e.g. "Dinner at 7"), Gemini infers the zone from the location address. If no location is present, it falls back to the user's likely zone (typically NY). This inferred zone becomes the dropdown's default (see §6.1) but the user can change it before saving.

### 6.3 Default durations (when the document gives a start time but no end time)

From `DETECT_PROMPT`:

| Type          | Default duration |
| ------------- | ---------------- |
| `dinner`      | 2 hours          |
| `party`       | 3 hours          |
| `pickup`      | 1 hour           |
| `meeting`     | 1 hour           |
| `grooming`    | 45 minutes       |
| `styling`     | 1.5 hours        |
| `performance` | 2 hours          |
| `photo`       | 3 hours          |
| `interview`   | 1 hour           |
| `appointment` | 1 hour           |

Stated time ranges (`1PM–5PM`) are always honored exactly — defaults only fill in missing end times.

### 6.4 Day-of-week resolution

If a document only gives a weekday ("Thursday at 3pm") with no date, Gemini resolves it to **the next upcoming occurrence of that weekday** relative to today. The current date is injected into the prompt as `Today is {YYYY-MM-DD}` at extract time.

### 6.5 Press schedules / itineraries

When Pluck detects a multi-page schedule (e.g. press junket, day-of itinerary), the prompt forces extraction of **every** time-stamped row as its own event. A typical 8-page schedule produces 20–30+ events. Items are NOT summarized or combined.

---

## 7. Location field

| Event type    | What goes in `location`                                                |
| ------------- | ---------------------------------------------------------------------- |
| `flight`      | Departure FBO / airport (rarely populated — flight info is in title/notes) |
| `hotel`       | Hotel street address                                                   |
| `charter`     | Departure FBO **full address**                                         |
| `dinner`/etc. | Restaurant name + full street address (or just venue name if no address) |
| `meeting` (Zoom) | The full Zoom join URL (`https://zoom.us/j/...`)                    |
| `meeting` (in-person) | Address or venue name                                          |
| `pickup`      | Pickup address                                                         |

Pluck does not normalize addresses. Whatever Gemini extracted is what's written.

---

## 8. Attachments (Google Drive)

When the user is signed in to Google **and** the event came from a file (PDF, EML, image), Pluck:

1. Uploads the source file to the user's Google Drive root.
2. Attaches it to the calendar event via the `attachments[].fileUrl` field with `?supportsAttachments=true`.
3. The same file is reused (deduped by `sourceFileIdx`) across all events that originated from it — e.g. if a press schedule PDF produced 25 events, only one Drive upload occurs, and all 25 events link to the same file.

URL-fallback events (no Google sign-in) **cannot** have attachments — Google Calendar's URL template doesn't support them.

---

## 9. Calendar selection

If the user has connected Google, they pick a target calendar from the in-popup dropdown. They can also assign **aliases** to calendars (e.g. tag a "Kevin" calendar with aliases `Kevin Jonas`, `Kevin`). When extracted events mention an aliased name, Pluck auto-selects that calendar. (Auto-selection is informational only — the user always has the final say before clicking "Add.")

The `calendarId` going into the API call is the standard Google Calendar ID (often an email-like string for the primary calendar, or a long opaque ID for secondary calendars).

---

## 10. Edge cases & known limitations

1. **Mixed batches** (a PDF + an image in the same upload) all flow through `DETECT_PROMPT`, not `TRAVEL_PROMPT`. The PDF is processed as a generic event document, so flight-specific structure (passenger lists, IATA codes) may not be preserved.
2. **Quote vs. confirmed booking:** charter quotes set `isQuote: true` and trigger a UI warning. The quote status is **not** written to the calendar event — downstream consumers cannot distinguish a calendared quote from a confirmed booking.
3. **DST (travel events only):** the prompt's hard-coded spring/summer offsets are wrong in winter for `flight`/`hotel`/`charter` events. Trust the time-of-day, treat the offset as best-effort. **Detected events are unaffected** — they send no offset at all, just a wall-clock `dateTime` plus a named `timeZone`, so Google always computes the correct offset (see §6.1–6.2).
4. **Editable fields:** users can edit title, date, time, location, and notes inline before saving. The downstream calendar event reflects edits, not the raw Gemini output.
5. **No structured `type` on calendar events:** the rich `type` taxonomy (`dinner`, `pickup`, `grooming`, etc.) only exists in Pluck's UI. To recover it from the calendar event, parse the title or use the calendar name (if the user routes by alias).
6. **Multi-passenger merge:** flight events from separate PDF confirmations merge by `flightKey` (e.g. `AA1692-2026-03-27`). One calendar event per leg, all passengers in the description.
7. **Backup model fallback:** if Gemini 2.5 Flash is overloaded, Pluck silently retries with `gemini-2.5-flash-lite`. Output may be slightly less accurate. The user sees a banner but the event payload format is identical.

---

## 11. Quick reference: a worked example

User drops a Soho House dinner invite (PDF) and a flight confirmation (PDF). Pluck sees mixed kinds → both go through `DETECT_PROMPT`. (If only the flight PDF were dropped, it would go through `TRAVEL_PROMPT` and produce a flight-typed event with passenger list.)

Flight-only example, signed in:

```http
POST /calendar/v3/calendars/primary/events?supportsAttachments=true
Authorization: Bearer ya29....

{
  "summary": "Fly New York to Los Angeles (AA 1692)",
  "location": "",
  "description": "New York City, NY (JFK) - Los Angeles, CA (LAX)\n8:00 AM-11:30 AM local\n6hr 30min flight\nCabin Class: First\n\nKevin Jonas - Seat 1A | Conf: ABC123\nPaul Kevin Jonas II - Seat 1B | Conf: ABC123",
  "start": { "dateTime": "2026-05-12T08:00:00-04:00", "timeZone": "America/New_York" },
  "end":   { "dateTime": "2026-05-12T11:30:00-07:00", "timeZone": "America/Los_Angeles" },
  "attachments": [
    { "fileUrl": "https://drive.google.com/open?id=1AbCdEf..." }
  ]
}
```

Dinner example, signed in:

```http
POST /calendar/v3/calendars/c_xyz123@group.calendar.google.com/events

{
  "summary": "Dinner at Soho House",
  "location": "9 9th Ave, New York, NY 10014",
  "description": "Party of 5 total\nReservation under: Jeremy Book\nConfirmation: SH-99812",
  "start": { "dateTime": "2026-05-14T19:30:00", "timeZone": "America/New_York" },
  "end":   { "dateTime": "2026-05-14T21:30:00", "timeZone": "America/New_York" }
}
```

Note the dinner example's `dateTime` has no UTC offset — this is a detected event, so Pluck sends wall-clock time plus the zone chosen in the card's timezone dropdown (Eastern here, since that's the default). Contrast with the flight example above, which keeps its offset because travel events are unaffected by this change.

---

## 12. Contact

Pluck is maintained by Jeremy Book. If a downstream consumer needs a stable contract that's not currently guaranteed (e.g. a structured `pluck_type` field in the description, or a machine-readable JSON blob), open a discussion — adding a hidden `<!-- pluck:{...} -->` footer to descriptions would be a low-friction way to expose the full Gemini JSON for tools that want it.
