import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * Boots the compiled entry point with `CONTAINER_BUILD=true` and waits for the
 * API to answer. A compiled build ships no TypeScript sources for autowire, so
 * this guards the boot path that the published image falls back to when the
 * flag is set. Run `yarn build` first.
 */

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const ENTRY_POINT = path.join(REPOSITORY_ROOT, 'dist', 'index.js');
const READY_TIMEOUT_MS = 90_000;

function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, milliseconds);

  return promise;
}

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

async function waitForApi(baseUrl: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `compiled node exited before the API answered (code ${child.exitCode}, signal ${child.signalCode})`,
      );
    }

    try {
      if ((await fetch(`${baseUrl}/`)).ok) {
        return;
      }
    } catch {
      // The node is still booting.
    }

    await delay(1_000);
  }

  throw new Error(`API did not answer within ${READY_TIMEOUT_MS} ms`);
}

async function main(): Promise<void> {
  if (!existsSync(ENTRY_POINT)) {
    throw new Error(`${ENTRY_POINT} is missing; run yarn build first`);
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [ENTRY_POINT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      API_PORT: String(port),
      CONTAINER_BUILD: 'true',
      NODE_ENV: '',
      TRANSPORT_DSN: 'in-memory://',
    },
    stdio: 'inherit',
  });

  try {
    await waitForApi(baseUrl, child);

    console.log(
      `Compiled boot with CONTAINER_BUILD=true answered on ${baseUrl}.`,
    );
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

void main();
