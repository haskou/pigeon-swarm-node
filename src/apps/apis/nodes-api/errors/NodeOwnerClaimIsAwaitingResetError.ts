import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';

export class NodeOwnerClaimIsAwaitingResetError extends CustomHttpError {
  constructor() {
    super(
      403,
      403013,
      'The node owner must be reset by the node operator before the node can be claimed.',
    );
  }
}
