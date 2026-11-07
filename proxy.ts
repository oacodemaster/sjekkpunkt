import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that work without a session. /api/cron/ checks CRON_SECRET itself (Vercel Cron has no session).
const PUBLIC = [/^\/$/, /^\/login/, /^\/privacy/, /^\/demo/, /^\/api\/health/, /^\/api\/cron\//];

/**
 * Refreshes the Supabase session once per navigation (the only place that does)
 * and sends signed-out visitors to /login. Role checks happen in layouts and
 * route handlers (lib/auth/dal.ts), close to the data.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;

  if (!signedIn && !PUBLIC.some((re) => re.test(path))) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // everything except static assets
    '/((?!_next/static|_next/image|favicon.ico|demo/|audio/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico)$).*)',
  ],
};
