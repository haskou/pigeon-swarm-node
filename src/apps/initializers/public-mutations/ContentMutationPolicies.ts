import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

import ContentReplicationMutationPolicies from './ContentReplicationMutationPolicies';
import PollMutationPolicies from './PollMutationPolicies';
import StickerMutationPolicies from './StickerMutationPolicies';

export default class ContentMutationPolicies {
  constructor(
    private readonly stickers: StickerMutationPolicies,
    private readonly polls: PollMutationPolicies,
    private readonly contentReplications: ContentReplicationMutationPolicies,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [
      ...this.stickers.all(),
      ...this.polls.all(),
      ...this.contentReplications.all(),
    ];
  }
}
