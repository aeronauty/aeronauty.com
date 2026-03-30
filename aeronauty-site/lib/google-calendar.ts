import { google } from "googleapis";
import { upsertAccount, type GoogleTokens } from "./token-store";
import type { CalendarEvent, CalendarInfo } from "./types";

async function getClient(account: GoogleTokens) {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  // Refresh token if within 5 minutes of expiry
  if (account.expiresAt - Date.now() < 5 * 60 * 1000) {
    oauth2.setCredentials({ refresh_token: account.refreshToken });
    const { credentials } = await oauth2.refreshAccessToken();
    const refreshed: GoogleTokens = {
      ...account,
      accessToken: credentials.access_token!,
      expiresAt: (credentials.expiry_date as number) ?? Date.now() + 3600 * 1000,
    };
    await upsertAccount(refreshed);
    oauth2.setCredentials(credentials);
  } else {
    oauth2.setCredentials({ access_token: account.accessToken });
  }

  return google.calendar({ version: "v3", auth: oauth2 });
}

const GOOGLE_COLORS: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
  "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161",
  "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
};

export async function fetchGoogleCalendars(
  account: GoogleTokens
): Promise<CalendarInfo[]> {
  const cal = await getClient(account);
  const res = await cal.calendarList.list();
  return (res.data.items ?? []).map((c) => ({
    id: c.id!,
    name: c.summary ?? "Untitled",
    color: c.backgroundColor ?? "#039be5",
    source: "google" as const,
    enabled: true,
    accountEmail: account.email,
  }));
}

export async function fetchGoogleEvents(
  account: GoogleTokens,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const cal = await getClient(account);
  const res = await cal.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (res.data.items ?? []).map((e) => ({
    id: e.id!,
    title: e.summary ?? "(No title)",
    description: e.description ?? undefined,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    allDay: !e.start?.dateTime,
    calendarId,
    calendarName: "",
    source: "google" as const,
    color: e.colorId ? GOOGLE_COLORS[e.colorId] : undefined,
    location: e.location ?? undefined,
    accountEmail: account.email,
  }));
}

export async function createGoogleEvent(
  account: GoogleTokens,
  calendarId: string,
  event: { title: string; description?: string; start: string; end: string; allDay: boolean; location?: string }
) {
  const cal = await getClient(account);
  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay ? { date: event.start.slice(0, 10) } : { dateTime: event.start },
      end: event.allDay ? { date: event.end.slice(0, 10) } : { dateTime: event.end },
    },
  });
  return res.data;
}

export async function updateGoogleEvent(
  account: GoogleTokens,
  calendarId: string,
  eventId: string,
  event: { title?: string; description?: string; start?: string; end?: string; allDay?: boolean; location?: string }
) {
  const cal = await getClient(account);
  const body: Record<string, unknown> = {};
  if (event.title !== undefined) body.summary = event.title;
  if (event.description !== undefined) body.description = event.description;
  if (event.location !== undefined) body.location = event.location;
  if (event.start !== undefined)
    body.start = event.allDay ? { date: event.start.slice(0, 10) } : { dateTime: event.start };
  if (event.end !== undefined)
    body.end = event.allDay ? { date: event.end.slice(0, 10) } : { dateTime: event.end };
  const res = await cal.events.patch({ calendarId, eventId, requestBody: body });
  return res.data;
}

export async function deleteGoogleEvent(
  account: GoogleTokens,
  calendarId: string,
  eventId: string
) {
  const cal = await getClient(account);
  await cal.events.delete({ calendarId, eventId });
}
