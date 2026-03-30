import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  fetchAppleReminderLists,
  createAppleReminder,
  completeAppleReminder,
  deleteAppleReminder,
} from "@/lib/caldav";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const lists = await fetchAppleReminderLists();
    return NextResponse.json(lists);
  } catch (err) {
    console.error("Reminders fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { listId, title, notes, dueDate, priority } = body;
    const uid = await createAppleReminder(listId, { title, notes, dueDate, priority });
    return NextResponse.json({ id: uid });
  } catch (err) {
    console.error("Reminder create error:", err);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { listId, reminderId } = body;
    await completeAppleReminder(listId, reminderId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Reminder complete error:", err);
    return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const listId = searchParams.get("listId")!;
    const reminderId = searchParams.get("reminderId")!;
    await deleteAppleReminder(listId, reminderId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Reminder delete error:", err);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}
