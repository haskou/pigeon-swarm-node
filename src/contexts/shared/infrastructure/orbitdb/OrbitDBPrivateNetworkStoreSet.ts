import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBInstance } from './OrbitDBInstance';

export type OrbitDBPrivateNetworkStoreSet = {
  calls: OrbitDBDatabase;
  communityOperations: OrbitDBDatabase;
  conversationOperations: OrbitDBDatabase;
  heads: OrbitDBDatabase;
  identities: OrbitDBDatabase;
  contentReplication: OrbitDBDatabase;
  keychains: OrbitDBDatabase;
  messages: OrbitDBDatabase;
  mlsRecords: OrbitDBDatabase;
  moderationLogs: OrbitDBDatabase;
  notificationSettings: OrbitDBDatabase;
  notifications: OrbitDBDatabase;
  orbitdb: OrbitDBInstance;
  pins: OrbitDBDatabase;
  polls: OrbitDBDatabase;
  reactions: OrbitDBDatabase;
  requests: OrbitDBDatabase;
  stickerPacks: OrbitDBDatabase;
  stickerUserLibraries: OrbitDBDatabase;
};
