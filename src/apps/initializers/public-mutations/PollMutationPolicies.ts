import PollCloseMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollCloseMutationPolicy';
import PollMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollMutationPolicy';
import PollVoteMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollVoteMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class PollMutationPolicies {
  constructor(
    private readonly polls: PollMutationPolicy,
    private readonly votes: PollVoteMutationPolicy,
    private readonly closes: PollCloseMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.polls, this.votes, this.closes];
  }
}
