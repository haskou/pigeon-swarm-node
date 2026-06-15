import CallRelayRuntime from '@app/apps/apis/calls-api/CallRelayRuntime';
import IPFSRuntime from '@app/apps/runtimes/ipfs-runtime/IPFSRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

export const applicationRuntimes: ServiceClass<Runtime>[] = [
  PublicRelayRuntime,
  CallRelayRuntime,
  IPFSRuntime,
  OrbitDBReplicatedStateRuntime,
];
