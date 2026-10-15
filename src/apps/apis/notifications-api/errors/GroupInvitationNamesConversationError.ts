import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

/** A group letter names no conversation: its id travels only in the seal. */
export class GroupInvitationNamesConversationError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.BAD_REQUEST,
      400070,
      'A group conversation invitation must not carry a conversation id.',
    );
  }
}
