import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, makeNonce } from '@/lib/security/csp';

// Paths that work without a session. /api/cron/ checks CRON_SECRET itself (Vercel Cron has no session).
// /guide and /play are public; /api/play/ guards itself (demo flag, same origin, rate limits).
const PUBLIC = [/^\/$/, /^\/login/, /^\/privacy/, /^\/demo/, /^\/guide/, /^\/play/, /^\/api\/health/, /^\/api\/cron\//, /^\/api\/play\//];

/**
 * Refreshes the Supabase session once per navigation (the only place that does)
 * and sends signed-out visitors to /login. Role checks happen in layouts and
 * route handlers (lib/auth/dal.ts), close to the data.
 *
 * Also sets the Content Security Policy with a fresh nonce per request (M8). Next.js reads the
 * nonce from the request's CSP header and puts it on its own scripts while rendering.
 */
export async function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    https: request.nextUrl.protocol === 'https:',
  });
  request.headers.set('x-nonce', nonce);
  request.headers.set('content-security-policy', csp);
  const secure = <R extends NextResponse>(res: R): R => {
    res.headers.set('content-security-policy', csp);
    return res;
  };

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
      return secure(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }));
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return secure(redirect);
  }

  return secure(response);
}

export const config = {
  matcher: [
    // everything except static assets (video/ is the front page's launch video)
    '/((?!_next/static|_next/image|favicon.ico|demo/|audio/|video/|elevenlabs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|mp4|ico)$).*)',
  ],
};
