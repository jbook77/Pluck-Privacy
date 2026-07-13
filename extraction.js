'use strict';
// Shared extraction logic — loaded by popup.html via <script> and by
// background.js via importScripts(). Plain global scope, no chrome.* APIs
// (so it can also run under Node for one-off tests).

const TODAY = new Date().toISOString().split('T')[0];

const TRAVEL_PROMPT = 'You are a travel data extractor. Extract all flights, hotel stays, and private/charter flights from the provided document. Return ONLY valid JSON, no markdown, no code fences.\n\nFormat:\n{"events":[{"type":"flight" or "hotel" or "charter","title":"...","startISO":"ISO8601 with tz offset","endISO":"ISO8601 with tz offset","startTimeZone":"IANA name for departure city e.g. America/Los_Angeles","endTimeZone":"IANA name for arrival city e.g. America/New_York","location":"...","flightKey":"...","flightNumber":"...","departureDate":"YYYY-MM-DD","origin":"city","destination":"city","passengers":[...],"baseDetails":"...","isQuote":false}]}\n\nFor flights and charter: startTimeZone = origin city zone, endTimeZone = destination city zone (different zones for cross-zone flights). For hotels: both = hotel city zone. The offsets in startISO/endISO MUST match the named zones for the given date.\n\n--- COMMERCIAL FLIGHTS (type: "flight") ---\nflightKey: AIRLINECODE+FLIGHTNUMBER+DATE e.g. AA1692-2026-03-27\nflightNumber: e.g. AA1692\nTitle: Fly [ORIGIN] to [DEST] ([2-LETTER AIRLINE CODE] [NUMBER]) — use IATA airline code only, never full airline name. e.g. Fly Newark to Miami (AA 1692)\nbaseDetails (each on its own line, no passengers here):\n[City, State-abbrev-or-2-letter-country-code] ([IATA]) - [City, State-abbrev-or-2-letter-country-code] ([IATA])\ne.g. New York City, NY (JFK) - Buenos Aires, AR (EZE)\n[Depart time]-[Arrive time] local\n[X]hr [Y]min flight\nCabin Class: [CLASS]\npassengers: [{"name":"...","seat":"...","confirmationCode":"..."}]\n\n--- HOTELS (type: "hotel") ---\nTitle: Stay at [HOTEL NAME]\nbaseDetails:\n[Address]\nCheck-In: [DAY], [MONTH] [DATE], [YEAR] at [TIME]\nCheck-Out: [DAY], [MONTH] [DATE], [YEAR] at [TIME]\nConfirmation: [NUMBER]\nRoom: [TYPE]\nGuests: [N] Adults\n\n--- PRIVATE / CHARTER JETS (type: "charter") ---\nIdentified by: tail numbers (N-numbers), FBO names, "leg" numbering, charter company names, no scheduled airline code.\nflightKey: "charter-[tailNumber or referenceId]-[originICAO]-[YYYY-MM-DD]" e.g. "charter-N609RC-KMJX-2025-08-18"\nTitle: Private: [Departure City, State] to [Arrival City, State] ([ORIGIN ICAO] → [DEST ICAO])\ne.g. Private: Toms River, NJ to Monticello, NY (KMJX → KMSV)\nlocation: departure FBO full address\nisQuote: true if document is a quote/estimate/unconfirmed, false if confirmed booking\npassengers: ["First Last", ...] (names only — no seats for charter)\nbaseDetails:\n[Aircraft Type] | [Tail Number or "N/A"]\nProvider: [Charter company name] (Ref: [reference/trip number])\n\nDEPARTURE FBO\n[FBO name]\n[FBO address]\n[FBO phone]\n\nARRIVAL FBO\n[FBO name]\n[FBO address]\n[FBO phone]\n\nPassengers ([N]):\n[numbered list, one per line]\n\nExtract EACH leg as a separate charter event. If no tail number, omit that field.\n\n--- PASSENGER NAME RULES (commercial flights only) ---\nAirline tickets use LASTNAME/GIVEN1 GIVEN2 format. (1) If surname has numeral suffix (II, III, Jr, Sr): use LAST given name, keep suffix: JONAS II/PAUL KEVIN → Kevin Jonas II. (2) Otherwise: use FIRST given name, drop middle names: WEIR/GEORGE CYRIL → George Weir.\n\nTimezones (spring/summer DST): New York=-04:00, LA=-07:00, London=+01:00, Buenos Aires=-03:00, Dubai=+04:00.\nIf nothing found: {"events":[]}';

