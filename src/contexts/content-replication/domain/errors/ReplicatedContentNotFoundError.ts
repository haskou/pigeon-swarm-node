import { ContentId } from '../value-objects/ContentId';

export class ReplicatedContentNotFoundError extends Error {
  constructor(contentId: ContentId) {
    super(`Content not found: ${contentId.valueOf()}`);
    Object.setPrototypeOf(this, ReplicatedContentNotFoundError.prototype);
  }
}
