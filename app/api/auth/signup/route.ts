import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AUTH_COOKIE_NAME, buildSessionCookieOptions, createSessionToken } from "@/lib/auth";
import { hashPassword } from "@/server/auth/password";
import { grantSignupCredits } from "@/server/credits/service";
import { signupSchema } from "@/server/auth/schema";
import { toPublicUser } from "@/server/auth/user";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "Email is already registered" },
      { status: 409 },
    );
  }

  const user = await db.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email,
        passwordHash: hashPassword(parsed.data.password),
      },
    });

    await grantSignupCredits(createdUser.id, tx);

    return tx.user.findUniqueOrThrow({
      where: { id: createdUser.id },
    });
  });

  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const response = NextResponse.json(
    { item: toPublicUser(user) },
    { status: 201 },
  );

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    ...buildSessionCookieOptions(60 * 60 * 24 * 7),
  });

  return response;
}
