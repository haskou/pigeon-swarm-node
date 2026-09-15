import { OrbitDBCommunityReplicaRegister } from './OrbitDBCommunityReplicaRegister';

export interface OrbitDBCommunityReplicaState {
  version: 1;
  entries: Record<string, OrbitDBCommunityReplicaRegister>;
}
