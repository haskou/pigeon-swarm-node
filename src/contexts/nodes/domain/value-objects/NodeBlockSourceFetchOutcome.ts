import { Enum } from '@haskou/value-objects';

const outcomes = {
  ACCEPTED: 'accepted',
  INVALID_DOCUMENT: 'invalid-document',
  INVALID_SIGNATURE: 'invalid-signature',
  NOT_NEWER: 'not-newer',
  REDIRECTED: 'redirected',
  REFUSED_ADDRESS: 'refused-address',
  TOO_LARGE: 'too-large',
  UNREACHABLE: 'unreachable',
  WRONG_SIGNER: 'wrong-signer',
} as const;

/** How the last fetch of an adopted source ended; only `accepted` replaced its list. */
export class NodeBlockSourceFetchOutcome extends Enum<string> {
  public static readonly ACCEPTED = new NodeBlockSourceFetchOutcome(
    outcomes.ACCEPTED,
  );

  public static readonly INVALID_DOCUMENT = new NodeBlockSourceFetchOutcome(
    outcomes.INVALID_DOCUMENT,
  );

  public static readonly INVALID_SIGNATURE = new NodeBlockSourceFetchOutcome(
    outcomes.INVALID_SIGNATURE,
  );

  public static readonly NOT_NEWER = new NodeBlockSourceFetchOutcome(
    outcomes.NOT_NEWER,
  );

  public static readonly REDIRECTED = new NodeBlockSourceFetchOutcome(
    outcomes.REDIRECTED,
  );

  public static readonly REFUSED_ADDRESS = new NodeBlockSourceFetchOutcome(
    outcomes.REFUSED_ADDRESS,
  );

  public static readonly TOO_LARGE = new NodeBlockSourceFetchOutcome(
    outcomes.TOO_LARGE,
  );

  public static readonly UNREACHABLE = new NodeBlockSourceFetchOutcome(
    outcomes.UNREACHABLE,
  );

  public static readonly WRONG_SIGNER = new NodeBlockSourceFetchOutcome(
    outcomes.WRONG_SIGNER,
  );

  public static fromPrimitives(value: string): NodeBlockSourceFetchOutcome {
    return new NodeBlockSourceFetchOutcome(value);
  }

  public getValues(): string[] {
    return Object.values(outcomes);
  }
}
