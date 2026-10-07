import { CallViewModel } from '@app/apps/apis/calls-api/view-model/CallViewModel';
import CallEventAttestor from '@app/contexts/calls/application/attest-event/CallEventAttestor';
import { CallEventAttestation } from '@app/contexts/calls/domain/CallEventAttestation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { randomUUID } from 'node:crypto';
import { RawData, WebSocket } from 'ws';

import { CallRealtimeAudience } from './CallRealtimeAudience';
import { ConversationCallEventRealtimeMapper } from './ConversationCallEventRealtimeMapper';
import { WebSocketClientMessage } from './WebSocketClientMessage';
import WebSocketClientMessageHandler from './WebSocketClientMessageHandler';
import { WebSocketRealtimeMessage } from './WebSocketRealtimeMessage';

const identityAttributeKeys = [
  'authorIdentityId',
  'creatorIdentityId',
  'deletedBy',
  'editedBy',
  'identityId',
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
  'identity_id',
  'invitee_id',
  'inviter_id',
  'member_ids',
  'owner_id',
  'participant_ids',
  'recipient_id',
  'requester_id',
  'sender_id',
];

const MAX_CLIENTS_PER_IDENTITY = 16;
const MAX_CLIENT_MESSAGES_PER_WINDOW = 200;
const CLIENT_MESSAGE_WINDOW_MS = 10_000;

export class WebSocketEventHub {
  private readonly conversationCallEventMapper =
    new ConversationCallEventRealtimeMapper();

  private clientMessageHandler?: WebSocketClientMessageHandler;

  private callEventAttestor?: CallEventAttestor;

  private liveCallRevision = 0;

  private readonly pendingCalls = new Map<string, Promise<void>>();

  private readonly clients = new Map<string, Set<WebSocket>>();
  private readonly messageWindows = new WeakMap<
    WebSocket,
    { count: number; resetAt: number }
  >();

  private networkSynchronizationStatusProvider?: () => unknown;

  private broadcast(
    event: DomainEvent,
    message: WebSocketRealtimeMessage,
  ): void {
    const recipients = this.getEventRecipients(event);
    const targetClients =
      recipients.size > 0
        ? [...recipients].map((recipient) => this.clients.get(recipient))
        : this.getNodeWideClients(event);

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

    if (this.shouldSuppressCallParticipantLeaseEvent(event)) {
      return recipients;
    }

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

  private isIdentityUpdateEvent(event: DomainEvent): boolean {
    return event.eventName() === 'identities.v1.identity.was_updated';
  }

  private isKeychainEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('keychains.');
  }

  private isCallSignalEvent(event: DomainEvent): boolean {
    return event.eventName() === 'calls.v1.signal.sent';
  }

  private isCallParticipantLeaseEvent(event: DomainEvent): boolean {
    return event.eventName() === 'calls.v1.participant_lease.was_updated';
  }

  private shouldSuppressCallParticipantLeaseEvent(event: DomainEvent): boolean {
    if (!this.isCallParticipantLeaseEvent(event)) {
      return false;
    }

    return ![
      event.attributes.connectionChanged,
      event.attributes.participantsChanged,
    ].includes(true);
  }

  private isCallSignalAcknowledgementEvent(event: DomainEvent): boolean {
    return event.eventName() === 'calls.v1.signal.acknowledged';
  }

  private isNodeWideEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('nodes.');
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

  private isOverMessageRate(client: WebSocket): boolean {
    const now = Date.now();
    const current = this.messageWindows.get(client);
    const window =
      current && current.resetAt > now
        ? { count: current.count + 1, resetAt: current.resetAt }
        : { count: 1, resetAt: now + CLIENT_MESSAGE_WINDOW_MS };

    this.messageWindows.set(client, window);

    return window.count > MAX_CLIENT_MESSAGES_PER_WINDOW;
  }

