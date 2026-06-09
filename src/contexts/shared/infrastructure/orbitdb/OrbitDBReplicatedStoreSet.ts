import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBInstance } from './OrbitDBInstance';

export type OrbitDBReplicatedStoreSet = {
  communities: OrbitDBDatabase;
  conversations: OrbitDBDatabase;
  events: OrbitDBDatabase;
  heads: OrbitDBDatabase;
  identities: OrbitDBDatabase;
  ipfsReplication: OrbitDBDatabase;
  keychains: OrbitDBDatabase;
  messages: OrbitDBDatabase;
  notifications: OrbitDBDatabase;
  orbitdb: OrbitDBInstance;
  reactions: OrbitDBDatabase;
  requests: OrbitDBDatabase;
};
