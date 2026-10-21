import CallRelayRuntime from '@app/apps/apis/calls-api/CallRelayRuntime';
import CallSignalDeliveryMaintenanceRuntime from '@app/apps/runtimes/call-signal-delivery-maintenance-runtime/CallSignalDeliveryMaintenanceRuntime';
import CallTurnConfigurationRuntime from '@app/apps/runtimes/call-turn-configuration-runtime/CallTurnConfigurationRuntime';
import DeviceSealingRecordPruningRuntime from '@app/apps/runtimes/device-sealing-record-pruning-runtime/DeviceSealingRecordPruningRuntime';
import IPFSRuntime from '@app/apps/runtimes/ipfs-runtime/IPFSRuntime';
import OrbitDBCallProjectionRuntime from '@app/apps/runtimes/orbitdb-call-projection-runtime/OrbitDBCallProjectionRuntime';
import OrbitDBIdentityAdmissionObservationRuntime from '@app/apps/runtimes/orbitdb-identity-admission-observation-runtime/OrbitDBIdentityAdmissionObservationRuntime';
import OrbitDBIdentityMetadataProjectionRuntime from '@app/apps/runtimes/orbitdb-identity-metadata-projection-runtime/OrbitDBIdentityMetadataProjectionRuntime';
import OrbitDBKeychainMetadataProjectionRuntime from '@app/apps/runtimes/orbitdb-keychain-metadata-projection-runtime/OrbitDBKeychainMetadataProjectionRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationRuntimes: ApplicationServiceClass<Runtime>[] = [
  PublicRelayRuntime,
  CallTurnConfigurationRuntime,
  CallRelayRuntime,
  IPFSRuntime,
  OrbitDBReplicatedStateRuntime,
  OrbitDBIdentityMetadataProjectionRuntime,
  OrbitDBIdentityAdmissionObservationRuntime,
  OrbitDBKeychainMetadataProjectionRuntime,
  OrbitDBCallProjectionRuntime,
  DeviceSealingRecordPruningRuntime,
  CallSignalDeliveryMaintenanceRuntime,
];
