import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidConversationDraftKeyError } from '../errors/InvalidConversationDraftKeyError';

/**
 * Opaque draft slot: base64url(HMAC-SHA256(owner draft key, conversation id)),
 * derived by the client. The node never learns which conversation it names.
 */
export class ConversationDraftKey extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      /^[A-Za-z0-9_-]{43}$/.test(this.valueOf()),
      new InvalidConversationDraftKeyError(),
    );
  }
}
