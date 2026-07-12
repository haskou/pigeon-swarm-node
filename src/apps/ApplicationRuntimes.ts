import CallRelayRuntime from '@app/apps/apis/calls-api/CallRelayRuntime';
import CallSignalDeliveryMaintenanceRuntime from '@app/apps/runtimes/call-signal-delivery-maintenance-runtime/CallSignalDeliveryMaintenanceRuntime';
import IPFSRuntime from '@app/apps/runtimes/ipfs-runtime/IPFSRuntime';
import OrbitDBCallProjectionRuntime from '@app/apps/runtimes/orbitdb-call-projection-runtime/OrbitDBCallProjectionRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationRuntimes: ApplicationServiceClass<Runtime>[] = [
  PublicRelayRuntime,
  CallRelayRuntime,
  IPFSRuntime,
  OrbitDBReplicatedStateRuntime,
  OrbitDBCallProjectionRuntime,
  CallSignalDeliveryMaintenanceRuntime,
];
