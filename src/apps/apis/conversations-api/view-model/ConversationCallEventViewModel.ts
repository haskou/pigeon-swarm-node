import { Call } from '@app/contexts/calls/domain/Call';
import { PrimitiveOf } from '@haskou/value-objects';

import {
  ConversationCallEventResource,
  ConversationCallEventType,
} from '../resources/ConversationCallEventResource';

export class ConversationCallEventViewModel {
  private static durationMs(
    call: PrimitiveOf<Call>,
    createdAt: number,
  ): number {
    return Math.max(createdAt - call.createdAt, 0);
  }

  private static eventId(
    callId: string,
    eventType: ConversationCallEventType,
    actorIdentityId: string,
  ): string {
    return `call-event:${callId}:${eventType}:${actorIdentityId}`;
  }

  private static conversationId(call: PrimitiveOf<Call>): string {
    return call.scope.conversationId || '';
  }

  private static fromParticipant(
    call: PrimitiveOf<Call>,
    eventType: Extract<ConversationCallEventType, 'declined' | 'missed'>,
    participant: PrimitiveOf<Call>['participants'][number],
    createdAt: number,
  ): ConversationCallEventResource {
    return {
      actorIdentityId: participant.identityId,
      callEventType: eventType,
      callId: call.id,
      conversationId: this.conversationId(call),
      createdAt,
      durationMs: this.durationMs(call, createdAt),
      id: this.eventId(call.id, eventType, participant.identityId),
      type: 'call_event',
    };
  }

  public static fromCall(call: Call): ConversationCallEventResource[] {
    const primitives = call.toPrimitives();
    const events: ConversationCallEventResource[] = [];

    if (primitives.scope.type !== 'conversation') {
      return events;
    }

    if (primitives.status === 'ended' && primitives.endedAt) {
      const actorIdentityId =
        primitives.endedByIdentityId || primitives.creatorIdentityId;

      events.push({
        actorIdentityId,
        callEventType: 'ended',
        callId: primitives.id,
        conversationId: this.conversationId(primitives),
        createdAt: primitives.endedAt,
        durationMs: this.durationMs(primitives, primitives.endedAt),
        id: this.eventId(primitives.id, 'ended', actorIdentityId),
        type: 'call_event',
      });
    }

    for (const participant of primitives.participants) {
      if (participant.declinedAt) {
        events.push(
          this.fromParticipant(
            primitives,
            'declined',
            participant,
            participant.declinedAt,
          ),
        );
      } else if (participant.missedAt) {
        events.push(
          this.fromParticipant(
            primitives,
            'missed',
            participant,
            participant.missedAt,
          ),
        );
      }
    }

    return events;
  }
}
