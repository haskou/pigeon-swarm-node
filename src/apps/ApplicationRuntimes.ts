import IPFSRuntime from '@app/apps/runtimes/ipfs-runtime/IPFSRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';

export const applicationRuntimes: ServiceClass<Runtime>[] = [
  IPFSRuntime,
  OrbitDBReplicatedStateRuntime,
];
