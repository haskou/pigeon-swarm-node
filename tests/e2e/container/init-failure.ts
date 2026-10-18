import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Boots the compiled entry point with an initialization failure and asserts
 * that the process exits with status 1 instead of 0 or serving on. Restart
 * policies (Docker `on-failure`, Kubernetes) only react to the exit status.
 * Covers a failure before any listener opens, an API port already taken by
 * another process, a failure in an initializer, which must happen before the
 * API listens, an initializer that does not finish within
 * `NODE_INITIALIZER_TIMEOUT_MS`, which must not leave the port closed forever,
 * and a failure after the API has started listening, which must not keep the
 * process alive. Run `yarn build` first. A child still running at the timeout
 * is sampled and asked for a diagnostic report before it is killed.
 */

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const ENTRY_POINT = path.join(REPOSITORY_ROOT, 'dist', 'index.js');
const EXIT_TIMEOUT_MS = 30_000;
const DIAGNOSTICS_PRELOAD = path.join(
  __dirname,
  'init-failure-diagnostics.cjs',
);
const HANG_SAMPLE_MS = 1_000;
const HANG_DUMP_MS = 1_000;

type Scenario = {
  name: string;
  environment: (port: number) => Record<string, string>;
  failureOutput?: RegExp;
  listensBeforeFailure: boolean;
  portInUse: boolean;
};

type ExitResult = {
  code: number | null;
  output: string;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  evidence: string;
};

