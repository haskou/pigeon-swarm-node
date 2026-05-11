/* eslint-disable no-console */
import 'module-alias/register';
import 'reflect-metadata';
import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/conversations/RegisterMessagesWhenSyncAvailable';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RespondToConversationSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationSyncRequest';
import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import RegisterIdentityWhenSyncAvailable from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenSyncAvailable';
import RespondToIdentitySyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentitySyncRequest';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import Kernel from '@app/Kernel';

import { IPFSRuntime } from './apps/runtimes/ipfs-runtime/IPFSRuntime';

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

  console.time('Run server');
  await kernel.runServer();
  console.timeEnd('Run server');

  console.time('Run consumers');
  kernel.addConsumers(
    RegisterIdentityWhenPublished,
    SynchronizeIdentityWhenUpdated,
    RespondToIdentitySyncRequest,
    RegisterIdentityWhenSyncAvailable,
    RegisterKeychainWhenPublished,
    SynchronizeKeychainWhenUpdated,
    RespondToKeychainSyncRequest,
    RegisterKeychainWhenSyncAvailable,
    RegisterMessageWhenAnnounced,
    RegisterMessageEditionWhenAnnounced,
    RegisterMessageDeletionWhenAnnounced,
    RespondToConversationSyncRequest,
    RegisterMessagesWhenSyncAvailable,
  );
  await kernel.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  kernel.addSchedulers();
  await kernel.runSchedulers();
  console.timeEnd('Run Schedulers');

  console.time('Logs');
  kernel.logs();
  console.timeEnd('Logs');

  console.time('Load local node state');
  await kernel.loadLocalNodeState();
  console.timeEnd('Load local node state');

  console.time('IPFS Runtime');
  const ipfsRuntime = new IPFSRuntime();
  await ipfsRuntime.run();
  console.timeEnd('IPFS Runtime');

  console.info('Ready!');
}

init()
  .then(() => {
    console.info('Application started');
  })
  .catch((error) => {
    console.error('Application error', error);
  });
