import { ENGINE_VERSION } from '@/lib/engine/constants';

export function GET() {
  return Response.json({ ok: true, engineVersion: ENGINE_VERSION });
}
