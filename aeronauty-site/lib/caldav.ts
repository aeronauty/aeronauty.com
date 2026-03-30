import { createDAVClient, DAVCalendar, DAVObject } from "tsdav";
import type { CalendarEvent, CalendarInfo, Reminder, ReminderList } from "./types";

function displayName(cal: DAVCalendar): string {
  const dn = cal.displayName;
  if (typeof dn === "string") return dn;
  return "Untitled";
}

function getAppleCredentials() {
  const username = process.env.APPLE_CALDAV_USERNAME;
  const password = process.env.APPLE_CALDAV_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

async function getClient() {
  const creds = getAppleCredentials();
  if (!creds) throw new Error("Apple CalDAV credentials not configured");

  return createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: {
      username: creds.username,
      password: creds.password,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

function parseVEvent(ical: string, calendarId: string, calendarName: string): CalendarEvent | null {
  const getField = (name: string): string | undefined => {
    const re = new RegExp(`^${name}[^:]*:(.*)$`, "m");
    const m = ical.match(re);
    return m?.[1]?.trim();
  };

  const uid = getField("UID");
  const summary = getField("SUMMARY");
  const dtstart = getField("DTSTART");
  const dtend = getField("DTEND");

  if (!uid || !dtstart) return null;

  const allDay = dtstart.length === 8; // YYYYMMDD vs with time
  const parseDate = (d: string) => {
    if (d.length === 8) {
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }
    // 20240101T120000Z or 20240101T120000
    const clean = d.replace("Z", "");
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  };

  return {
    id: uid,
    title: summary ?? "(No title)",
    description: getField("DESCRIPTION"),
    start: parseDate(dtstart),
    end: dtend ? parseDate(dtend) : parseDate(dtstart),
    allDay,
    calendarId,
    calendarName,
    source: "apple",
    location: getField("LOCATION"),
  };
}

function parseVTodo(ical: string, listId: string, listName: string): Reminder | null {
  const getField = (name: string): string | undefined => {
    const re = new RegExp(`^${name}[^:]*:(.*)$`, "m");
    const m = ical.match(re);
    return m?.[1]?.trim();
  };

  const uid = getField("UID");
  const summary = getField("SUMMARY");
  if (!uid) return null;

  const status = getField("STATUS");
  const due = getField("DUE");
  const completed = getField("COMPLETED");
  const priority = getField("PRIORITY");

  const parseDate = (d: string) => {
    if (!d) return undefined;
    if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const clean = d.replace("Z", "");
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  };

  return {
    id: uid,
    title: summary ?? "(No title)",
    notes: getField("DESCRIPTION"),
    dueDate: due ? parseDate(due) : undefined,
    completed: status === "COMPLETED",
    completedDate: completed ? parseDate(completed) : undefined,
    listId,
    listName,
    priority: priority ? parseInt(priority, 10) : undefined,
  };
}

export async function fetchAppleCalendars(): Promise<CalendarInfo[]> {
  const creds = getAppleCredentials();
  if (!creds) return [];

  const client = await getClient();
  const calendars = await client.fetchCalendars();

  return calendars
    .filter((c: DAVCalendar) => {
      const comp = c.components ?? [];
      return comp.includes("VEVENT");
    })
    .map((c: DAVCalendar) => ({
      id: c.url,
      name: displayName(c),
      color: (c as Record<string, unknown>).calendarColor as string ?? "#ff9500",
      source: "apple" as const,
      enabled: true,
    }));
}

export async function fetchAppleEvents(
  calendarUrl: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c: DAVCalendar) => c.url === calendarUrl);
  if (!cal) return [];

  const objects = await client.fetchCalendarObjects({
    calendar: cal,
    timeRange: { start: timeMin, end: timeMax },
  });

  const events: CalendarEvent[] = [];
  for (const obj of objects) {
    const data = obj.data;
    if (!data) continue;
    const event = parseVEvent(data, calendarUrl, displayName(cal));
    if (event) events.push(event);
  }

  return events;
}

export async function createAppleEvent(
  calendarUrl: string,
  event: {
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
    location?: string;
  }
) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c: DAVCalendar) => c.url === calendarUrl);
  if (!cal) throw new Error("Calendar not found");

  const uid = crypto.randomUUID();
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");

  const formatDate = (d: string, allDay: boolean) => {
    if (allDay) return d.replace(/-/g, "").slice(0, 8);
    return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  };

  const dtstart = formatDate(event.start, event.allDay);
  const dtend = formatDate(event.end, event.allDay);
  const dtType = event.allDay ? ";VALUE=DATE" : "";

  const vcal = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Aeronauty Dashboard//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART${dtType}:${dtstart}
