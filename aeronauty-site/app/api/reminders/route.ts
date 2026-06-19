import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStoredAccounts } from "@/lib/token-store";
import {
  fetchAppleReminderLists,
  createAppleReminder,
  completeAppleReminder,
  deleteAppleReminder,
} from "@/lib/caldav";
import {
  fetchGoogleTaskLists,
  createGoogleTask,
  completeGoogleTask,
  deleteGoogleTask,
} from "@/lib/google-tasks";

export async function GET() {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const googleAccounts = await getStoredAccounts();

    const [appleLists, ...googleResults] = await Promise.all([
      fetchAppleReminderLists().catch(() => []),
      ...googleAccounts.map((a) => fetchGoogleTaskLists(a).catch(() => [])),
    ]);

    // Tag apple lists with source
    const taggedApple = appleLists.map((l) => ({
      ...l,
      source: "apple" as const,
      reminders: l.reminders.map((r) => ({ ...r, source: "apple" as const })),
    }));

    return NextResponse.json([...taggedApple, ...googleResults.flat()]);
  } catch (err) {
    console.error("Reminders fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { listId, source, accountEmail, title, notes, dueDate, priority } = body;

    if (source === "google") {
      const accounts = await getStoredAccounts();
      const account = accounts.find((a) => a.email === accountEmail) ?? accounts[0];
      if (!account) return NextResponse.json({ error: "No Google account" }, { status: 400 });
      const id = await createGoogleTask(account, listId, { title, notes, dueDate });
      return NextResponse.json({ id });
    } else {
      const uid = await createAppleReminder(listId, { title, notes, dueDate, priority });
      return NextResponse.json({ id: uid });
    }
  } catch (err) {
    console.error("Reminder create error:", err);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { listId, reminderId, source, accountEmail } = body;

    if (source === "google") {
      const accounts = await getStoredAccounts();
      const account = accounts.find((a) => a.email === accountEmail) ?? accounts[0];
      if (!account) return NextResponse.json({ error: "No Google account" }, { status: 400 });
      await completeGoogleTask(account, listId, reminderId);
    } else {
      await completeAppleReminder(listId, reminderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Reminder complete error:", err);
    return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const listId = searchParams.get("listId")!;
    const reminderId = searchParams.get("reminderId")!;
    const source = searchParams.get("source");
    const accountEmail = searchParams.get("accountEmail");

    if (source === "google") {
      const accounts = await getStoredAccounts();
      const account = accounts.find((a) => a.email === accountEmail) ?? accounts[0];
      if (!account) return NextResponse.json({ error: "No Google account" }, { status: 400 });
      await deleteGoogleTask(account, listId, reminderId);
    } else {
      await deleteAppleReminder(listId, reminderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Reminder delete error:", err);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}
