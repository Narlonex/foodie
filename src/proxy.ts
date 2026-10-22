import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/", "/history", "/foods", "/settings"];

function isProtected(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/register") return false;
  return PROTECTED_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      (prefix !== "/" && pathname.startsWith(`${prefix}/`)),
  );
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get("foodie_session")?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
