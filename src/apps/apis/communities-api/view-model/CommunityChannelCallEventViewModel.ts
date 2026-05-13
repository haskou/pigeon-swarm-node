import { Call } from '@app/contexts/calls/domain/Call';

import {
  CommunityChannelCallEventResource,
  CommunityChannelCallEventType,
} from '../resources/CommunityChannelCallEventResource';

type CallPrimitives = ReturnType<Call['toPrimitives']>;
type CallParticipantPrimitives = CallPrimitives['participants'][number];

export class CommunityChannelCallEventViewModel {
  private static durationMs(call: CallPrimitives, createdAt: number): number {
    return Math.max(createdAt - call.createdAt, 0);
  }

  private static eventId(
    callId: string,
    eventType: CommunityChannelCallEventType,
    actorIdentityId: string,
  ): string {
    return `call-event:${callId}:${eventType}:${actorIdentityId}`;
  }

  private static fromParticipant(
    call: CallPrimitives,
    eventType: Extract<CommunityChannelCallEventType, 'declined' | 'missed'>,
    participant: CallParticipantPrimitives,
    createdAt: number,
  ): CommunityChannelCallEventResource {
    return {
      actorIdentityId: participant.identityId,
      callEventType: eventType,
      callId: call.id,
      channelId: call.scope.channelId as string,
      communityId: call.scope.communityId as string,
      createdAt,
      durationMs: this.durationMs(call, createdAt),
      id: this.eventId(call.id, eventType, participant.identityId),
      type: 'call_event',
    };
  }

  public static fromCall(call: Call): CommunityChannelCallEventResource[] {
    const primitives = call.toPrimitives();
    const events: CommunityChannelCallEventResource[] = [];

    if (primitives.scope.type !== 'community_channel') {
      return events;
    }

    if (primitives.status === 'ended' && primitives.endedAt) {
      const actorIdentityId =
        primitives.endedByIdentityId || primitives.creatorIdentityId;

      events.push({
        actorIdentityId,
        callEventType: 'ended',
        callId: primitives.id,
        channelId: primitives.scope.channelId as string,
        communityId: primitives.scope.communityId as string,
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
