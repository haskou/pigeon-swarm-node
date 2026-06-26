/* eslint-disable no-console */
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
import '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import { orbitDBReplicatedEventTypes } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedEventTypes';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { Kernel } from '@haskou/ddd-kernel';

async function init() {
  console.time('Kernel');
  const application = new PigeonApplication();
  console.timeEnd('Kernel');

  console.time('Environment variables');
  application.loadEnvironmentVariables();
  console.timeEnd('Environment variables');

  console.time('Dependency Injection');
  await application.dependencyInjection();
  console.timeEnd('Dependency Injection');

  application.configureWebSocketEventHub();

  const messageBus = Kernel.di.getService<MessageBus>(MessageBus);

  for (const eventType of orbitDBReplicatedEventTypes) {
    messageBus.registerEventType(eventType.bindingKey, eventType.domainEvent);
  }

  console.time('Run server');
  await application.runServer();
  console.timeEnd('Run server');

  console.time('Run consumers');
  application.addConsumers(...applicationConsumers);
  await application.runInitializers(...applicationInitializers);
  await application.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  application.addSchedulers(...recurringSchedulers);
  await application.runSchedulers();
  console.timeEnd('Run Schedulers');

  console.time('Logs');
  application.logs();
  console.timeEnd('Logs');

  console.time('Load local node state');
  await application.loadLocalNodeState();
  console.timeEnd('Load local node state');

  console.time('Run runtimes');
  await application.runRuntimes(...applicationRuntimes);
  console.timeEnd('Run runtimes');

  console.time('Republish local routing records');
  for (const scheduler of startupSchedulers) {
    await application.runSchedulerNowAndSchedule(scheduler);
  }
  console.timeEnd('Republish local routing records');

  console.info('Ready!');
}

if (require.main === module) {
  init()
    .then(() => {
      console.info('Application started');
    })
    .catch((error) => {
      console.error('Application error', error);
    });
}
