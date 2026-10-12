const encoder = new TextEncoder();
const CONTENT_LINE_OCTET_LIMIT = 75;

function requireEpochMilliseconds(value, field) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${field} must be a safe integer.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`${field} is outside the supported date range.`);
  }
  return date;
}

export function formatIcsUtcTimestamp(epochMilliseconds) {
  const date = requireEpochMilliseconds(epochMilliseconds, "epochMilliseconds");
  const year = date.getUTCFullYear();
  if (year < 0 || year > 9999) {
    throw new RangeError("epochMilliseconds must have a UTC year between 0000 and 9999.");
  }

  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function stripProhibitedControlCharacters(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    const prohibited = codePoint <= 8
      || (codePoint >= 11 && codePoint <= 12)
      || (codePoint >= 14 && codePoint <= 31)
      || codePoint === 127;
    return prohibited ? "" : character;
  }).join("");
}

export function escapeIcsText(value) {
  return stripProhibitedControlCharacters(
    String(value ?? "").replace(/\r\n|\r|\n/g, "\n"),
  )
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function foldIcsContentLine(line) {
  const physicalLines = [];
  let current = "";
  let currentOctets = 0;

  for (const character of String(line)) {
    const characterOctets = encoder.encode(character).length;
    if (current && currentOctets + characterOctets > CONTENT_LINE_OCTET_LIMIT) {
      physicalLines.push(current);
      current = ` ${character}`;
      currentOctets = 1 + characterOctets;
    } else {
      current += character;
      currentOctets += characterOctets;
    }
  }

  physicalLines.push(current);
  return physicalLines;
}

export function serializeCalendarEventToIcs(event, { generatedAtEpochMilliseconds } = {}) {
  if (!event || typeof event !== "object") {
    throw new TypeError("A calendar event is required.");
  }
  if (typeof event.uid !== "string" || !event.uid) {
    throw new TypeError("Calendar event uid is required.");
  }
  if (typeof event.title !== "string" || typeof event.description !== "string") {
    throw new TypeError("Calendar event title and description must be strings.");
  }
  if (event.endEpochMilliseconds <= event.startEpochMilliseconds) {
    throw new RangeError("Calendar event end must be after its start.");
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YouHora//Calendar Event 1.0//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${formatIcsUtcTimestamp(generatedAtEpochMilliseconds)}`,
    `DTSTART:${formatIcsUtcTimestamp(event.startEpochMilliseconds)}`,
    `DTEND:${formatIcsUtcTimestamp(event.endEpochMilliseconds)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.flatMap(foldIcsContentLine).join("\r\n")}\r\n`;
}

export function downloadIcsFile({ ics, filename }, environment = {}) {
  const BlobConstructor = environment.Blob ?? Blob;
  const blob = new BlobConstructor([ics], { type: "text/calendar;charset=utf-8" });
  const urlApi = environment.URL ?? URL;
  const documentRef = environment.document ?? document;
  const defer = environment.setTimeout ?? setTimeout;
  const fallbackDefer = environment.queueMicrotask ?? globalThis.queueMicrotask;
  let objectUrl;
  let ownsObjectUrl = false;
  let anchor = null;
  let hasPrimaryError = false;
  let primaryError;
  let hasCleanupError = false;
  let cleanupError;

  const rememberCleanupError = (error) => {
    if (!hasCleanupError) {
      hasCleanupError = true;
      cleanupError = error;
    }
  };

  const revokeObjectUrl = () => urlApi.revokeObjectURL(objectUrl);

  try {
    objectUrl = urlApi.createObjectURL(blob);
    ownsObjectUrl = true;
    anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    documentRef.body.appendChild(anchor);
    anchor.click();
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  } finally {
    if (anchor !== null) {
      try {
        anchor.remove();
      } catch (error) {
        rememberCleanupError(error);
      }
    }

    if (ownsObjectUrl) {
      try {
        defer(revokeObjectUrl, 0);
      } catch (error) {
        rememberCleanupError(error);
        try {
          fallbackDefer(revokeObjectUrl);
        } catch (fallbackError) {
          rememberCleanupError(fallbackError);
          // Both deferred mechanisms failed. A synchronous final attempt avoids
          // permanently leaking the URL on this already-failing path.
          try {
            revokeObjectUrl();
          } catch (revocationError) {
            rememberCleanupError(revocationError);
          }
        }
      }
    }
  }

  if (hasPrimaryError) throw primaryError;
  if (hasCleanupError) throw cleanupError;
}
