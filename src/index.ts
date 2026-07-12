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

async function init() {
  startTimer('Kernel');
  const application = new PigeonApplication();
  endTimer('Kernel');

  startTimer('Environment variables');
  application.loadEnvironmentVariables();
  endTimer('Environment variables');

  startTimer('Dependency Injection');
  await application.dependencyInjection();
  endTimer('Dependency Injection');

  application.configureWebSocketEventHub();

  startTimer('Run server');
  await application.runServer();
  endTimer('Run server');

  startTimer('Run consumers');
  application.addConsumers(...applicationConsumers);
  await application.runInitializers(...applicationInitializers);
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
  logInfo('Ready!');
}

if (require.main === module) {
  init()
    .then(() => {
      logInfo('Application started');
    })
    .catch((error) => {
      logError('Application error', error);
    });
}
