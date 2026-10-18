import CommunityInvitationCreator from '@app/contexts/communities/application/create-invitation/CommunityInvitationCreator';
import { CommunityInvitationCreateMessage } from '@app/contexts/communities/application/create-invitation/messages/CommunityInvitationCreateMessage';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import CommunityModerationLogRepository from '@app/contexts/communities/domain/repositories/CommunityModerationLogRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';
import { readFileSync } from 'node:fs';

interface SharedVectors {
  moderation: {
    cases: {
      derived: {
        body: { createdAt: number; mutation: unknown };
        payload: Record<string, unknown> & { target: unknown };
      };
      input: { action: string; target: { id: string; type: string } };
      name: string;
    }[];
  };
  operations: {
    cases: {
      derived: {
        digest: string;
        payload: Record<string, unknown> & {
          authorIdentityId: string;
          communityId: string;
          createdAt: number;
          networkId: string;
          parents: string[];
        };
        requestOperation: {
          createdAt: number;
          identitySignature: string;
          mutation: unknown;
          parents: string[];
        };
      };
      input: { args: Record<string, unknown> };
      name: string;
    }[];
  };
}

const vectors = {
  moderation: JSON.parse(
    readFileSync(
      require.resolve('@haskou/pigeon-swarm-crypto/vectors/community-moderation-log.json'),
      'utf8',
    ),
  ),
  operations: JSON.parse(
    readFileSync(
      require.resolve('@haskou/pigeon-swarm-crypto/vectors/community-operation.json'),
      'utf8',
    ),
  ),
} as SharedVectors;

const vectorOf = <T extends { name: string }>(list: T[], name: string): T => {
  const found = list.find((vector) => vector.name === name);

  if (found === undefined) {
    throw new Error(`Missing shared vector ${name}`);
  }

  return found;
};

describe('Community invitation creator against shared vectors', () => {
  const genesis = vectorOf(vectors.operations.cases, 'genesis');
  const invitation = vectorOf(vectors.operations.cases, 'invitation_created');
  const log = vectorOf(
    vectors.moderation.cases,
    'invitation_created_names_operation_digest',
  );

  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRepository: MockProxy<CommunityModerationLogRepository>;
  let community: Community;

  beforeEach(() => {
    community = CommunityStateFold.fold([
      CommunityOperation.fromPrimitives(genesis.derived.payload as never),
    ]).community as Community;
    community.pullDomainEvents();

    communityFinder = mock<CommunityFinder>();
    communityFinder.findById.mockResolvedValue(community);
    communityRepository = mock<CommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRepository = mock<CommunityModerationLogRepository>();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(invitation.derived.payload.createdAt);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the invitation under the operation digest the shared vector names', async () => {
    const { derived: operation } = invitation;
    const creator = new CommunityInvitationCreator(
      communityFinder,
      communityRepository,
      eventPublisher,
      new CommunityModerationLogRecorder(moderationLogRepository),
    );
    const message = new CommunityInvitationCreateMessage(
      operation.payload.communityId,
      operation.payload.authorIdentityId,
      invitation.input.args as never,
      log.derived.body as never,
      operation.requestOperation as never,
    );

    const result = await creator.create(message);

    expect(result.invitation.toPrimitives(result.community).id).toBe(
      operation.digest,
    );

    const [entry] = moderationLogRepository.save.mock.calls[0];

    expect(entry.toPrimitives().target).toEqual(log.derived.payload.target);
    expect(entry.toPrimitives().target).toEqual({
      id: operation.digest,
      type: 'invitation',
    });
  });
});
