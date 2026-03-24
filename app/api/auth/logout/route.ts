import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, buildSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    ...buildSessionCookieOptions(0),
  });

  return response;
}
