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
import '@app/contexts/content-replication/infrastructure/ipfs/IpfsContentStorage';
import '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import { orbitDBReplicatedEventTypes } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedEventTypes';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';

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

  const messageBus = Kernel.di.getService<MessageBus>(MessageBus);

  for (const eventType of orbitDBReplicatedEventTypes) {
    messageBus.registerEventType(eventType.bindingKey, eventType.domainEvent);
  }

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
