/* TEMPORARY diagnostics for the call-privacy POST /identities hang. Not for merge. */
const startedAt = Date.now();
const pending = new Map<number, { label: string; since: number; stack: string }>();
let sequence = 0;

export const diag = (message: string): void => {
  process.stdout.write(`DIAG +${Date.now() - startedAt}ms ${message}\n`);
};

export const diagSpan = async <T>(
  label: string,
  work: () => Promise<T>,
  alwaysLog: boolean = false,
  minLogMs: number = 200,
): Promise<T> => {
  const id = ++sequence;
  const since = Date.now();

  pending.set(id, {
    label,
    since,
    stack: (new Error().stack ?? '').split('\n').slice(2, 9).join(' | '),
  });

  if (alwaysLog) diag(`start ${label}`);

  try {
    return await work();
  } finally {
    pending.delete(id);
    const elapsed = Date.now() - since;

    if (alwaysLog || elapsed >= minLogMs) diag(`end ${label} took=${elapsed}ms`);
  }
};

let lastTick = Date.now();
let lastDump = 0;

const monitor = setInterval(() => {
  const now = Date.now();
  const lag = now - lastTick - 250;

  lastTick = now;

  if (lag > 300) diag(`EVENT LOOP LAG ${lag}ms`);

  if (now - lastDump >= 2000) {
    lastDump = now;
    const old = [...pending.values()].filter((entry) => now - entry.since >= 2000);

    if (old.length > 0) {
      diag(
        `PENDING ${old.length}: ` +
          old
            .map(
              (entry) =>
                `[${entry.label} age=${now - entry.since}ms at ${entry.stack}]`,
            )
            .join(' '),
      );
    }
  }
}, 250);

monitor.unref();
