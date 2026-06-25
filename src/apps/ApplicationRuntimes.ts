import IPFSRuntime from '@app/apps/runtimes/ipfs-runtime/IPFSRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationRuntimes: ApplicationServiceClass<Runtime>[] = [
  PublicRelayRuntime,
  IPFSRuntime,
  OrbitDBReplicatedStateRuntime,
];
