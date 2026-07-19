import { ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';

export type RealTransportInstanceEvent = {
  type: string;
  [key: string]: unknown;
};

export class RealTransportInstanceProcess {
  private readonly events: RealTransportInstanceEvent[] = [];
  private readonly stderrLines: string[] = [];
  private readonly waiters: Array<{
    label: string;
    predicate: (event: RealTransportInstanceEvent) => boolean;
    reject(error: Error): void;
    resolve(event: RealTransportInstanceEvent): void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  private exited:
    | {
        code: number | null;
        signal: NodeJS.Signals | null;
      }
    | undefined;

  public constructor(
    private readonly label: string,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly waitTimeoutMs: number,
  ) {
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      this.handleStdoutLine(line);
    });
    readline.createInterface({ input: child.stderr }).on('line', (line) => {
      this.stderrLines.push(line);
      this.stderrLines.splice(0, Math.max(0, this.stderrLines.length - 80));
    });
    child.stdin.on('error', (error) => {
      this.stderrLines.push(`stdin error: ${String(error)}`);
    });
    child.once('exit', (code, signal) => {
      this.exited = { code, signal };
      this.rejectWaiters(
        new Error(
          `${this.label} exited before expected event: code=${code} signal=${signal} stderr="${this.stderrTail()}"`,
        ),
      );
    });
  }

  private handleStdoutLine(line: string): void {
    let event: RealTransportInstanceEvent;

    try {
      event = JSON.parse(line) as RealTransportInstanceEvent;
    } catch {
      this.stderrLines.push(`non-json stdout: ${line}`);

      return;
    }

    this.events.push(event);
    this.resolveMatchingWaiters(event);
  }

  private resolveMatchingWaiters(event: RealTransportInstanceEvent): void {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(event)) {
        continue;
      }

      clearTimeout(waiter.timeout);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(event);
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }

    this.waiters.splice(0);
  }

  private stderrTail(): string {
    return this.stderrLines.slice(-20).join('\n');
  }

  public waitFor(
    label: string,
    predicate: (event: RealTransportInstanceEvent) => boolean,
    timeoutMs: number = this.waitTimeoutMs,
  ): Promise<RealTransportInstanceEvent> {
    const existing = this.events.find(predicate);

    if (existing) {
      return Promise.resolve(existing);
    }

    if (this.exited) {
      return Promise.reject(
        new Error(
          `${this.label} already exited while waiting for ${label}: code=${this.exited.code} signal=${this.exited.signal} stderr="${this.stderrTail()}"`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiter = this.waiters.find(
          (candidate) => candidate.label === label,
        );

        if (waiter) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
        }

        reject(
          new Error(
            `Timed out waiting for ${this.label} ${label}. stderr="${this.stderrTail()}" events=${JSON.stringify(
              this.events,
            )}`,
          ),
        );
      }, timeoutMs);

      this.waiters.push({
        label,
        predicate,
        reject,
        resolve,
        timeout,
      });
    });
  }

  public send(command: Record<string, unknown>): void {
    if (this.child.stdin.destroyed || this.child.stdin.writableEnded) {
      return;
    }

    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  public async stop(): Promise<void> {
    if (!this.exited) {
      this.send({ type: 'stop' });
    }

    await Promise.race([
      this.waitFor('stop', (event) => event.type === 'stopped', 15_000).catch(
        (): void => {},
      ),
      new Promise((resolve) => setTimeout(resolve, 15_000)),
    ]);

    if (!this.exited) {
      this.child.kill('SIGTERM');
    }
  }

  public diagnostics(): string {
    return this.stderrTail();
  }
}
