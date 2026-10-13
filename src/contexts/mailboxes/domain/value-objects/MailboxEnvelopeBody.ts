import { StringValueObject } from '@haskou/value-objects';

// Unbounded here: MailboxPolicy.decodedBodySize enforces the size buckets.
export class MailboxEnvelopeBody extends StringValueObject {
  constructor(value: string) {
    super(value, Number.POSITIVE_INFINITY);
  }
}