DTEND${dtType}:${dtend}
SUMMARY:${event.title}${event.description ? `\nDESCRIPTION:${event.description}` : ""}${event.location ? `\nLOCATION:${event.location}` : ""}
END:VEVENT
END:VCALENDAR`;

  await client.createCalendarObject({
    calendar: cal,
    filename: `${uid}.ics`,
    iCalString: vcal,
  });

  return uid;
}

export async function deleteAppleEvent(calendarUrl: string, eventUid: string) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c: DAVCalendar) => c.url === calendarUrl);
  if (!cal) throw new Error("Calendar not found");

  const objects = await client.fetchCalendarObjects({ calendar: cal });
  const obj = objects.find((o: DAVObject) => o.data?.includes(eventUid));
  if (!obj) throw new Error("Event not found");

  await client.deleteCalendarObject({ calendarObject: obj });
}

// --- Reminders (VTODO) ---

export async function fetchAppleReminderLists(): Promise<ReminderList[]> {
  const creds = getAppleCredentials();
  if (!creds) return [];

  const client = await getClient();
  const calendars = await client.fetchCalendars();

  const lists: ReminderList[] = [];
  for (const cal of calendars) {
    const comp = cal.components ?? [];
    if (!comp.includes("VTODO")) continue;

    const objects = await client.fetchCalendarObjects({ calendar: cal });
    const reminders: Reminder[] = [];
    for (const obj of objects) {
      if (!obj.data) continue;
      const r = parseVTodo(obj.data, cal.url, displayName(cal));
      if (r) reminders.push(r);
    }

    lists.push({
      id: cal.url,
      name: displayName(cal),
      color: (cal as Record<string, unknown>).calendarColor as string ?? "#ff9500",
      reminders,
    });
  }

  return lists;
}

export async function createAppleReminder(
  listUrl: string,
  reminder: { title: string; notes?: string; dueDate?: string; priority?: number }
) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c: DAVCalendar) => c.url === listUrl);
  if (!cal) throw new Error("Reminder list not found");

  const uid = crypto.randomUUID();
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");

  let vtodo = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Aeronauty Dashboard//EN
BEGIN:VTODO
UID:${uid}
DTSTAMP:${now}
SUMMARY:${reminder.title}
STATUS:NEEDS-ACTION`;

  if (reminder.notes) vtodo += `\nDESCRIPTION:${reminder.notes}`;
  if (reminder.dueDate) {
    const due = new Date(reminder.dueDate)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+/, "");
    vtodo += `\nDUE:${due}`;
  }
  if (reminder.priority !== undefined) vtodo += `\nPRIORITY:${reminder.priority}`;

  vtodo += `\nEND:VTODO\nEND:VCALENDAR`;

  await client.createCalendarObject({
    calendar: cal,
    filename: `${uid}.ics`,
    iCalString: vtodo,
  });

  return uid;
}

export async function completeAppleReminder(listUrl: string, reminderUid: string) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c: DAVCalendar) => c.url === listUrl);
  if (!cal) throw new Error("Reminder list not found");

  const objects = await client.fetchCalendarObjects({ calendar: cal });
  const obj = objects.find((o: DAVObject) => o.data?.includes(reminderUid));
  if (!obj || !obj.data) throw new Error("Reminder not found");

  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");

  let updated = obj.data.replace(
    /STATUS:NEEDS-ACTION/,
    `STATUS:COMPLETED\nCOMPLETED:${now}`
  );

  // If it was already completed, toggle back
  if (obj.data.includes("STATUS:COMPLETED")) {
    updated = obj.data
      .replace(/STATUS:COMPLETED/, "STATUS:NEEDS-ACTION")
      .replace(/\nCOMPLETED:[^\n]*/, "");
  }

  await client.updateCalendarObject({
    calendarObject: { ...obj, data: updated },
  });
}

export async function deleteAppleReminder(listUrl: string, reminderUid: string) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c: DAVCalendar) => c.url === listUrl);
  if (!cal) throw new Error("Reminder list not found");

  const objects = await client.fetchCalendarObjects({ calendar: cal });
  const obj = objects.find((o: DAVObject) => o.data?.includes(reminderUid));
  if (!obj) throw new Error("Reminder not found");

  await client.deleteCalendarObject({ calendarObject: obj });
}
