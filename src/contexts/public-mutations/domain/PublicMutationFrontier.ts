/**
 * The causal reference a scoped record carries: the digests of the scope's
 * operations (community or conversation) its author had observed when signing.
 * The record's permission is judged against the scope folded at exactly that
 * frontier, so the verdict does not depend on what a node happens to hold when
 * it evaluates the record.
 *
 * A frontier is a non-empty, strictly ascending set of operation digests.
 */
export class PublicMutationFrontier {
  private static readonly DIGEST = /^[A-Za-z0-9_-]{43}$/;

  public static readonly MAX_HEADS = 64;

  public static isValid(value: unknown): value is string[] {
    return (
      Array.isArray(value) &&
      value.length >= 1 &&
      value.length <= PublicMutationFrontier.MAX_HEADS &&
      value.every(
        (head, index) =>
          typeof head === 'string' &&
          PublicMutationFrontier.DIGEST.test(head) &&
          (index === 0 || (value[index - 1] as string) < head),
      )
    );
  }

  /** A stable key for caching lookups of one scope at one frontier. */
  public static keyOf(scopeId: string, frontier: string[]): string {
    return `${scopeId}@${frontier.join(',')}`;
  }
}
