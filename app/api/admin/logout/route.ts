import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, destroyAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    destroyAdminSession(token);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
