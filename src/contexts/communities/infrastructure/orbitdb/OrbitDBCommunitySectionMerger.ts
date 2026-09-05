import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import { OrbitDBCommunitySectionName } from './documents/OrbitDBCommunitySectionName';
import { OrbitDBCommunitySectionRevisions } from './documents/OrbitDBCommunitySectionRevisions';

const COMMUNITY_SECTION_FIELDS: Record<
  OrbitDBCommunitySectionName,
  readonly string[]
> = {
  bans: ['bannedMemberIds'],
  channels: ['textChannels', 'voiceChannels'],
  members: ['memberIds', 'memberRoles'],
  profile: [
    'autoJoinEnabled',
    'avatar',
    'banner',
    'description',
    'discoverable',
    'name',
    'visibility',
  ],
  roles: ['roles'],
};

const ALL_COMMUNITY_SECTIONS: readonly OrbitDBCommunitySectionName[] = [
  'bans',
  'channels',
  'members',
  'profile',
  'roles',
];

/**
 * Merges replicated community documents section by section.
 *
 * A community is stored as one document, so two nodes writing independent
 * parts of it would otherwise publish whole snapshots whose freshness
 * (updatedAt) decides a single winner and drops the concurrent change. With
 * per-section revisions, each part keeps its own monotonic counter: the merge
 * takes the highest revision of every section, so an unrelated update never
 * revives stale members, bans, roles, or channels.
 */
export default class OrbitDBCommunitySectionMerger {
  private revisionsBumped(
    revisions: Partial<OrbitDBCommunitySectionRevisions>,
    except: readonly OrbitDBCommunitySectionName[],
  ): OrbitDBCommunitySectionRevisions {
    return ALL_COMMUNITY_SECTIONS.reduce<OrbitDBCommunitySectionRevisions>(
      (bumped, section) => ({
        ...bumped,
        [section]: except.includes(section)
          ? (revisions[section] ?? 0)
          : (revisions[section] ?? 0) + 1,
      }),
      {} as OrbitDBCommunitySectionRevisions,
    );
  }

  private writtenRevisions(
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    previous: OrbitDBCommunityDocument | undefined,
  ): OrbitDBCommunitySectionRevisions {
    return ALL_COMMUNITY_SECTIONS.reduce<OrbitDBCommunitySectionRevisions>(
      (revisions, section) => {
        const changed =
          !baseline || !this.sameSectionContent(next, baseline, section);
        const headRevision = this.revisionOf(previous, section);

        return {
          ...revisions,
          [section]: changed
            ? Math.max(this.revisionOf(baseline, section), headRevision) + 1
            : headRevision,
        };
      },
      {} as OrbitDBCommunitySectionRevisions,
    );
  }

  private withWrittenSection(
    merged: OrbitDBCommunityDocument,
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    previous: OrbitDBCommunityDocument | undefined,
    section: OrbitDBCommunitySectionName,
  ): OrbitDBCommunityDocument {
    const unchangedSinceBaseline =
      baseline !== undefined &&
      this.sameSectionContent(next, baseline, section);

    // Untouched sections follow the freshest replicated state, which may be
    // newer than the loaded aggregate.
    const source = unchangedSinceBaseline && previous ? previous : next;

    return COMMUNITY_SECTION_FIELDS[section].reduce(
      (document, field) => {
        if (source[field] === undefined) {
          delete document[field];

          return document;
        }

        return { ...document, [field]: source[field] };
      },
      { ...merged },
    );
  }

  private withSection(
    merged: OrbitDBCommunityDocument,
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
    section: OrbitDBCommunitySectionName,
  ): OrbitDBCommunityDocument {
    const winner = this.sectionWinner(current, candidate, section);
    const source = winner === 'current' ? current : candidate;

    return COMMUNITY_SECTION_FIELDS[section].reduce(
      (document, field) => {
        if (source[field] === undefined) {
          delete document[field];

          return document;
        }

        return { ...document, [field]: source[field] };
      },
      { ...merged },
    );
  }

  private sectionWinner(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
    section: OrbitDBCommunitySectionName,
  ): 'current' | 'candidate' {
    const currentRevision = this.revisionOf(current, section);
    const candidateRevision = this.revisionOf(candidate, section);

    if (currentRevision !== candidateRevision) {
      return currentRevision > candidateRevision ? 'current' : 'candidate';
    }

    if (this.freshness(current) !== this.freshness(candidate)) {
      return this.freshness(current) > this.freshness(candidate)
        ? 'current'
        : 'candidate';
    }

    return this.serializedSection(current, section) <=
      this.serializedSection(candidate, section)
      ? 'current'
      : 'candidate';
  }

  private sameSectionContent(
    left: OrbitDBCommunityDocument,
    right: OrbitDBCommunityDocument,
    section: OrbitDBCommunitySectionName,
  ): boolean {
    return COMMUNITY_SECTION_FIELDS[section].every((field) =>
      this.sameFieldValue(left, right, field),
    );
  }

