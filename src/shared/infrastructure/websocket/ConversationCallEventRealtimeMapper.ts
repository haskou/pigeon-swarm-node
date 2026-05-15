import DomainEvent from '@app/shared/domain/events/DomainEvent';

export type WebSocketDomainEvent = {
  aggregate_id: string;
  attributes: Record<string, unknown>;
  causation_id?: string;
  correlation_id?: string;
  event_id: string;
  occurred_on: number;
  type: string;
};

type CallEventType = 'declined' | 'ended' | 'missed';

type ConversationScope = {
  conversationId?: string;
  type?: string;
};

export class ConversationCallEventRealtimeMapper {
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private callEventCreatedAt(
    event: DomainEvent,
    callEventType: CallEventType,
    actorIdentityId: string,
  ): number {
    if (callEventType === 'ended') {
      return Number(event.attributes.endedAt || event.occurredOn.getTime());
    }

    const participant = this.callEventParticipant(event, actorIdentityId);

    if (callEventType === 'declined' && participant?.declinedAt) {
      return Number(participant.declinedAt);
    }

    if (callEventType === 'missed' && participant?.missedAt) {
      return Number(participant.missedAt);
    }

    return event.occurredOn.getTime();
  }

  private callEventParticipant(
    event: DomainEvent,
    actorIdentityId: string,
  ): Record<string, unknown> | undefined {
    const participants = event.attributes.participants;

    if (!Array.isArray(participants)) {
      return undefined;
    }

    return participants.find(
      (participant): participant is Record<string, unknown> =>
        typeof participant === 'object' &&
        participant !== null &&
        String(participant.identityId || '') === actorIdentityId,
    );
  }

  private callEventType(event: DomainEvent): CallEventType | undefined {
    const eventName = event.eventName();

    if (eventName === 'calls.v1.call.ended') {
      return 'ended';
    }

    if (eventName === 'calls.v1.call.missed') {
      return 'missed';
    }

    if (eventName === 'calls.v1.participant.declined') {
      return 'declined';
    }

    return undefined;
  }

  private callEventActors(
    event: DomainEvent,
    callEventType: CallEventType,
  ): string[] {
    if (callEventType === 'declined') {
      return [String(event.attributes.declinedIdentityId || '')].filter(
        Boolean,
      );
    }

    if (callEventType === 'ended') {
      return [
        String(
          event.attributes.endedByIdentityId ||
            event.attributes.creatorIdentityId ||
            '',
        ),
      ].filter(Boolean);
    }

    if (Array.isArray(event.attributes.missedIdentityIds)) {
      return event.attributes.missedIdentityIds
        .map((identityId) => String(identityId || ''))
        .filter(Boolean);
    }

    return [];
  }

  private conversationScope(event: DomainEvent): ConversationScope | undefined {
    const scope = event.attributes.scope;

    if (!this.isRecord(scope)) {
      return undefined;
    }

    const conversationId = scope.conversationId;
    const type = scope.type;

    if (typeof conversationId !== 'string' || type !== 'conversation') {
      return undefined;
    }

    return {
      conversationId,
      type,
    };
  }

  private callEventMessages(
    event: DomainEvent,
  ): Array<Record<string, unknown>> {
    const callEventType = this.callEventType(event);

    if (!callEventType) {
      return [];
    }

    const callId = String(event.attributes.callId || event.aggregateId);
    const startedAt = Number(
      event.attributes.createdAt || event.occurredOn.getTime(),
    );

    return this.callEventActors(event, callEventType).map((actorIdentityId) => {
      const createdAt = this.callEventCreatedAt(
        event,
        callEventType,
        actorIdentityId,
      );

      return {
        actorIdentityId,
        callEventType,
        callId,
        createdAt,
        durationMs: Math.max(createdAt - startedAt, 0),
        id: `call-event:${callId}:${callEventType}:${actorIdentityId}`,
        type: 'call_event',
      };
    });
  }

  public toEvents(event: DomainEvent): WebSocketDomainEvent[] {
    const scope = this.conversationScope(event);

    if (!scope) {
      return [];
    }

    return this.callEventMessages(event).map((message) => ({
      aggregate_id: scope.conversationId,
      attributes: {
        message: {
          ...message,
          conversationId: scope.conversationId,
        },
        participantIds: event.attributes.participantIds,
      },
      event_id: `${event.eventId}:conversation-call-event:${message.id}`,
      occurred_on: event.occurredOn.getTime(),
      type: 'conversations.v1.call.event.was_recorded',
    }));
  }
}
