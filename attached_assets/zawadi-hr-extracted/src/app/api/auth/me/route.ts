import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth/session";

export async function GET() {
  const p = await getPrincipal();
  if (!p) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(p);
}