const DETECT_PROMPT = `You are an event extractor. Today is ${TODAY}. Extract ALL events, appointments, reservations, and meetings from the content. Return ONLY valid JSON, no markdown, no code fences.

Format:
{"events":[{
  "type": "dinner | party | pickup | meeting | grooming | styling | performance | photo | interview | appointment | event | other",
  "title": "concise natural title e.g. Dinner at Soho House or Zoom - Copper Cup x Body Brokers",
  "startISO": "ISO8601 with tz offset. Infer tz from location (NY spring=-04:00, LA spring=-07:00). If only day-of-week, use next upcoming date from today.",
  "endISO": "ISO8601. Infer if missing: dinner=2hr, party=3hr, pickup=1hr, meeting=1hr, grooming=45min, styling=1.5hr, performance=2hr, photo=3hr, interview=1hr, appointment=1hr",
  "timeZone": "IANA name for the event location e.g. America/New_York, America/Los_Angeles, Europe/London. Must match the offset in startISO/endISO.",
  "location": "full address, Zoom link, or venue name",
  "notes": "confirmation number, party size, zoom passcode, provider name, guest/invitee list, special notes. One per line.",
  "confidence": "high | medium | low"
}]}

Rules:
- Restaurants: party size in notes. Name +4 = that person PLUS 4 = Party of 5 total
- Zoom: full join URL as location, ID and passcode in notes
- Invitations/meetings with guests: list all invitees/attendees in notes (name and email if available), one per line
- Schedules/itineraries: you MUST extract EVERY single time-stamped item as its own event. A 8-page press schedule should produce 20-30+ events. Do not summarize or combine. Each interview, TV appearance, taping, ceremony, brunch, grooming session, depart/arrive, afterparty = its own event with its own card.
- Hotel check-in/out = one event
- Stated time ranges like 1PM-5PM: use exactly
- If nothing found: {"events":[]}
- Do NOT invent details
- GROOMING: haircuts, barber, nails, facials, skincare, spa treatments
- STYLING: wardrobe fittings, getting dressed, outfit prep, fashion styling sessions
- PERFORMANCE: concerts, live shows, music performances, sets, soundchecks
- PHOTO: photo shoots, press photos, campaign shoots, headshots
- INTERVIEW: magazine interviews, press interviews, podcast guest appearances, Q&As
- PARTY: after-parties, galas, celebrations, receptions, launch events
- PICKUP: car service, driver, airport transfer, ride to/from venue`;

async function callGemini(apiKey, parts, onRetry, onFallback) {
  const modelChain = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 8192 } });
  const delays = [1000, 2000, 4000];
  let lastErrorMsg = '';
  for (let m = 0; m < modelChain.length; m++) {
    const model = modelChain[m];
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      let res = null, networkFailed = false;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      } catch(e) {
        networkFailed = true;
      }
      const retryable = networkFailed || (res && (res.status === 503 || res.status === 429 || res.status === 500));
      if (retryable && attempt < delays.length) {
        const wait = delays[attempt];
        if (onRetry) onRetry(attempt + 1, delays.length, wait, model);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      // Retryable but retries exhausted — fall through to next model if available
      if (retryable && m < modelChain.length - 1) {
        lastErrorMsg = networkFailed ? 'Network error' : ('Status ' + res.status);
        break;
      }
      if (networkFailed) throw new Error('Network error — check your connection and try again.');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (err.error && err.error.message) ? err.error.message : 'Gemini API error ' + res.status;
        if (res.status === 503) throw new Error('Gemini is overloaded (503), even the backup model. Try again in a moment.');
        if (res.status === 429) throw new Error('Rate limit hit (429). Wait a minute and try again.');
        throw new Error(msg);
      }
      const data = await res.json();
      const raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw);
      if (m > 0 && onFallback) onFallback(model);
      return parsed;
    }
  }
  throw new Error('All models unavailable (' + lastErrorMsg + '). Try again in a few minutes.');
}

