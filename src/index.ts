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

const SHUTDOWN_TIMEOUT_MS = 8_000;

async function shutdownWithinBudget(
  application: PigeonApplication,
  reason: string,
): Promise<boolean> {
  const { promise: timeout, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    reject(new Error(`timed out after ${SHUTDOWN_TIMEOUT_MS}ms`));
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await Promise.race([application.shutdown(), timeout]);

    return true;
  } catch (error) {
    logError(`Shutdown ${reason}`, error);

    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Docker sends SIGKILL 10 s after SIGTERM (the `docker stop` default), so a
 * stop gets 8 s: the kernel shutdown closes the IPFS networks, OrbitDB stores
 * and local databases, and a stuck close never outlives the grace period.
 * Signals that arrive while the first stop runs are ignored.
 */
export function installShutdownSignalHandlers(
  application: PigeonApplication,
  signalSource: NodeJS.EventEmitter = process,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  let stopping = false;

  const stop = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    logInfo(`Received ${signal}, shutting down`);
    const clean = await shutdownWithinBudget(application, `on ${signal}`);

    exit(clean ? 0 : 1);
  };

  signalSource.on('SIGTERM', () => void stop('SIGTERM'));
  signalSource.on('SIGINT', () => void stop('SIGINT'));
}

async function run(): Promise<void> {
  let application: PigeonApplication | undefined;

  try {
    startTimer('Kernel');
    application = new PigeonApplication();
    installShutdownSignalHandlers(application);
    endTimer('Kernel');

    await init(application);
    logInfo('Application started');
  } catch (error) {
    logError('Application error', error);

    if (application) {
      await shutdownWithinBudget(application, 'after init failure');
    }

    process.exit(1);
  }
}

if (require.main === module) {
  void run();
}
