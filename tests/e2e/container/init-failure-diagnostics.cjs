'use strict';

// Loaded with `node --require` by init-failure.ts only, never by the product.
// When the harness has to kill a child that outlived its initialization
// failure, it sends SIGUSR2 and this preload prints resource type names and
// counts from the event loop. It never prints addresses, peer ids, environment
// values or payloads. The exit line shows whether process.exit() was reached.

const { writeSync } = require('node:fs');

function diagnostic(line) {
  try {
    writeSync(2, `diagnostic: ${line}\n`);
  } catch {
    // stderr may be a non-blocking pipe; the harness still reports the timeout.
  }
}

// Registered before any other exit listener, so it runs first.
process.on('exit', (code) => {
  diagnostic(`process 'exit' event reached (code ${code})`);
});

process.on('SIGUSR2', () => {
  const counts = new Map();

  for (const type of process.getActiveResourcesInfo()) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const summary = [...counts]
    .map(([type, count]) => `${type}=${count}`)
    .join(' ');

  diagnostic(
    `event loop responded to SIGUSR2; active resources: ${summary || 'none'}`,
  );
});
