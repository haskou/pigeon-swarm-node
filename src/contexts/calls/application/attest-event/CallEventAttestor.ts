import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { CallEventAttestation } from '../../domain/CallEventAttestation';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallId } from '../../domain/value-objects/CallId';

/**
 * Turns a call lifecycle event received from the network into a local fact:
 * the event is accepted only once this node's admitted signed records derive
 * the same transition, and is then rebuilt from that local state. Records may
 * land after their gossiped announcement, so the check waits for admissions up
 * to a bounded deadline.
 */
export default class CallEventAttestor {
  private static readonly ADMISSION_WAIT_MS = 5_000;

  constructor(private readonly repository: CallRepository) {}

  private parseCallId(event: DomainEvent): CallId | undefined {
    try {
      return new CallId(event.aggregateId);
    } catch {
      return undefined;
    }
  }

  public async attest(event: DomainEvent): Promise<DomainEvent | undefined> {
    const callId = this.parseCallId(event);

    if (!callId) return undefined;

    const deadline = Date.now() + CallEventAttestor.ADMISSION_WAIT_MS;

    for (;;) {
      const call = await this.repository.findById(callId);
      const attested = call && CallEventAttestation.attest(event, call);

      if (attested) return attested;

      const remaining = deadline - Date.now();

      if (
        remaining <= 0 ||
        !(await this.repository.awaitUpdate(callId, remaining))
      ) {
        return undefined;
      }
    }
  }
}
