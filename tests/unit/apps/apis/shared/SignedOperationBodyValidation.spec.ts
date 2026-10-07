import { CommunityRoleBody } from '@app/apps/apis/communities-api/bodies/CommunityRoleBody';
import { DeleteCommunityBanBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityBanBody';
import { DeleteCommunityChannelBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityChannelBody';
import { DeleteCommunityMemberBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityMemberBody';
import { DeleteCommunityMemberKickBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityMemberKickBody';
import { DeleteCommunityRoleBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityRoleBody';
import { PatchCommunityBody } from '@app/apps/apis/communities-api/bodies/PatchCommunityBody';
import { PatchCommunityChannelBody } from '@app/apps/apis/communities-api/bodies/PatchCommunityChannelBody';
import { PatchCommunityChannelPermissionsBody } from '@app/apps/apis/communities-api/bodies/PatchCommunityChannelPermissionsBody';
import { PostCommunityBanBody } from '@app/apps/apis/communities-api/bodies/PostCommunityBanBody';
import { PostCommunityBody } from '@app/apps/apis/communities-api/bodies/PostCommunityBody';
import { PostCommunityInviteAcceptBody } from '@app/apps/apis/communities-api/bodies/PostCommunityInviteAcceptBody';
import { PostCommunityTextChannelBody } from '@app/apps/apis/communities-api/bodies/PostCommunityTextChannelBody';
import { PostCommunityVoiceChannelBody } from '@app/apps/apis/communities-api/bodies/PostCommunityVoiceChannelBody';
import { PutCommunityMemberRolesBody } from '@app/apps/apis/communities-api/bodies/PutCommunityMemberRolesBody';
import { ConversationSignedOperationBody } from '@app/apps/apis/conversations-api/bodies/ConversationSignedOperationBody';
import { PostConversationBody } from '@app/apps/apis/conversations-api/bodies/PostConversationBody';
import { PostConversationMemberBody } from '@app/apps/apis/conversations-api/bodies/PostConversationMemberBody';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

type BodyClass = new () => object;

const operationCases: [string, BodyClass, string[]][] = [
  ['PostConversationMemberBody', PostConversationMemberBody, ['operation']],
  [
    'ConversationSignedOperationBody',
    ConversationSignedOperationBody,
    ['operation'],
  ],
  ['PostConversationBody', PostConversationBody, ['operation']],
  ['PostCommunityBody', PostCommunityBody, ['operation']],
  [
    'PostCommunityInviteAcceptBody',
    PostCommunityInviteAcceptBody,
    ['operation'],
  ],
  ['DeleteCommunityMemberBody', DeleteCommunityMemberBody, ['operation']],
  [
    'DeleteCommunityMemberKickBody',
    DeleteCommunityMemberKickBody,
    ['operation', 'moderationLog'],
  ],
  [
    'DeleteCommunityRoleBody',
    DeleteCommunityRoleBody,
    ['operation', 'moderationLog'],
  ],
  [
    'DeleteCommunityBanBody',
    DeleteCommunityBanBody,
    ['operation', 'moderationLog'],
  ],
  [
    'DeleteCommunityChannelBody',
    DeleteCommunityChannelBody,
    ['operation', 'moderationLog'],
  ],
  ['CommunityRoleBody', CommunityRoleBody, ['operation', 'moderationLog']],
  ['PatchCommunityBody', PatchCommunityBody, ['operation', 'moderationLog']],
  [
    'PatchCommunityChannelBody',
    PatchCommunityChannelBody,
    ['operation', 'moderationLog'],
  ],
  [
    'PatchCommunityChannelPermissionsBody',
    PatchCommunityChannelPermissionsBody,
    ['operation', 'moderationLog'],
  ],
  [
    'PostCommunityBanBody',
    PostCommunityBanBody,
    ['operation', 'moderationLog'],
  ],
  [
    'PostCommunityTextChannelBody',
    PostCommunityTextChannelBody,
    ['operation', 'moderationLog'],
  ],
  [
    'PostCommunityVoiceChannelBody',
    PostCommunityVoiceChannelBody,
    ['operation', 'moderationLog'],
  ],
  [
    'PutCommunityMemberRolesBody',
    PutCommunityMemberRolesBody,
    ['operation', 'moderationLog'],
  ],
];

describe('Signed operation body validation', () => {
  it.each(operationCases)(
    '%s rejects an empty body naming the missing signed fields',
    async (_name, bodyClass, properties) => {
      const errors = await validate(plainToInstance(bodyClass, {}));
      const failing = errors.map((error) => error.property);

      for (const property of properties) {
        expect(failing).toContain(property);
      }
    },
  );

  it.each(operationCases.filter(([, , properties]) => properties.length))(
    '%s rejects a non-object signed operation',
    async (_name, bodyClass) => {
      const errors = await validate(
        plainToInstance(bodyClass, { operation: 'signed' }),
      );

      expect(errors.map((error) => error.property)).toContain('operation');
    },
  );

  it('rejects a conversation operation missing its mutation', async () => {
    const errors = await validate(
      plainToInstance(ConversationSignedOperationBody, {
        operation: { createdAt: 1, parents: [] },
      }),
    );

    expect(errors.map((error) => error.property)).toContain('operation');
  });

  it('accepts a well-formed conversation operation', async () => {
    const errors = await validate(
      plainToInstance(ConversationSignedOperationBody, {
        operation: { createdAt: 1, mutation: {}, parents: [] },
      }),
    );

    expect(errors).toHaveLength(0);
  });
});
