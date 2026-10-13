/**
 * Serializes every mailbox mutation in this process, so check-then-write
 * sequences (quota, dedupe, cursor assignment) cannot interleave.
 */
export default class MailboxCoordinator {
  private queue: Promise<unknown> = Promise.resolve();

  public run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);

    this.queue = result.catch((): void => undefined);

    return result;
  }
}
