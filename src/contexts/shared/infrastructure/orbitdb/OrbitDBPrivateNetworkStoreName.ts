import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';

export type OrbitDBPrivateNetworkStoreName =
  | OrbitDBReplicatedDocumentStoreName
  | 'heads';
