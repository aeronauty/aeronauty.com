import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStoredAccounts, removeAccount } from "@/lib/token-store";

export async function GET() {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await getStoredAccounts();
  // Strip tokens from response
  return NextResponse.json(
    accounts.map(({ email, name, picture }) => ({ email, name, picture }))
  );
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = await req.json();
  await removeAccount(email);
  return NextResponse.json({ ok: true });
}
