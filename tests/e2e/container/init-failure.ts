import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * Boots the compiled entry point with an initialization failure and asserts
 * that the process exits with status 1 instead of 0 or serving on. Restart
 * policies (Docker `on-failure`, Kubernetes) only react to the exit status.
 * Covers a failure before any listener opens and a failure after the API has
 * started listening, which must not keep the process alive. Run `yarn build`
 * first.
 */

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const ENTRY_POINT = path.join(REPOSITORY_ROOT, 'dist', 'index.js');
const EXIT_TIMEOUT_MS = 30_000;

type Scenario = {
  name: string;
  environment: (port: number) => Record<string, string>;
  listensBeforeFailure: boolean;
};

type ExitResult = {
  code: number | null;
  output: string;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
};

const scenarios: Scenario[] = [
  {
    name: 'invalid environment value, before any listener opens',
    environment: () => ({ API_PORT: 'not-a-number' }),
    listensBeforeFailure: false,
  },
  {
    name: 'unwritable IPFS storage, after the API starts listening',
    environment: (port) => ({
      API_PORT: String(port),
      IPFS_STORAGE_PATH: '/dev/null/ipfs',
    }),
    listensBeforeFailure: true,
  },
];

async function freePort(): Promise<number> {
  const server = net.createServer();
  const listening = Promise.withResolvers<void>();

  server.once('error', listening.reject);
  server.listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;

  const address = server.address();

  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (typeof address !== 'object' || address === null) {
    throw new Error('could not reserve a local port');
  }

  return address.port;
}

function runUntilExit(
  environment: Record<string, string>,
): Promise<ExitResult> {
  const { promise, reject, resolve } = Promise.withResolvers<ExitResult>();
  const child = spawn(process.execPath, [ENTRY_POINT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      CONTAINER_BUILD: 'true',
      NODE_ENV: '',
      TRANSPORT_DSN: 'in-memory://',
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let timedOut = false;
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, EXIT_TIMEOUT_MS);

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.once('error', (error) => {
    clearTimeout(deadline);
    reject(error);
  });
  child.once('close', (code, signal) => {
    clearTimeout(deadline);
    resolve({ code, output, signal, timedOut });
  });

  return promise;
}

async function runScenario(scenario: Scenario): Promise<void> {
  const port = await freePort();
  const result = await runUntilExit(scenario.environment(port));
  const context = `signal ${result.signal}; output:\n${result.output}`;

  assert.equal(
    result.timedOut,
    false,
    `node did not exit within ${EXIT_TIMEOUT_MS} ms after the initialization failure; ${context}`,
  );
  assert.equal(result.code, 1, `expected exit status 1; ${context}`);
  assert.match(result.output, /Application error/, context);

  if (scenario.listensBeforeFailure) {
    const listening = result.output.indexOf('Run server:');
    const failure = result.output.indexOf('Application error');

    assert.ok(
      listening !== -1 && listening < failure,
      `expected the API to start listening before the failure; ${context}`,
    );
  }
}

async function main(): Promise<void> {
  if (!existsSync(ENTRY_POINT)) {
    throw new Error(`${ENTRY_POINT} is missing; run yarn build first`);
  }

  const failures: string[] = [];

  for (const scenario of scenarios) {
    try {
      await runScenario(scenario);
      console.log(`PASS init failure exits 1: ${scenario.name}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      failures.push(`FAIL init failure (${scenario.name}): ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