  private handleClientMessage(
    identityId: string,
    client: WebSocket,
    rawMessage: RawData,
  ): void {
    if (this.isOverMessageRate(client)) {
      client.close(1008, 'Message rate exceeded');

      return;
    }

    const message = this.parseClientMessage(rawMessage);

    if (!message) {
      return;
    }

    if (message.type === 'typing') {
      this.relayTypingIndicator(identityId, message).catch(() => {
        Kernel.logger?.error('WebSocket typing indicator failed');
      });

      return;
    }

    if (message.type === 'call_signal_ack') {
      this.acknowledgeCallSignal(identityId, message).catch(() => {
        Kernel.logger?.error('WebSocket call signal acknowledgement failed');
      });

      return;
    }

    if (message.type !== 'identity_heartbeat') {
      return;
    }

    this.recordIdentityHeartbeat(identityId, Boolean(message.active)).catch(
      () => {
        Kernel.logger?.error('WebSocket identity heartbeat failed');
      },
    );
    this.send(client, {
      identityId,
      timestamp: Date.now(),
      type: 'heartbeat_ack',
    });
  }

  private async relayTypingIndicator(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (message.scope === 'conversation') {
      await this.relayConversationTypingIndicator(identityId, message);

      return;
    }

    if (message.scope === 'community_channel') {
      await this.relayCommunityChannelTypingIndicator(identityId, message);
    }
  }

  private async relayConversationTypingIndicator(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (typeof message.conversationId !== 'string') {
      return;
    }

    const recipients = await this.findConversationTypingRecipients(
      identityId,
      message.conversationId,
    );

    this.sendToRecipients(recipients, {
      active: Boolean(message.active),
      conversationId: message.conversationId,
      identityId,
      scope: 'conversation',
      timestamp: Date.now(),
      type: 'typing',
    });
  }

  private async relayCommunityChannelTypingIndicator(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (
      typeof message.communityId !== 'string' ||
      typeof message.channelId !== 'string'
    ) {
      return;
    }

    const recipients = await this.findCommunityChannelTypingRecipients(
      identityId,
      message.communityId,
      message.channelId,
    );

    this.sendToRecipients(recipients, {
      active: Boolean(message.active),
      channelId: message.channelId,
      communityId: message.communityId,
      identityId,
      scope: 'community_channel',
      timestamp: Date.now(),
      type: 'typing',
    });
  }

  private async findConversationTypingRecipients(
    identityId: string,
    conversationId: string,
  ): Promise<string[]> {
    return (
      (await this.clientMessageHandler?.findConversationTypingRecipients(
        identityId,
        conversationId,
      )) || []
    );
  }

  private async findCommunityChannelTypingRecipients(
    identityId: string,
    communityId: string,
    channelId: string,
  ): Promise<string[]> {
    return (
      (await this.clientMessageHandler?.findCommunityChannelTypingRecipients(
        identityId,
        communityId,
        channelId,
      )) || []
    );
  }

  private communityChannelPollScope(
    event: DomainEvent,
  ): { channelId: string; communityId: string } | undefined {
    const poll = event.attributes.poll;

    if (typeof poll !== 'object' || poll === null) {
      return undefined;
    }

    const scope = (poll as { scope?: unknown }).scope;

    if (typeof scope !== 'object' || scope === null) {
      return undefined;
    }

    const { channelId, communityId, type } = scope as {
      channelId?: unknown;
      communityId?: unknown;
      type?: unknown;
    };

    if (
      type !== 'community_channel' ||
      typeof communityId !== 'string' ||
      typeof channelId !== 'string'
    ) {
      return undefined;
    }

    return { channelId, communityId };
  }

