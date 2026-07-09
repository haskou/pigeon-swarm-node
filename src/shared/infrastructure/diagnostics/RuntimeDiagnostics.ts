import Kernel from '@haskou/ddd-kernel';
import { mkdirSync } from 'fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import path from 'path';

import { pigeonEnvironment } from '../environment/PigeonEnvironment';

type ProcessWithActiveHandles = NodeJS.Process & {
  _getActiveHandles?: () => Array<{ constructor?: { name?: string } }>;
};

export default class RuntimeDiagnostics {
  private static started = false;

  private static reportDirectory(): string | undefined {
    const localDatabasePath = pigeonEnvironment().PIGEON_LOCAL_DB_PATH;

    return localDatabasePath
      ? path.resolve(localDatabasePath, 'node-reports')
      : undefined;
  }

  private static eventLoopWarningThresholdMs(): number {
    return pigeonEnvironment().PIGEON_EVENT_LOOP_DELAY_WARNING_MS;
  }

  private static activeHandleSummary(): string {
    const handles = (process as ProcessWithActiveHandles)._getActiveHandles?.();

    if (!handles) {
      return 'unknown';
    }

    const groupedHandles = new Map<string, number>();

    for (const handle of handles) {
      const name = handle.constructor?.name || 'Unknown';

      groupedHandles.set(name, (groupedHandles.get(name) || 0) + 1);
    }

    return [...groupedHandles.entries()]
      .map(([name, count]) => `${name}=${count}`)
      .join(',');
  }

  private static ensureReportDirectory(): void {
    const reportDirectory = RuntimeDiagnostics.reportDirectory();

    if (!reportDirectory) {
      return;
    }

    try {
      mkdirSync(reportDirectory, { recursive: true });
      process.report.directory = reportDirectory;
    } catch (error) {
      Kernel.logger.warn?.(
        `Node report directory could not be created: path=${reportDirectory} error=${String(error)}`,
      );
    }
  }

  private static startEventLoopMonitor(): void {
    const histogram = monitorEventLoopDelay({ resolution: 20 });
    const interval = setInterval(() => {
      const maxMs = Math.round(histogram.max / 1_000_000);
      const meanMs = Math.round(histogram.mean / 1_000_000);
      const p99Ms = Math.round(histogram.percentile(99) / 1_000_000);

      if (maxMs >= RuntimeDiagnostics.eventLoopWarningThresholdMs()) {
        const memory = process.memoryUsage();

        Kernel.logger.warn?.(
          [
            `Event loop delay detected: maxMs=${maxMs}`,
            `meanMs=${meanMs}`,
            `p99Ms=${p99Ms}`,
            `rss=${memory.rss}`,
            `heapUsed=${memory.heapUsed}`,
            `external=${memory.external}`,
            `activeHandles=${RuntimeDiagnostics.activeHandleSummary()}`,
          ].join(' '),
        );
      }

      histogram.reset();
    }, 5_000);

    histogram.enable();
    interval.unref?.();
  }

  public static start(): void {
    if (RuntimeDiagnostics.started) {
      return;
    }

    RuntimeDiagnostics.started = true;
    RuntimeDiagnostics.ensureReportDirectory();
    RuntimeDiagnostics.startEventLoopMonitor();
  }
}
