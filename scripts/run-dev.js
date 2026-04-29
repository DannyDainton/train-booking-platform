#!/usr/bin/env node
/**
 * Runs all services via concurrently, but suppresses concurrently's own
 * "[name] <cmd> exited with code 0" banner lines while keeping colours,
 * prefixes, and real service output intact.
 */
const concurrently = require('concurrently');
const { Writable } = require('stream');

// Filter stream: drop only concurrently's own banner lines,
// pass everything else straight through to stdout (preserving ANSI colours).
const EXIT_LINE = /exited with code /;

const filteredStdout = new Writable({
  write(chunk, _encoding, callback) {
    const text = chunk.toString();
    // Split on newlines but preserve them so colour escape sequences stay intact.
    const lines = text.split(/(\r?\n)/);
    let out = '';
    for (let i = 0; i < lines.length; i += 2) {
      const line = lines[i];
      const nl = lines[i + 1] || '';
      if (line && EXIT_LINE.test(stripAnsi(line))) continue;
      out += line + nl;
    }
    if (out) process.stdout.write(out);
    callback();
  },
});

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

const { result } = concurrently(
  [
    { name: 'booking',      command: 'node services/booking/index.js',      env: { FORCE_COLOR: '1' } },
    { name: 'schedule',     command: 'node services/schedule/index.js',     env: { FORCE_COLOR: '1' } },
    { name: 'payment',      command: 'node services/payment/index.js',      env: { FORCE_COLOR: '1' } },
    { name: 'notification', command: 'node services/notification/index.js', env: { FORCE_COLOR: '1' } },
    { name: 'weather',      command: 'node services/weather/index.js',      env: { FORCE_COLOR: '1' } },
  ],
  {
    prefix: 'name',
    prefixColors: ['blue', 'green', 'yellow', 'magenta', 'cyan'],
    outputStream: filteredStdout,
  }
);

result.then(
  () => process.exit(0),
  () => process.exit(1)
);
