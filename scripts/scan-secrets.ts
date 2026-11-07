/**
 * Secret scan (M8, addendum section 10: "no API key in the client bundle").
 *
 *   pnpm scan:bundle   after `pnpm build`: every file shipped to the browser (.next/static)
 *   pnpm scan:repo     every commit in the git history, plus the working tree
 *
 * Looks for key formats (Supabase secret and service-role keys, ElevenLabs, Google AI, database
 * URLs, private keys) and, when .env.local is present, for the exact values of the server-only
 * variables. CI has no secrets, so there it relies on the formats; gitleaks runs beside it.
 * Exits 1 on any finding and never prints a secret, only where it was found.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

/** Server-only variables whose values must never leave the server. */
const SECRET_ENV = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'ELEVENLABS_API_KEY',
  'DATABASE_URL',
  'CRON_SECRET',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'VERCEL_OIDC_TOKEN',
  'SEED_PASSWORD_PACKER',
  'SEED_PASSWORD_RETURNS',
  'SEED_PASSWORD_LEAD',
  'SEED_PASSWORD_ADMIN',
];

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'ElevenLabs API key', re: /\bsk_[a-f0-9]{40,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Google AI Studio key', re: /\bAQ\.[A-Za-z0-9_-]{30,}/ },
  { name: 'Postgres URL with password', re: /postgres(?:ql)?:\/\/[^\s'"`:@/]+:[^\s'"`@/]{6,}@/ },
  { name: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Supabase personal access token', re: /\bsbp_[a-f0-9]{40}\b/ },
];

/** A JWT whose payload says role service_role (the legacy Supabase service key). */
function serviceRoleJwt(text: string): boolean {
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') return true;
    } catch {
      /* not a JWT */
    }
  }
  return false;
}

const values = SECRET_ENV.map((k) => ({ name: k, value: process.env[k] })).filter((v): v is { name: string; value: string } => !!v.value && v.value.length >= 8);

function findings(text: string): string[] {
  const out = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
  if (serviceRoleJwt(text)) out.push('Supabase service-role JWT');
  for (const v of values) if (text.includes(v.value)) out.push(`value of ${v.name}`);
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Files we wrote that name the formats on purpose. */
const SELF = ['scripts/scan-secrets.ts'];

function scanBundle(): string[] {
  const root = '.next/static';
  if (!existsSync(root)) throw new Error('No .next/static: run `pnpm build` first.');
  const problems: string[] = [];
  let files = 0;
  for (const f of walk(root)) {
    if (!/\.(js|css|html|json|txt|map)$/.test(f)) continue;
    files++;
    const text = readFileSync(f, 'utf8');
    for (const what of findings(text)) problems.push(`${f}: ${what}`);
    // Server-only modules must never reach the browser (they read the secret variables).
    for (const name of ['SUPABASE_SECRET_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'DATABASE_URL', 'CRON_SECRET']) {
      if (text.includes(name)) problems.push(`${f}: mentions ${name} (server code in the client bundle?)`);
    }
  }
  console.log(`scan:bundle: ${files} client files checked${values.length ? `, ${values.length} secret values compared` : ' (format checks only)'}`);
  return problems;
}

function scanRepo(): string[] {
  const problems: string[] = [];
  // Every commit's patch (all branches), then the files as they are now.
  const log = execFileSync('git', ['log', '--all', '-p', '--no-color', '--format=@@commit %H'], { maxBuffer: 512 * 1024 * 1024 }).toString();
  let commit = '';
  let file = '';
  let commits = 0;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@commit ')) {
      commit = line.slice(9, 17);
      commits++;
      continue;
    }
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      continue;
    }
    if (!line.startsWith('+') || SELF.includes(file)) continue;
    for (const what of findings(line)) problems.push(`commit ${commit} ${file}: ${what}`);
  }
  const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard']).toString().split('\n').filter(Boolean);
  for (const f of tracked) {
    if (SELF.includes(f) || !existsSync(f) || statSync(f).size > 5_000_000) continue;
    const text = readFileSync(f, 'utf8');
    for (const what of findings(text)) problems.push(`${f}: ${what}`);
  }
  console.log(`scan:repo: ${commits} commits and ${tracked.length} files checked${values.length ? `, ${values.length} secret values compared` : ' (format checks only)'}`);
  return problems;
}

const mode = process.argv[2];
if (mode !== 'bundle' && mode !== 'repo') {
  console.error('usage: tsx scripts/scan-secrets.ts bundle|repo');
  process.exit(2);
}
const problems = mode === 'bundle' ? scanBundle() : scanRepo();
if (problems.length) {
  console.error(`\n${problems.length} finding(s):`);
  for (const p of [...new Set(problems)]) console.error(`  ${p}`);
  process.exit(1);
}
console.log('No secrets found.');