  private sameFieldValue(
    left: OrbitDBCommunityDocument,
    right: OrbitDBCommunityDocument,
    field: string,
  ): boolean {
    return (
      this.normalizedFieldValue(left[field]) ===
      this.normalizedFieldValue(right[field])
    );
  }

  private normalizedFieldValue(value: unknown): string {
    return JSON.stringify(value ?? null);
  }

  private serializedSection(
    document: OrbitDBCommunityDocument,
    section: OrbitDBCommunitySectionName,
  ): string {
    return COMMUNITY_SECTION_FIELDS[section]
      .map((field) => `${field}:${this.normalizedFieldValue(document[field])}`)
      .join('|');
  }

  private freshness(document: OrbitDBCommunityDocument): number {
    return Math.max(
      document.deletedAt ?? 0,
      document.updatedAt ?? 0,
      document.createdAt,
    );
  }

  private isTombstoned(document: OrbitDBCommunityDocument): boolean {
    return document.deleted === true;
  }

  private freshestTombstone(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument {
    if (this.isTombstoned(current) && this.isTombstoned(candidate)) {
      return this.freshness(current) >= this.freshness(candidate)
        ? current
        : candidate;
    }

    const tombstone = this.isTombstoned(current) ? current : candidate;
    const other = this.isTombstoned(current) ? candidate : current;

    // A tombstone bumps every section revision, so it dominates any section
    // written concurrently against the same previous state.
    if (this.minimumRevision(tombstone) >= this.maximumRevision(other)) {
      return tombstone;
    }

    return this.freshness(current) > this.freshness(candidate)
      ? current
      : candidate;
  }

  private minimumRevision(document: OrbitDBCommunityDocument): number {
    return Math.min(
      ...ALL_COMMUNITY_SECTIONS.map((section) =>
        this.revisionOf(document, section),
      ),
    );
  }

  private maximumRevision(document: OrbitDBCommunityDocument): number {
    return Math.max(
      ...ALL_COMMUNITY_SECTIONS.map((section) =>
        this.revisionOf(document, section),
      ),
    );
  }

  /**
   * Builds the next stored document for a local write.
   *
   * `baseline` is the document the caller loaded the aggregate from; sections
   * untouched since then are carried forward from the freshest known head
   * (`previous`) together with its revision, so a concurrent replica written
   * in another node keeps winning. Only sections the caller actually changed
   * get their revision bumped.
   */
  public nextDocument(
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    previous: OrbitDBCommunityDocument | undefined,
    now: number,
  ): OrbitDBCommunityDocument {
    const updatedAt = Math.max(
      now,
      (previous?.updatedAt ?? -1) + 1,
      next.createdAt,
    );

    if (!previous && !baseline) {
      return {
        ...next,
        sectionRevisions: this.revisionsBumped({}, []),
        updatedAt,
      };
    }

    const document = ALL_COMMUNITY_SECTIONS.reduce(
      (merged, section) =>
        this.withWrittenSection(merged, next, baseline, previous, section),
      { ...next },
    );

    return {
      ...document,
      sectionRevisions: this.writtenRevisions(next, baseline, previous),
      updatedAt,
    };
  }

  /**
   * Builds the tombstone for a deleted community. Every section revision is
   * bumped above the freshest known state so the deletion dominates any
   * concurrently written section.
   */
  public tombstone(
    next: OrbitDBCommunityDocument,
    previous: OrbitDBCommunityDocument | undefined,
    now: number,
  ): OrbitDBCommunityDocument {
    const document = this.nextDocument(next, undefined, previous, now);

    return {
      ...document,
      deleted: true,
      deletedAt: now,
      sectionRevisions: this.revisionsBumped(
        document.sectionRevisions ?? {},
        [],
      ),
      updatedAt: Math.max(now, document.updatedAt),
    };
  }

  /**
   * Combines two replicated documents taking the highest revision of every
   * section. Revision ties are broken by document freshness and then by
   * serialized content so every node converges to the same result regardless
   * of arrival order.
   */
  public merge(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument {
    if (this.isTombstoned(current) || this.isTombstoned(candidate)) {
      return this.freshestTombstone(current, candidate);
    }

    const sections =
      ALL_COMMUNITY_SECTIONS.reduce<OrbitDBCommunitySectionRevisions>(
        (revisions, section) => ({
          ...revisions,
          [section]: Math.max(
            this.revisionOf(current, section),
            this.revisionOf(candidate, section),
          ),
        }),
        {} as OrbitDBCommunitySectionRevisions,
      );

    return ALL_COMMUNITY_SECTIONS.reduce(
      (merged, section) =>
        this.withSection(merged, current, candidate, section),
      {
        ...candidate,
        sectionRevisions: sections,
        updatedAt: Math.max(this.freshness(current), this.freshness(candidate)),
      },
    );
  }

  public revisionOf(
    document: OrbitDBCommunityDocument | undefined,
    section: OrbitDBCommunitySectionName,
  ): number {
    return document?.sectionRevisions?.[section] ?? 0;
  }
}
