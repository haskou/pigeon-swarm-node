import 'module-alias/register';
import 'reflect-metadata';
import { applicationConsumers } from '@app/apps/ApplicationConsumers';
import { applicationInitializers } from '@app/apps/ApplicationInitializers';
import { applicationRuntimes } from '@app/apps/ApplicationRuntimes';
import {
  recurringSchedulers,
  startupSchedulers,
} from '@app/apps/ApplicationSchedulers';
import PigeonApplication from '@app/apps/PigeonApplication';
import '@app/contexts/content-replication/infrastructure/ipfs/IpfsContentStorage';
import Kernel from '@haskou/ddd-kernel';

const startupTimers = new Map<string, bigint>();

function startTimer(label: string): void {
  startupTimers.set(label, process.hrtime.bigint());
}

function endTimer(label: string): void {
  const startedAt = startupTimers.get(label);

  if (startedAt === undefined) {
    return;
  }

  startupTimers.delete(label);
  const elapsedMilliseconds =
    Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  Kernel.logger.info(`${label}: ${elapsedMilliseconds.toFixed(3)}ms`);
}

function logInfo(message: string): void {
  Kernel.logger.info(message);
}

function logError(message: string, error: unknown): void {
  const details =
    error instanceof Error ? error.stack || error.message : String(error);
  Kernel.logger.error(details ? `${message}: ${details}` : message);
}

export async function init(application: PigeonApplication): Promise<void> {
  startTimer('Environment variables');
  application.loadEnvironmentVariables();
  endTimer('Environment variables');

  startTimer('Dependency Injection');
  await application.dependencyInjection();
  endTimer('Dependency Injection');

  application.configureWebSocketEventHub();

  // Initializers (identity id purge, block policy, mutation gates) finish
  // before the server accepts a request, so no owner write races them.
  startTimer('Run initializers');
  await application.runInitializers(...applicationInitializers);
  endTimer('Run initializers');

  startTimer('Run server');
  await application.runServer();
  endTimer('Run server');

  startTimer('Run consumers');
  application.addConsumers(...applicationConsumers);
  await application.runConsumers();
  endTimer('Run consumers');

  startTimer('Run Schedulers');
  application.addSchedulers(...recurringSchedulers);
  await application.runSchedulers();
  endTimer('Run Schedulers');

  startTimer('Logs');
  application.logs();
  endTimer('Logs');

  startTimer('Load local node state');
  await application.loadLocalNodeState();
  endTimer('Load local node state');

  startTimer('Run runtimes');
  await application.runRuntimes(...applicationRuntimes);
  endTimer('Run runtimes');

  startTimer('Republish local routing records');
  for (const scheduler of startupSchedulers) {
    await application.runSchedulerNowAndSchedule(scheduler);
  }
  endTimer('Republish local routing records');
  application.markStarted();
  logInfo('Ready!');
}

const FAILED_INIT_SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdownAfterInitFailure(
  application: PigeonApplication,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${FAILED_INIT_SHUTDOWN_TIMEOUT_MS}ms`));
    }, FAILED_INIT_SHUTDOWN_TIMEOUT_MS);
  });

  try {
    await Promise.race([application.shutdown(), timeout]);
  } catch (error) {
    logError('Shutdown after init failure', error);
  } finally {
    clearTimeout(timer);
  }
}

async function run(): Promise<void> {
  let application: PigeonApplication | undefined;

  try {
    startTimer('Kernel');
    application = new PigeonApplication();
    endTimer('Kernel');

    await init(application);
    logInfo('Application started');
  } catch (error) {
    logError('Application error', error);

    if (application) {
      await shutdownAfterInitFailure(application);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  void run();
}
