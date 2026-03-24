import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const AUTH_COOKIE_NAME = "music-platform-session";

// 쿠키 안에 담는 최소 사용자 정보. 민감 데이터는 넣지 않는다.
export type SessionUser = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
};

const secret = new TextEncoder().encode(env.AUTH_SECRET);
const isSecureCookie = Boolean(env.APP_URL?.startsWith("https://"));

/**
 * 로그인 성공 시 7일짜리 세션 토큰을 생성한다.
 * 현재는 단순 JWT 기반이며, 필요 시 이후 refresh/session store 구조로 확장 가능하다.
 */
export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/**
 * 현재 배포 주소가 HTTPS인지에 따라 세션 쿠키 보안 옵션을 통일해서 제공한다.
 *
 * 현재 N100 서버는 HTTP로 먼저 검증 중이기 때문에 secure 쿠키를 강제로 켜면
 * 브라우저가 세션 쿠키를 저장하지 않아 로그인 후에도 Unauthorized가 발생할 수 있다.
 * 추후 HTTPS를 붙이면 APP_URL을 https로 바꾸는 것만으로 secure 쿠키가 다시 자동 적용된다.
 */
export function buildSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureCookie,
    path: "/",
    maxAge,
  };
}

// 쿠키 토큰을 검증하고 내부에서 쓰기 쉬운 SessionUser 형태로 다시 만든다.
export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret);

  return {
    id: payload.sub ?? "",
    email: String(payload.email ?? ""),
    role: payload.role === "ADMIN" ? "ADMIN" : "USER",
  } satisfies SessionUser;
}

// 현재 요청의 쿠키에서 세션 사용자를 읽는다. 토큰이 없거나 깨졌으면 null을 반환한다.
export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}
