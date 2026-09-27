import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

type Participant = OrbitDBCallDocument['participants'][number];

export default class OrbitDBCallDocumentMerger {
  private compareIds(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  private participantRevision(participant: Participant): number {
    return Math.max(
      participant.joinedAt ?? 0,
      participant.leftAt ?? 0,
      participant.declinedAt ?? 0,
      participant.missedAt ?? 0,
    );
  }

  private compareParticipants(left: Participant, right: Participant): number {
    const revision =
      this.participantRevision(left) - this.participantRevision(right);

    if (revision !== 0) return revision;

    const statuses = ['ringing', 'joined', 'declined', 'missed', 'left'];
    const status =
      statuses.indexOf(left.status) - statuses.indexOf(right.status);

    if (status !== 0) return status;

    for (const field of [
      'joinedAt',
      'leftAt',
      'declinedAt',
      'missedAt',
    ] as const) {
      const difference = (left[field] ?? 0) - (right[field] ?? 0);

      if (difference !== 0) return difference;
    }

    return 0;
  }

  private updatedAt(document: OrbitDBCallDocument): number {
    return document.updatedAt ?? document.createdAt;
  }

  private participants(documents: OrbitDBCallDocument[]): Participant[] {
    const participants = new Map<string, Participant>();

    for (const participant of documents.flatMap(
      (document) => document.participants,
    )) {
      const previous = participants.get(participant.identityId);

      if (!previous || this.compareParticipants(participant, previous) > 0) {
        participants.set(participant.identityId, participant);
      }
    }

    return [...participants.values()].sort((left, right) =>
      this.compareIds(left.identityId, right.identityId),
    );
  }

  private compareEndings(
    left: OrbitDBCallDocument,
    right: OrbitDBCallDocument,
  ): number {
    return (
      (left.endedAt ?? 0) - (right.endedAt ?? 0) ||
      this.compareIds(
        left.endedByIdentityId ?? '',
        right.endedByIdentityId ?? '',
      )
    );
  }

  private compareCalls(
    left: OrbitDBCallDocument,
    right: OrbitDBCallDocument,
  ): number {
    if (left.status !== right.status) {
      const statuses = ['active', 'missed', 'ended'];

      return statuses.indexOf(left.status) - statuses.indexOf(right.status);
    }

    return (
      this.compareEndings(left, right) ||
      this.updatedAt(left) - this.updatedAt(right)
    );
  }

  private sameSession(
    left: OrbitDBCallDocument,
    right: OrbitDBCallDocument,
  ): boolean {
    return (
      left.id === right.id &&
      left.networkId === right.networkId &&
      left.createdAt === right.createdAt &&
      this.sameScope(left, right) &&
      (left.scope.type === 'community_channel' ||
        left.creatorIdentityId === right.creatorIdentityId)
    );
  }

  private sameScope(
    left: OrbitDBCallDocument,
    right: OrbitDBCallDocument,
  ): boolean {
    return (
      left.scope.type === right.scope.type &&
      left.scope.communityId === right.scope.communityId &&
      left.scope.channelId === right.scope.channelId &&
      left.scope.conversationId === right.scope.conversationId
    );
  }

  private sessionKey(document: OrbitDBCallDocument): string {
    const field = (value: unknown): [string, unknown?] =>
      value === undefined ? ['undefined'] : [typeof value, value];

    return JSON.stringify([
      document.id,
      document.networkId,
      document.createdAt,
      document.scope.type,
      field(document.scope.communityId),
      field(document.scope.channelId),
      field(document.scope.conversationId),
      document.scope.type === 'community_channel'
        ? ['community']
        : field(document.creatorIdentityId),
    ]);
  }

  private resolveSessionConflict(
    left: OrbitDBCallDocument,
    right: OrbitDBCallDocument,
  ): OrbitDBCallDocument {
    const selected =
      this.sessionKey(left) <= this.sessionKey(right) ? left : right;

    return this.withoutCommunityParticipation(selected);
  }

  private withoutCommunityParticipation(
    document: OrbitDBCallDocument,
  ): OrbitDBCallDocument {
    if (document.scope.type !== 'community_channel') return document;

    return {
      createdAt: document.createdAt,
      id: document.id,
      networkId: document.networkId,
      scope: document.scope,
      status: document.status,
      ...(document.endedAt === undefined ? {} : { endedAt: document.endedAt }),
      ...(document.updatedAt === undefined
        ? {}
        : { updatedAt: document.updatedAt }),
      ...(document.sessionEpoch === undefined
        ? {}
        : { sessionEpoch: document.sessionEpoch }),
      participantIds: [],
      participants: [],
    };
  }

  public merge(
    current: OrbitDBCallDocument | undefined,
    incoming: OrbitDBCallDocument,
  ): OrbitDBCallDocument {
    if (current && !this.sameSession(current, incoming))
      return this.resolveSessionConflict(current, incoming);
    const base =
      current && this.compareCalls(current, incoming) > 0 ? current : incoming;
    const documents = current ? [current, incoming] : [incoming];

    return this.withoutCommunityParticipation({
      ...base,
      ...(documents.some((document) => document.sessionEpoch !== undefined)
        ? {
            sessionEpoch: Math.max(
              ...documents.map((document) => document.sessionEpoch ?? 0),
            ),
          }
        : {}),
      createdAt: Math.min(...documents.map((document) => document.createdAt)),
      creatorIdentityId: documents
        .map((document) => document.creatorIdentityId)
        .sort()[0],
      participantIds: [
        ...new Set(documents.flatMap((document) => document.participantIds)),
      ].sort(),
      participants: this.participants(documents),
      updatedAt: Math.max(
        ...documents.map((document) => this.updatedAt(document)),
      ),
    });
  }
}
