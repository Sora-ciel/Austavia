// Runs the Firebase CLI's emulator commands with a temp directory it can
// actually work in, and pins the emulator-only project id in one place.
//
// Why this wrapper exists, rather than calling firebase directly from an npm
// script: the database emulator is a Java process, and on this machine every
// Java process that opens a selector dies at startup with
//
//   java.io.IOException: Unable to establish loopback connection
//   Caused by: java.net.SocketException: Invalid argument: connect
//       at sun.nio.ch.UnixDomainSockets.connect0
//
// Java opens a unix-domain socket in the temp directory, and it cannot do
// that under the default one, because the real path runs through a Windows
// user folder with an accented name. The socket path follows TEMP/TMP, so
// setting java.io.tmpdir does not help. build_apk.bat carries the same
// workaround for gradle, for the same reason.
//
// Usage mirrors the CLI, minus the project flag:
//   node scripts/emulator.mjs exec  --only database "node --test ..."
//   node scripts/emulator.mjs start --only database,functions,storage

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Kept inside the repo so it is discoverable and gitignored, and kept short
// because a unix-domain socket path has a length ceiling. The repo path is
// ASCII, which is the whole point.
const TEMP_DIR = join(repoRoot, '.emulator-tmp');

// A `demo-` prefix tells the CLI this project is emulator-only: no
// credentials, and any attempt to reach a real Firebase service fails loudly
// instead of quietly touching production. Must match PROJECT_ID in
// test-rules/database-rules.test.js.
const PROJECT_ID = 'demo-arial';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('usage: node scripts/emulator.mjs <exec|start> [firebase args...]');
  process.exit(2);
}

mkdirSync(TEMP_DIR, { recursive: true });

// `firebase` is a .cmd shim on Windows, so this has to go through a shell —
// and a shell means building one command string. Passing an argv array with
// shell:true joins it on spaces and drops the quoting, which silently breaks
// `emulators:exec "node --test ..."`: the emulator sees `--test` as its own
// unknown option.
const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

const command = [
  'firebase',
  'emulators:' + args[0],
  '--project',
  PROJECT_ID,
  ...args.slice(1)
]
  .map(quote)
  .join(' ');

// The emulator has no Secret Manager, and a function that declares a secret it
// cannot resolve refuses to serve at all — so the payment webhook would be
// untestable locally, which is the one function most worth testing before it
// is deployed. This is a fixed fake, valid only against the emulator; the real
// one is set with `firebase functions:secrets:set POLAR_WEBHOOK_SECRET` and
// never appears in the repo. Must match test-triggers/polar-webhook.test.js.
const EMULATOR_WEBHOOK_SECRET = 'whsec_' + Buffer.from('emulator-only-not-a-secret').toString('base64');

const child = spawn(command, {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TEMP: TEMP_DIR,
    TMP: TEMP_DIR,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET || EMULATOR_WEBHOOK_SECRET,
    // Deliberately not a working token. The webhook can now call Polar to end
    // a subscription after a full refund, and an emulator run must never reach
    // a real payment provider -- with no usable token that call is skipped and
    // says so in the log.
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN || ''
  }
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
