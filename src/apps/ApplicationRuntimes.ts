import CallRelayRuntime from '@app/apps/apis/calls-api/CallRelayRuntime';
import IPFSRuntime from '@app/apps/runtimes/ipfs-runtime/IPFSRuntime';
import LocalRoutingRecordRepublisherRuntime from '@app/apps/runtimes/local-routing-record-republisher-runtime/LocalRoutingRecordRepublisherRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationRuntimes: ApplicationServiceClass<Runtime>[] = [
  PublicRelayRuntime,
  CallRelayRuntime,
  IPFSRuntime,
  OrbitDBReplicatedStateRuntime,
  LocalRoutingRecordRepublisherRuntime,
];
