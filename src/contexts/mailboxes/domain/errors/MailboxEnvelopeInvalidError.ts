import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxEnvelopeInvalidError extends BaseError {
  constructor(sizes: number[]) {
    super(
      `Envelope body must be base64url and decode to exactly one of ${sizes.join(', ')} bytes.`,
    );
  }
}
