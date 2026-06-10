/* eslint-disable no-console */
import 'module-alias/register';
import 'reflect-metadata';
import { applicationConsumers } from '@app/apps/ApplicationConsumers';
import { applicationInitializers } from '@app/apps/ApplicationInitializers';
import {
  applicationRuntimes,
  startupSyncRuntimes,
} from '@app/apps/ApplicationRuntimes';
import {
  recurringSchedulers,
  startupSchedulers,
} from '@app/apps/ApplicationSchedulers';
import Kernel from '@app/Kernel';

async function init() {
  console.time('Kernel');
  const kernel = new Kernel();
  console.timeEnd('Kernel');

  console.time(`Environment ${process.env.NODE_ENV} variables`);
  kernel.environmentVariables();
  console.timeEnd(`Environment ${process.env.NODE_ENV} variables`);

  console.time('Dependency Injection');
  await kernel.dependencyInjection();
  console.timeEnd('Dependency Injection');
  kernel.configureWebSocketEventHub();

  console.time('Run server');
  await kernel.runServer();
  console.timeEnd('Run server');

  console.time('Run consumers');
  kernel.addConsumers(...applicationConsumers);
  await kernel.runInitializers(...applicationInitializers);
  await kernel.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  kernel.addSchedulers(...recurringSchedulers);
  await kernel.runSchedulers();
  console.timeEnd('Run Schedulers');

  console.time('Logs');
  kernel.logs();
  console.timeEnd('Logs');

  console.time('Load local node state');
  await kernel.loadLocalNodeState();
  console.timeEnd('Load local node state');

  console.time('Run runtimes');
  await kernel.runRuntimes(...applicationRuntimes);
  console.timeEnd('Run runtimes');

  console.time('Republish local routing records');
  for (const scheduler of startupSchedulers) {
    await kernel.runSchedulerNowAndSchedule(scheduler);
  }
  console.timeEnd('Republish local routing records');

  console.time('Node startup sync');
  await kernel.runRuntimes(...startupSyncRuntimes);
  console.timeEnd('Node startup sync');

  console.info('Ready!');
}

init()
  .then(() => {
    console.info('Application started');
  })
  .catch((error) => {
    console.error('Application error', error);
  });
