import CallEndMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallEndMutationPolicy';
import CallParticipantMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallParticipantMutationPolicy';
import CallStartMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallStartMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class CallMutationPolicies {
  constructor(
    private readonly starts: CallStartMutationPolicy,
    private readonly participants: CallParticipantMutationPolicy,
    private readonly ends: CallEndMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.starts, this.participants, this.ends];
  }
}
