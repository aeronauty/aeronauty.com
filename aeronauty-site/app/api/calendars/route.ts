import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStoredAccounts } from "@/lib/token-store";
import {
  fetchGoogleCalendars,
  fetchGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "@/lib/google-calendar";
import {
  fetchAppleCalendars,
  fetchAppleEvents,
  createAppleEvent,
  deleteAppleEvent,
} from "@/lib/caldav";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "events";
  const timeMin = searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax = searchParams.get("timeMax") ?? new Date(Date.now() + 30 * 86400000).toISOString();

  try {
    const googleAccounts = await getStoredAccounts();

    if (action === "calendars") {
      const [googleResults, apple] = await Promise.all([
        Promise.all(googleAccounts.map((a) => fetchGoogleCalendars(a).catch(() => []))),
        fetchAppleCalendars().catch(() => []),
      ]);
      return NextResponse.json([...googleResults.flat(), ...apple]);
    }

    // Fetch events: for each Google account, fetch all their calendars then events
    const googleEventPromises = googleAccounts.map(async (account) => {
      const cals = await fetchGoogleCalendars(account).catch(() => []);
      const eventArrays = await Promise.all(
        cals.map((c) =>
          fetchGoogleEvents(account, c.id, timeMin, timeMax)
            .then((evs) => evs.map((e) => ({ ...e, calendarName: c.name, color: e.color ?? c.color })))
            .catch(() => [])
        )
      );
      return eventArrays.flat();
    });

    const appleCalendars = await fetchAppleCalendars().catch(() => []);
    const appleEventPromises = appleCalendars.map((c) =>
      fetchAppleEvents(c.id, timeMin, timeMax)
        .then((evs) => evs.map((e) => ({ ...e, color: c.color })))
        .catch(() => [])
    );

    const [googleResults, ...appleResults] = await Promise.all([
      Promise.all(googleEventPromises),
      ...appleEventPromises,
    ]);

    const events = [...googleResults.flat(), ...appleResults.flat()]
      .sort((a, b) => a.start.localeCompare(b.start));

    return NextResponse.json(events);
  } catch (err) {
    console.error("Calendar fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch calendars" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { calendarId, source, accountEmail, title, description, start, end, allDay, location } = body;

    if (source === "google") {
      const accounts = await getStoredAccounts();
      const account = accounts.find((a) => a.email === accountEmail) ?? accounts[0];
      if (!account) return NextResponse.json({ error: "No Google account connected" }, { status: 400 });
      const result = await createGoogleEvent(account, calendarId, { title, description, start, end, allDay, location });
      return NextResponse.json(result);
    } else {
      const uid = await createAppleEvent(calendarId, { title, description, start, end, allDay, location });
      return NextResponse.json({ id: uid });
    }
  } catch (err) {
    console.error("Calendar create error:", err);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { calendarId, eventId, source, accountEmail, ...updates } = body;

    if (source === "google") {
      const accounts = await getStoredAccounts();
      const account = accounts.find((a) => a.email === accountEmail) ?? accounts[0];
      if (!account) return NextResponse.json({ error: "No Google account connected" }, { status: 400 });
      const result = await updateGoogleEvent(account, calendarId, eventId, updates);
      return NextResponse.json(result);
    } else {
      await deleteAppleEvent(calendarId, eventId);
      const uid = await createAppleEvent(calendarId, updates);
      return NextResponse.json({ id: uid });
    }
  } catch (err) {
    console.error("Calendar update error:", err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const calendarId = searchParams.get("calendarId")!;
    const eventId = searchParams.get("eventId")!;
    const source = searchParams.get("source")!;
    const accountEmail = searchParams.get("accountEmail");

    if (source === "google") {
      const accounts = await getStoredAccounts();
      const account = accounts.find((a) => a.email === accountEmail) ?? accounts[0];
      if (!account) return NextResponse.json({ error: "No Google account connected" }, { status: 400 });
      await deleteGoogleEvent(account, calendarId, eventId);
    } else {
      await deleteAppleEvent(calendarId, eventId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Calendar delete error:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
