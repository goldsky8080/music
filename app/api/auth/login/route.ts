import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AUTH_COOKIE_NAME, buildSessionCookieOptions, createSessionToken } from "@/lib/auth";
import { verifyPassword } from "@/server/auth/password";
import { syncUserCreditBalances } from "@/server/credits/service";
import { loginSchema } from "@/server/auth/schema";
import { toPublicUser } from "@/server/auth/user";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const refreshedUser = await db.$transaction(async (tx) => {
    await syncUserCreditBalances(user.id, tx);
    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
    });
  });

  const token = await createSessionToken({
    id: refreshedUser.id,
    email: refreshedUser.email,
    role: refreshedUser.role,
  });

  const response = NextResponse.json({ item: toPublicUser(refreshedUser) });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    ...buildSessionCookieOptions(60 * 60 * 24 * 7),
  });

  return response;
}