const scenarios: Scenario[] = [
  {
    name: 'invalid environment value, before any listener opens',
    environment: () => ({ API_PORT: 'not-a-number' }),
    listensBeforeFailure: false,
    portInUse: false,
  },
  {
    name: 'API port already in use, before the API starts listening',
    environment: (port) => ({ API_PORT: String(port) }),
    listensBeforeFailure: false,
    portInUse: true,
  },
  {
    name: 'unwritable IPFS storage, in an initializer before the API starts listening',
    environment: (port) => ({
      API_PORT: String(port),
      IPFS_STORAGE_PATH: '/dev/null/ipfs',
    }),
    listensBeforeFailure: false,
    portInUse: false,
  },
  {
    name: 'initializer past its time bound, before the API starts listening',
    environment: (port) => ({
      API_PORT: String(port),
      NODE_INITIALIZER_TIMEOUT_MS: '1',
    }),
    failureOutput: /Initializer \w+ did not finish within 1 ms/,
    listensBeforeFailure: false,
    portInUse: false,
  },
  {
    name: 'unwritable TURN runtime configuration, after the API starts listening',
    environment: (port) => ({
      API_PORT: String(port),
      PIGEON_TURN_RUNTIME_CONFIG_PATH: '/dev/null/turn/runtime.json',
    }),
    listensBeforeFailure: true,
    portInUse: false,
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

// Listens without a host, on the same wildcard address the API server binds,
// so the node's own listen fails with EADDRINUSE on every platform.
async function occupyPort(port: number): Promise<net.Server> {
  const server = net.createServer();
  const listening = Promise.withResolvers<void>();

  server.once('error', listening.reject);
  server.listen(port, listening.resolve);
  await listening.promise;

  return server;
}

type ThreadSample = {
  name: string;
  state: string;
  wchan: string;
  ticks: number;
};

// Linux only: each thread's name, state, kernel wait channel and CPU ticks.
// A thread that exits while being read is skipped.
async function readThreads(pid: number): Promise<Map<string, ThreadSample>> {
  const samples = new Map<string, ThreadSample>();

  if (process.platform !== 'linux') {
    return samples;
  }

  for (const tid of await readdir(`/proc/${pid}/task`)) {
    const base = `/proc/${pid}/task/${tid}`;

    try {
      const [name, stat, wchan] = await Promise.all([
        readFile(`${base}/comm`, 'utf8'),
        readFile(`${base}/stat`, 'utf8'),
        readFile(`${base}/wchan`, 'utf8').catch(() => ''),
      ]);
      // Fields after the parenthesised name: state is field 3, utime 14, stime 15.
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');

      samples.set(tid, {
        name: name.trim(),
        state: fields[0] ?? '?',
        ticks: Number(fields[11]) + Number(fields[12]),
        wchan: wchan.trim() || '-',
      });
    } catch {
      // The thread exited between the directory listing and the read.
    }
  }

  return samples;
}

function describeThreads(
  pid: number,
  before: Map<string, ThreadSample>,
  after: Map<string, ThreadSample>,
): string {
  if (after.size === 0) {
    return `thread sampling unavailable on ${process.platform}`;
  }

  const lines = [...after].map(([tid, sample]) => {
    const previous = before.get(tid);
    const cpuTicks = sample.ticks - (previous?.ticks ?? 0);
    const role = tid === String(pid) ? 'main' : 'thread';

    return `  ${role} ${sample.name} state=${sample.state} wchan=${sample.wchan} cpuTicks=${cpuTicks}`;
  });

  return [
    `threads over ${HANG_SAMPLE_MS} ms (cpuTicks at USER_HZ, usually 100 per second):`,
    ...lines,
  ].join('\n');
}

// Runs only after EXIT_TIMEOUT_MS, so the child is still alive. The sampling
// shows whether it is spinning, idle or blocked in the kernel. SIGUSR2 asks
// the preload for event-loop resources, which only prints if the loop runs.
async function collectHangEvidence(child: ChildProcess): Promise<string> {
  try {
    if (child.pid === undefined) {
      return 'evidence unavailable: child has no pid';
    }

    const before = await readThreads(child.pid);
    await sleep(HANG_SAMPLE_MS);
    const after = await readThreads(child.pid);
    child.kill('SIGUSR2');
    await sleep(HANG_DUMP_MS);

    return describeThreads(child.pid, before, after);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return `evidence unavailable: ${message}`;
  } finally {
    child.kill('SIGKILL');
  }
}

function runUntilExit(
  environment: Record<string, string>,
): Promise<ExitResult> {
  const { promise, reject, resolve } = Promise.withResolvers<ExitResult>();
  const child = spawn(
    process.execPath,
    ['--require', DIAGNOSTICS_PRELOAD, ENTRY_POINT],
    {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        CONTAINER_BUILD: 'true',
        NODE_ENV: '',
        TRANSPORT_DSN: 'in-memory://',
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let timedOut = false;
  let evidence: Promise<string> | undefined;
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  const deadline = setTimeout(() => {
    timedOut = true;
    evidence = collectHangEvidence(child);
  }, EXIT_TIMEOUT_MS);

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.once('error', (error) => {
    clearTimeout(deadline);
    reject(error);
  });
  child.once('close', (code, signal) => {
    clearTimeout(deadline);
    void Promise.resolve(evidence).then((hangEvidence) => {
      resolve({ code, evidence: hangEvidence ?? '', output, signal, timedOut });
    });
  });

  return promise;
}

async function runScenario(scenario: Scenario): Promise<void> {
  const port = await freePort();
  const occupant = scenario.portInUse ? await occupyPort(port) : undefined;
  const result = await runUntilExit(scenario.environment(port)).finally(() =>
    occupant?.close(),
  );
  const evidence = result.evidence ? `${result.evidence}\n` : '';
  const context = `signal ${result.signal};\n${evidence}output:\n${result.output}`;

  assert.equal(
    result.timedOut,
    false,
    `node did not exit within ${EXIT_TIMEOUT_MS} ms after the initialization failure; ${context}`,
  );
  assert.equal(result.code, 1, `expected exit status 1; ${context}`);
  assert.match(result.output, /Application error/, context);

  if (scenario.failureOutput) {
    assert.match(result.output, scenario.failureOutput, context);
  }

  if (scenario.portInUse) {
    assert.match(
      result.output,
      new RegExp(`API server could not listen on port ${port}`),
      context,
    );
  }

  const listening = result.output.indexOf('Run server:');
  const failure = result.output.indexOf('Application error');

  if (scenario.listensBeforeFailure) {
    assert.ok(
      listening !== -1 && listening < failure,
      `expected the API to start listening before the failure; ${context}`,
    );
  } else {
    assert.equal(
      listening,
      -1,
      `expected the API not to listen before the failure; ${context}`,
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
