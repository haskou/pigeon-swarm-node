import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSContentReplicaClaim } from '../IPFSContentReplicaClaim';

export interface IPFSContentReplicaClaimRepository {
  findByCids(cids: IPFSId[]): Promise<IPFSContentReplicaClaim[]>;
  save(claim: IPFSContentReplicaClaim): Promise<void>;
}
