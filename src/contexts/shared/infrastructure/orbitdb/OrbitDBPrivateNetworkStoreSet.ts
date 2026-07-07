import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBInstance } from './OrbitDBInstance';

export type OrbitDBPrivateNetworkStoreSet = {
  calls: OrbitDBDatabase;
  communities: OrbitDBDatabase;
  conversations: OrbitDBDatabase;
  heads: OrbitDBDatabase;
  identities: OrbitDBDatabase;
  contentReplication: OrbitDBDatabase;
  keychains: OrbitDBDatabase;
  messages: OrbitDBDatabase;
  moderationLogs: OrbitDBDatabase;
  notificationSettings: OrbitDBDatabase;
  notifications: OrbitDBDatabase;
  orbitdb: OrbitDBInstance;
  pins: OrbitDBDatabase;
  polls: OrbitDBDatabase;
  presence: OrbitDBDatabase;
  reactions: OrbitDBDatabase;
  requests: OrbitDBDatabase;
  stickerPacks: OrbitDBDatabase;
  stickerUserLibraries: OrbitDBDatabase;
};
