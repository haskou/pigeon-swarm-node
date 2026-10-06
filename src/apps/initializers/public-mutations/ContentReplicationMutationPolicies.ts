import ContentReplicationMutationPolicy from '@app/contexts/content-replication/infrastructure/orbitdb/policies/ContentReplicationMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class ContentReplicationMutationPolicies {
  constructor(
    private readonly replications: ContentReplicationMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.replications];
  }
}