  private async relayCommunityPollEventToRecipients(
    event: DomainEvent,
    message: WebSocketRealtimeMessage,
  ): Promise<void> {
    if (!event.eventName().startsWith('polls.')) {
      return;
    }

    const scope = this.communityChannelPollScope(event);

    if (!scope) {
      return;
    }

    const baseRecipients = this.getEventRecipients(event);
    const recipients = (
      (await this.clientMessageHandler?.findCommunityChannelEventRecipients(
        scope.communityId,
        scope.channelId,
      )) || []
    ).filter((recipient) => !baseRecipients.has(recipient));

    this.sendToRecipients(recipients, message);
  }

  private async relayIdentityUpdateToRelatedRecipients(
    event: DomainEvent,
    message: WebSocketRealtimeMessage,
  ): Promise<void> {
    if (!this.isIdentityUpdateEvent(event)) {
      return;
    }

    const baseRecipients = this.getEventRecipients(event);
    const relatedRecipients = await this.findIdentityUpdateRecipients(
      event.aggregateId,
    );
    const recipients = relatedRecipients.filter(
      (recipient) => !baseRecipients.has(recipient),
    );

    this.sendToRecipients(recipients, message);
  }

  private async findIdentityUpdateRecipients(
    identityId: string,
  ): Promise<string[]> {
    return (
      (await this.clientMessageHandler?.findIdentityUpdateRecipients(
        identityId,
      )) || []
    );
  }

  private sendToRecipients(
    recipients: string[],
    message: WebSocketRealtimeMessage,
  ): void {
    for (const recipient of recipients) {
      const recipientClients = this.clients.get(recipient);

      if (!recipientClients) {
        continue;
      }

      for (const recipientClient of recipientClients) {
        this.send(recipientClient, message);
      }
    }
  }

  private async recordIdentityHeartbeat(
    identityId: string,
    active: boolean,
  ): Promise<void> {
    await this.clientMessageHandler?.recordIdentityHeartbeat(
      identityId,
      active,
    );
  }

  private async acknowledgeCallSignal(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (typeof message.signalId !== 'string') {
      return;
    }

    await this.clientMessageHandler?.acknowledgeCallSignal(
      identityId,
      message.signalId,
    );
  }

