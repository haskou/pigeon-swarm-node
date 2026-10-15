import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export interface CallRealtimeAudience {
  call: Call;
  leases: CallParticipantLease[];
  leasesWarmingUp: boolean;
  participants: IdentityId[];
  recipientIds: string[];
}
