import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { WebSocket } from 'ws';

type WebSocketRealtimeMessage =
  | {
      identityId: string;
      type: 'connection_ack';
    }
  | {
      event: unknown;
      type: 'domain_event';
    };
type WebSocketDomainEvent = {
  aggregate_id: string;
  attributes: Record<string, unknown>;
  causation_id?: string;
  correlation_id?: string;
  event_id: string;
  occurred_on: number;
  type: string;
};

const identityAttributeKeys = [
  'authorIdentityId',
  'creatorIdentityId',
  'deletedBy',
  'editedBy',
  'inviteeIdentityId',
  'inviterIdentityId',
  'memberIds',
  'ownerIdentityId',
  'participantIds',
  'recipientIdentityId',
  'requesterIdentityId',
  'senderIdentityId',
  'author_id',
  'creator_id',
  'deleted_by',
  'edited_by',
  'invitee_id',
  'inviter_id',
  'member_ids',
  'owner_id',
  'participant_ids',
  'recipient_id',
  'requester_id',
  'sender_id',
];

export class WebSocketEventHub {
  private readonly clients = new Map<string, Set<WebSocket>>();

  private debug(message: string): void {
    Kernel.logger?.debug(message);
  }

  private broadcast(
    event: DomainEvent,
    message: WebSocketRealtimeMessage,
  ): void {
    const recipients = this.getEventRecipients(event);
    const targetClients =
      recipients.size > 0
        ? [...recipients].map((recipient) => this.clients.get(recipient))
        : this.getNodeWideClients(event);
    const connectedRecipients = targetClients.filter(Boolean).length;

    this.debug(
      `WebSocket domain event "${event.eventName()}" aggregate="${event.aggregateId}" recipients="${[...recipients].join(',')}" connectedRecipients=${connectedRecipients}`,
    );

    for (const identityClients of targetClients) {
      if (!identityClients) {
        continue;
      }

      for (const client of identityClients) {
        this.send(client, message);
      }
    }
  }

  private getEventRecipients(event: DomainEvent): Set<string> {
    const recipients = new Set<string>();

    if (this.isCallSignalEvent(event)) {
      this.collectIdentityValues(
        event.attributes.recipientIdentityId,
        recipients,
      );

      return recipients;
    }

    for (const key of identityAttributeKeys) {
      this.collectIdentityValues(event.attributes[key], recipients);
    }

    if (this.isIdentityEvent(event) || this.isKeychainEvent(event)) {
      recipients.add(event.aggregateId);
    }

    return recipients;
  }

  private getNodeWideClients(event: DomainEvent): Array<Set<WebSocket>> {
    if (!this.isNodeWideEvent(event)) {
      return [];
    }

    return [...this.clients.values()];
  }

  private isIdentityEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('identities.');
  }

  private isKeychainEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('keychains.');
  }

  private isCallSignalEvent(event: DomainEvent): boolean {
    return event.eventName() === 'calls.v1.signal.sent';
  }

  private isNodeWideEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('nodes.');
  }

  private createConversationCallEvents(
    event: DomainEvent,
  ): WebSocketDomainEvent[] {
    const scope = event.attributes.scope as
      | { conversationId?: string; type?: string }
      | undefined;

    if (scope?.type !== 'conversation' || !scope.conversationId) {
      return [];
    }

    const messages = this.createConversationCallEventMessages(event, {
      conversationId: scope.conversationId,
    });

    return messages.map((message) => ({
      aggregate_id: scope.conversationId,
      attributes: {
        message,
        participantIds: event.attributes.participantIds,
      },
      event_id: `${event.eventId}:conversation-call-event:${message.id}`,
      occurred_on: event.occurredOn.getTime(),
      type: 'conversations.v1.call.event.was_recorded',
    }));
  }

  private createConversationCallEventMessages(
    event: DomainEvent,
    scope: { conversationId: string },
  ): Array<Record<string, unknown>> {
    return this.createCallEventMessages(event).map((message) => ({
      ...message,
      conversationId: scope.conversationId,
    }));
  }

  private createCallEventMessages(
    event: DomainEvent,
  ): Array<Record<string, unknown>> {
    const callEventType = this.getCallEventType(event);

    if (!callEventType) {
      return [];
    }

    const callId = String(event.attributes.callId || event.aggregateId);
    const startedAt = Number(
      event.attributes.createdAt || event.occurredOn.getTime(),
    );
    const actorIdentityIds = this.getCallEventActors(event, callEventType);

    return actorIdentityIds.map((actorIdentityId) => {
      const createdAt = this.getCallEventCreatedAt(
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

  private getCallEventCreatedAt(
    event: DomainEvent,
    callEventType: 'declined' | 'ended' | 'missed',
    actorIdentityId: string,
  ): number {
    if (callEventType === 'ended') {
      return Number(event.attributes.endedAt || event.occurredOn.getTime());
    }

    const participant = this.getCallEventParticipant(event, actorIdentityId);

    if (callEventType === 'declined' && participant?.declinedAt) {
      return Number(participant.declinedAt);
    }

    if (callEventType === 'missed' && participant?.missedAt) {
      return Number(participant.missedAt);
    }

    return event.occurredOn.getTime();
  }

  private getCallEventParticipant(
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

  private getCallEventType(
    event: DomainEvent,
  ): 'declined' | 'ended' | 'missed' | undefined {
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

  private getCallEventActors(
    event: DomainEvent,
    callEventType: 'declined' | 'ended' | 'missed',
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

  private collectIdentityValues(value: unknown, recipients: Set<string>): void {
    if (typeof value === 'string' && value.length > 0) {
      recipients.add(value);

      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectIdentityValues(item, recipients);
      }
    }
  }

  private send(client: WebSocket, message: WebSocketRealtimeMessage): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify(message));
  }

  private unregister(identityId: string, client: WebSocket): void {
    const identityClients = this.clients.get(identityId);

    if (!identityClients) {
      return;
    }

    identityClients.delete(client);

    if (identityClients.size === 0) {
      this.clients.delete(identityId);
    }
  }

  public clear(): void {
    this.clients.clear();
  }

  public publish(events: DomainEvent[]): void {
    for (const event of events) {
      this.broadcast(event, {
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      });
      const conversationCallEvents = this.createConversationCallEvents(event);

      for (const conversationCallEvent of conversationCallEvents) {
        this.broadcast(event, {
          event: conversationCallEvent,
          type: 'domain_event',
        });
      }
    }
  }

  public register(identityId: IdentityId, client: WebSocket): void {
    const identityIdValue = identityId.valueOf();
    const identityClients = this.clients.get(identityIdValue) || new Set();

    identityClients.add(client);
    this.clients.set(identityIdValue, identityClients);
    this.debug(
      `WebSocket client registered for identity "${identityIdValue}" connections=${identityClients.size}`,
    );

    client.on('close', () => this.unregister(identityIdValue, client));
    client.on('error', () => this.unregister(identityIdValue, client));
    this.send(client, {
      identityId: identityIdValue,
      type: 'connection_ack',
    });
  }
}

export const webSocketEventHub = new WebSocketEventHub();
