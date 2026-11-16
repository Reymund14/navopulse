import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate for dashboard pages: no session cookie means straight to the
 * login page. Real authorization happens in every API route (requireUser).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login" && !req.cookies.get("np_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