  private parseClientMessage(
    rawMessage: RawData,
  ): WebSocketClientMessage | undefined {
    try {
      const parsedMessage: unknown = JSON.parse(rawMessage.toString());

      if (!this.isRecord(parsedMessage)) {
        return undefined;
      }

      return this.toClientMessage(parsedMessage);
    } catch {
      return undefined;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toClientMessage(
    message: Record<string, unknown>,
  ): WebSocketClientMessage | undefined {
    switch (message.type) {
      case 'call_signal_ack':
        return {
          signalId: this.optionalString(message.signalId),
          type: message.type,
        };
      case 'identity_heartbeat':
        return {
          active: this.optionalBoolean(message.active),
          type: message.type,
        };
      case 'typing':
        return {
          active: this.optionalBoolean(message.active),
          channelId: this.optionalString(message.channelId),
          communityId: this.optionalString(message.communityId),
          conversationId: this.optionalString(message.conversationId),
          scope: this.optionalString(message.scope),
          type: message.type,
        };
      default:
        return undefined;
    }
  }

  private optionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
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

  private async refreshCallsAfterScopeChange(
    event: DomainEvent,
  ): Promise<void> {
    if (
      ![
        'communities.v1.community.was_updated',
        'communities.v1.member.was_left',
        'communities.v1.member.was_added',
        'communities.v1.channel.was_deleted',
      ].includes(event.eventName())
    )
      return;
    const communityId =
      typeof event.attributes.communityId === 'string'
        ? event.attributes.communityId
        : event.aggregateId;
    const calls =
      (await this.clientMessageHandler?.findActiveCommunityCalls(
        communityId,
      )) ?? [];
    for (const call of calls) {
      this.publishCallSnapshot(call.getId().valueOf());
    }
  }

  private enqueueCallDelivery(
    callId: string,
    deliver: () => Promise<void>,
  ): void {
    const previous = this.pendingCalls.get(callId) ?? Promise.resolve();
    const pending = previous
      .then(deliver)
      .catch(() => {
        Kernel.logger?.error('WebSocket call fanout failed');
      })
      .finally(() => {
        if (this.pendingCalls.get(callId) === pending)
          this.pendingCalls.delete(callId);
      });

    this.pendingCalls.set(callId, pending);
  }

  private canDeliverCallSignal(
    event: DomainEvent,
    audience: CallRealtimeAudience,
    recipients: string[],
  ): boolean {
    if (!this.isCallSignalEvent(event)) return true;
    const sender = event.attributes.senderIdentityId;

    return (
      typeof sender === 'string' &&
      audience.recipientIds.includes(sender) &&
      audience.call.isActive() &&
      audience.call.hasJoinedParticipant(new IdentityId(sender)) &&
      audience.call
        .getActiveParticipants()
        .some((participant) =>
          recipients.includes(participant.getIdentityId().valueOf()),
        )
    );
  }

  private callAuthorizationCandidates(
    event: DomainEvent,
    candidates: string[],
  ): string[] {
    if (!this.isCallSignalEvent(event)) return candidates;
    const sender = event.attributes.senderIdentityId;

    return typeof sender === 'string'
      ? [...new Set([...candidates, sender])]
      : candidates;
  }

  private callEventCandidates(event: DomainEvent): string[] {
    if (!this.isCallSignalEvent(event)) return [...this.clients.keys()];

    return [...this.getEventRecipients(event)].filter((identityId) =>
      this.clients.has(identityId),
    );
  }

  private enqueueCallEvent(event: DomainEvent): void {
    if (this.shouldSuppressCallParticipantLeaseEvent(event)) return;

    const callId = event.attributes.callId;

    if (typeof callId !== 'string') return;

    this.enqueueCallDelivery(callId, async () => {
      const candidates = this.callEventCandidates(event);

      if (candidates.length === 0) return;
      const checks = this.callAuthorizationCandidates(event, candidates);
      const audience = await this.clientMessageHandler?.findCallAudience(
        callId,
        checks,
      );

      if (!audience) return;
      const recipients = audience.recipientIds.filter((identityId) =>
        candidates.includes(identityId),
      );

      if (recipients.length === 0) return;

      if (!this.canDeliverCallSignal(event, audience, recipients)) return;

      const decoded = JSON.parse(event.decode());
      const attributes = this.isCallSignalEvent(event)
        ? Object.fromEntries(
            [
              'attempt',
              'callId',
              'expiresAt',
              'payload',
              'recipientIdentityId',
              'senderIdentityId',
              'sentAt',
              'signalId',
              'signalType',
            ].map((key) => [key, event.attributes[key]]),
          )
        : {
            callId,
            liveCall: new CallViewModel(
              audience.call,
              audience.leases,
              audience.participants,
            ).toResource(),
            liveCallRevision: ++this.liveCallRevision,
          };
      this.sendToRecipients(recipients, {
        event: { ...decoded, aggregate_id: callId, attributes },
        type: 'domain_event',
      });
      for (const timelineEvent of this.conversationCallEventMapper.toEvents(
        event,
      )) {
        this.sendToRecipients(recipients, {
          event: timelineEvent,
          type: 'domain_event',
        });
      }
    });
  }

  public clear(): void {
    this.clients.clear();
  }

  public setCallEventAttestor(attestor: CallEventAttestor): void {
    this.callEventAttestor = attestor;
  }

  public setClientMessageHandler(handler: WebSocketClientMessageHandler): void {
    this.clientMessageHandler = handler;
  }

  public setNetworkSynchronizationStatusProvider(
    provider: () => unknown,
  ): void {
    this.networkSynchronizationStatusProvider = provider;
  }

  public publishNetworkSynchronizationStatus(status: unknown): void {
    for (const identityClients of this.clients.values()) {
      for (const client of identityClients) {
        this.send(client, {
          status,
          type: 'network_synchronization_status',
        });
      }
    }
  }

  public publishCallSnapshot(callId: string): void {
    this.enqueueCallDelivery(callId, async () => {
      const candidates = [...this.clients.keys()];

      if (candidates.length === 0) return;
      const audience = await this.clientMessageHandler?.findCallAudience(
        callId,
        candidates,
      );

      if (!audience || audience.recipientIds.length === 0) return;
      this.sendToRecipients(audience.recipientIds, {
        event: {
          aggregate_id: callId,
          attributes: {
            callId,
            liveCall: new CallViewModel(
              audience.call,
              audience.leases,
              audience.participants,
            ).toResource(),
            liveCallRevision: ++this.liveCallRevision,
          },
          event_id: randomUUID(),
          occurred_on: Date.now(),
          type: 'calls.v1.call.snapshot_changed',
        },
        type: 'domain_event',
      });
    });
  }

  /**
   * Events that arrived from the network. Call lifecycle events are claims by
   * other nodes and reach clients only once this node's own admitted signed
   * records derive the same transition.
   */
  public publishFromNetwork(events: DomainEvent[]): void {
    for (const event of events) {
      if (!CallEventAttestation.isLifecycleEvent(event)) {
        this.publish([event]);
        continue;
      }

      void this.callEventAttestor
        ?.attest(event)
        .then((attested) => attested && this.publish([attested]))
        .catch(() => {
          Kernel.logger?.error('WebSocket call event attestation failed');
        });
    }
  }

  public publish(events: DomainEvent[]): void {
    for (const event of events) {
      if (this.isCallSignalAcknowledgementEvent(event)) {
        continue;
      }

      if (event.eventName().startsWith('calls.')) {
        this.enqueueCallEvent(event);
        continue;
      }

      const domainEventMessage: WebSocketRealtimeMessage = {
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      };

      this.broadcast(event, domainEventMessage);
      void this.refreshCallsAfterScopeChange(event).catch(() => {
        Kernel.logger?.error('WebSocket call scope refresh failed');
      });
      this.relayIdentityUpdateToRelatedRecipients(
        event,
        domainEventMessage,
      ).catch(() => {
        Kernel.logger?.error('WebSocket identity update fanout failed');
      });
      this.relayCommunityPollEventToRecipients(event, domainEventMessage).catch(
        () => {
          Kernel.logger?.error('WebSocket community poll fanout failed');
        },
      );
      const conversationCallEvents =
        this.conversationCallEventMapper.toEvents(event);

      for (const conversationCallEvent of conversationCallEvents) {
        this.broadcast(event, {
          event: conversationCallEvent,
          type: 'domain_event',
        });
      }
    }
  }

  public getOpenSocketCount(): number {
    let total = 0;

    this.clients.forEach((identityClients) => {
      total += identityClients.size;
    });

    return total;
  }

  public register(identityId: IdentityId, client: WebSocket): void {
    const identityIdValue = identityId.valueOf();
    const identityClients = this.clients.get(identityIdValue) || new Set();

    if (identityClients.size >= MAX_CLIENTS_PER_IDENTITY) {
      const [oldest] = identityClients;

      identityClients.delete(oldest);
      oldest.terminate();
    }

    identityClients.add(client);
    this.clients.set(identityIdValue, identityClients);

    client.on('close', () => this.unregister(identityIdValue, client));
    client.on('error', () => this.unregister(identityIdValue, client));
    client.on('message', (message) =>
      this.handleClientMessage(identityIdValue, client, message),
    );
    this.send(client, {
      identityId: identityIdValue,
      type: 'connection_ack',
    });

    if (this.networkSynchronizationStatusProvider) {
      this.send(client, {
        status: this.networkSynchronizationStatusProvider(),
        type: 'network_synchronization_status',
      });
    }
  }
}

export const webSocketEventHub = new WebSocketEventHub();
