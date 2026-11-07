'use client';

import { z } from 'zod';

// zod 4 compiles fast parsers with Function() unless told not to. The CSP forbids eval in the
// browser (M8), so the probe would be blocked and reported as a violation on every page that
// validates. Jitless parsing is the same validation, interpreted.
z.config({ jitless: true });

export function ZodJitless() {
  return null;
}
