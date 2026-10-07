import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { Call } from './Call';
import { CallEndedEvent } from './events/CallEndedEvent';
import { CallMissedEvent } from './events/CallMissedEvent';
import { CallParticipantDeclinedEvent } from './events/CallParticipantDeclinedEvent';
import { CallParticipantJoinedEvent } from './events/CallParticipantJoinedEvent';
import { CallParticipantLeftEvent } from './events/CallParticipantLeftEvent';
import { CallParticipantMissedEvent } from './events/CallParticipantMissedEvent';
import { CallStartedEvent } from './events/CallStartedEvent';

/**
 * Lifecycle events gossiped by other nodes are claims, not facts: a node
 * accepts one only when its own admitted signed records derive the same
 * transition, and then rebuilds the event from that local state. A forged event
 * for an unknown call, or one the signed records do not support, attests to
 * nothing and never drives push, websocket or missed-call behavior.
 */
export class CallEventAttestation {
  private static readonly PARTICIPANT_EVENTS: Record<
    string,
    { attribute: string; status: string }
  > = {
    [CallParticipantDeclinedEvent.EVENT_NAME]: {
      attribute: 'declinedIdentityId',
      status: 'declined',
    },
    [CallParticipantJoinedEvent.EVENT_NAME]: {
      attribute: 'joinedIdentityId',
      status: 'joined',
    },
    [CallParticipantLeftEvent.EVENT_NAME]: {
      attribute: 'leftIdentityId',
      status: 'left',
    },
    [CallParticipantMissedEvent.EVENT_NAME]: {
      attribute: 'missedIdentityId',
      status: 'missed',
    },
  };

  private static participantAttributes(
    event: DomainEvent,
    call: Call,
  ): Record<string, unknown> | undefined {
    const { attribute, status } =
      CallEventAttestation.PARTICIPANT_EVENTS[event.eventName()];
    const identityId = event.attributes[attribute];
    const supported =
      typeof identityId === 'string' &&
      call
        .toPrimitives()
        .participants.some(
          (participant) =>
            participant.identityId === identityId &&
            participant.status === status,
        );

    return supported ? { [attribute]: identityId } : undefined;
  }

  private static missedAttributes(
    event: DomainEvent,
    call: Call,
  ): Record<string, unknown> | undefined {
    const claimed = event.attributes.missedIdentityIds;
    const primitives = call.toPrimitives();

    if (primitives.status !== 'missed' || !Array.isArray(claimed)) {
      return undefined;
    }

    return {
      missedIdentityIds: primitives.participants
        .filter(
          (participant) =>
            participant.status === 'missed' &&
            claimed.includes(participant.identityId),
        )
        .map((participant) => participant.identityId),
    };
  }

  private static claimedAttributes(
    event: DomainEvent,
    call: Call,
  ): Record<string, unknown> | undefined {
    switch (event.eventName()) {
      case CallStartedEvent.EVENT_NAME:
        return call.isActive() ? {} : undefined;
      case CallEndedEvent.EVENT_NAME:
        return call.isActive() ? undefined : {};
      case CallMissedEvent.EVENT_NAME:
        return CallEventAttestation.missedAttributes(event, call);
      default:
        return CallEventAttestation.participantAttributes(event, call);
    }
  }

  public static isLifecycleEvent(event: DomainEvent): boolean {
    const name = event.eventName();

    return (
      name === CallStartedEvent.EVENT_NAME ||
      name === CallEndedEvent.EVENT_NAME ||
      name === CallMissedEvent.EVENT_NAME ||
      name in CallEventAttestation.PARTICIPANT_EVENTS
    );
  }

  /** The event rebuilt from the local call state, or undefined when unsupported. */
  public static attest(
    event: DomainEvent,
    call: Call,
  ): DomainEvent | undefined {
    if (event.aggregateId !== call.getId().valueOf()) return undefined;

    const claimed = CallEventAttestation.claimedAttributes(event, call);

    if (!claimed) return undefined;

    const EventClass = event.constructor as new (
      aggregateId: string,
      attributes: Record<string, unknown>,
      eventId: string,
      occurredOn: Date,
    ) => DomainEvent;

    return new EventClass(
      event.aggregateId,
      { ...call.toEventAttributes(), ...claimed },
      event.eventId,
      event.occurredOn,
    );
  }
}
