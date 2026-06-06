import IPFSContentReplicationRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationRegistrar';

export type ReplicationRegistrar = Pick<
  IPFSContentReplicationRegistrar,
  'register'
>;
