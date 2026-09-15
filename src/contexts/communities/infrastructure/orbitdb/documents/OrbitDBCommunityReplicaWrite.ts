import { OrbitDBCommunityDocument } from './OrbitDBCommunityDocument';

export interface OrbitDBCommunityReplicaWrite {
  baseline: OrbitDBCommunityDocument;
  document: OrbitDBCommunityDocument;
}