function checkMismatches(events) {
  // Group flights by flightKey — only compare flights that claim to be the same leg
  const groups = {};
  events.filter(e => e.type === 'flight' && e.flightKey).forEach(ev => {
    (groups[ev.flightKey] = groups[ev.flightKey] || []).push(ev);
  });
  const mismatches = [];
  Object.values(groups).forEach(group => {
    if (group.length < 2) return;
    const ref = group[0];
    group.slice(1).forEach(ev => {
      if (ev.departureDate !== ref.departureDate) mismatches.push({ field: 'Date conflict for ' + ref.flightNumber, a: ref.departureDate, b: ev.departureDate });
    });
  });
  return mismatches.length ? mismatches : null;
}

function mergeFlights(events) {
  const map = {};
  const others = [];
  events.forEach(ev => {
    if (ev.type === 'flight' && ev.flightKey) {
      if (map[ev.flightKey]) {
        (ev.passengers || []).forEach(p => {
          if (!map[ev.flightKey].passengers.some(x => x.name === p.name && x.seat === p.seat))
            map[ev.flightKey].passengers.push(p);
        });
        if (ev.sourceFileIdx !== undefined && !map[ev.flightKey].sourceFileIdxs.includes(ev.sourceFileIdx))
          map[ev.flightKey].sourceFileIdxs.push(ev.sourceFileIdx);
      } else {
        const idxs = ev.sourceFileIdx !== undefined ? [ev.sourceFileIdx] : [];
        map[ev.flightKey] = { ...ev, passengers: [...(ev.passengers || [])], sourceFileIdxs: idxs };
      }
    } else { others.push(ev); }
  });
  return [...Object.values(map), ...others];
}

// Routes files to travel or detect extraction. Mirrors the original
// runExtract() routing: travel-only batches use TRAVEL_PROMPT per file,
// anything else runs everything through DETECT_PROMPT.
async function extractFromFiles(files, apiKey, onStatus, onRetry, onFallback) {
  const travelFiles = files.filter(f => f.kind === 'travel');
  const eventFiles  = files.filter(f => f.kind === 'image' || f.kind === 'text' || f.kind === 'event');
  const hasTravelOnly = travelFiles.length > 0 && eventFiles.length === 0;

  const allEvents = [];
  if (hasTravelOnly) {
    if (onStatus) onStatus('Extracting travel events...');
    for (const f of travelFiles) {
      const fIdx = files.indexOf(f);
      const parsed = await callGemini(apiKey, [
        { inline_data: { mime_type: f.mimeType, data: f.base64 } },
        { text: TRAVEL_PROMPT }
      ], onRetry, onFallback);
      (parsed.events || []).forEach(ev => allEvents.push({ ...ev, sourceFileIdx: fIdx }));
    }
    if (allEvents.length) return { mode: 'travel', events: allEvents };
    // Travel-shaped files with no travel in them (e.g. an event ticket PDF) —
    // fall through and run general event detection on the same files
    if (onStatus) onStatus('Checking for other kinds of events...');
  } else if (onStatus) onStatus('Detecting events...');
  for (const f of [...travelFiles, ...eventFiles]) {
    const fIdx = f.kind !== 'text' ? files.indexOf(f) : undefined;
    let parts;
    if (f.kind === 'text') {
      parts = [{ text: DETECT_PROMPT + '\n\nContent:\n' + f.text }];
    } else if (f.kind === 'image') {
      parts = [
        { inline_data: { mime_type: f.mimeType, data: f.base64 } },
        { text: DETECT_PROMPT + '\n\nExtract all events visible in this image.' }
      ];
    } else {
      parts = [
        { inline_data: { mime_type: f.mimeType, data: f.base64 } },
        { text: DETECT_PROMPT }
      ];
    }
    const parsed = await callGemini(apiKey, parts, onRetry, onFallback);
    (parsed.events || []).forEach(ev =>
      allEvents.push(fIdx !== undefined ? { ...ev, sourceFileIdx: fIdx } : ev)
    );
  }
  return { mode: 'detect', events: allEvents };
}

// Converts a wall-clock time in a named zone to the real UTC instant,
// DST-correct for the specific date. Input 'YYYY-MM-DDTHH:MM[:SS]' with
// NO offset. Strings with an offset (or unparseable) fall back to new Date().
function _zoneWallClock(utcMs, ianaZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = {};
  fmt.formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
}

function wallTimeToUTC(dateTimeStr, ianaZone) {
  const m = String(dateTimeStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !ianaZone) return new Date(dateTimeStr);
  const desired = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let utc = desired;
  // Two passes converge across DST transitions
  for (let i = 0; i < 2; i++) utc += desired - _zoneWallClock(utc, ianaZone);
  return new Date(utc);
}
