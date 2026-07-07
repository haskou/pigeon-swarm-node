import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBInstance } from './OrbitDBInstance';

export type OrbitDBReplicatedStoreSet = {
  calls: OrbitDBDatabase;
  communities: OrbitDBDatabase;
  conversations: OrbitDBDatabase;
  events: OrbitDBDatabase;
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
  reactions: OrbitDBDatabase;
  requests: OrbitDBDatabase;
  stickerPacks: OrbitDBDatabase;
  stickerUserLibraries: OrbitDBDatabase;
};
