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

  public merge(
    current: OrbitDBCallDocument | undefined,
    incoming: OrbitDBCallDocument,
  ): OrbitDBCallDocument {
    const base =
      current && this.compareCalls(current, incoming) > 0 ? current : incoming;
    const documents = current ? [current, incoming] : [incoming];

    return {
      ...base,
      participantIds: [
        ...new Set(documents.flatMap((document) => document.participantIds)),
      ].sort(),
      participants: this.participants(documents),
      updatedAt: Math.max(
        ...documents.map((document) => this.updatedAt(document)),
      ),
    };
  }
}
