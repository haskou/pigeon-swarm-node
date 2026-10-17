import { CommunityRoleBody } from '@app/apps/apis/communities-api/bodies/CommunityRoleBody';
import { DeleteCommunityBanBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityBanBody';
import { DeleteCommunityChannelBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityChannelBody';
import { DeleteCommunityMemberBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityMemberBody';
import { DeleteCommunityMemberByIdBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityMemberByIdBody';
import { DeleteCommunityRoleBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityRoleBody';
import { PatchCommunityBody } from '@app/apps/apis/communities-api/bodies/PatchCommunityBody';
import { PatchCommunityChannelBody } from '@app/apps/apis/communities-api/bodies/PatchCommunityChannelBody';
import { PatchCommunityChannelPermissionsBody } from '@app/apps/apis/communities-api/bodies/PatchCommunityChannelPermissionsBody';
import { PostCommunityBanBody } from '@app/apps/apis/communities-api/bodies/PostCommunityBanBody';
import { PostCommunityBody } from '@app/apps/apis/communities-api/bodies/PostCommunityBody';
import { PostCommunityChannelBody } from '@app/apps/apis/communities-api/bodies/PostCommunityChannelBody';
import { PutCommunityMemberRolesBody } from '@app/apps/apis/communities-api/bodies/PutCommunityMemberRolesBody';
import { PostConversationBody } from '@app/apps/apis/conversations-api/bodies/PostConversationBody';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

type BodyClass = new () => object;

const operationCases: [string, BodyClass, string[]][] = [
  ['PostConversationBody', PostConversationBody, ['operation']],
  ['PostCommunityBody', PostCommunityBody, ['operation']],
  ['DeleteCommunityMemberBody', DeleteCommunityMemberBody, ['operation']],
  [
    'DeleteCommunityMemberByIdBody',
    DeleteCommunityMemberByIdBody,
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
    'PostCommunityChannelBody',
    PostCommunityChannelBody,
    ['operation', 'moderationLog', 'type'],
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

  it('rejects a community channel of an unknown type', async () => {
    const errors = await validate(
      plainToInstance(PostCommunityChannelBody, {
        moderationLog: {},
        name: 'general',
        operation: {},
        type: 'stage',
      }),
    );

    expect(errors.map((error) => error.property)).toContain('type');
  });

  it('rejects a conversation operation missing its mutation', async () => {
    const errors = await validate(
      plainToInstance(PostConversationBody, {
        keychainExternalIdentifier: 'keychain',
        networkId: 'network',
        operation: { createdAt: 1, parents: [] },
        participantIds: ['participant'],
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(['operation']);
  });

  it('accepts a well-formed conversation operation', async () => {
    const errors = await validate(
      plainToInstance(PostConversationBody, {
        keychainExternalIdentifier: 'keychain',
        networkId: 'network',
        operation: { createdAt: 1, mutation: {}, parents: [] },
        participantIds: ['participant'],
      }),
    );

    expect(errors).toHaveLength(0);
  });
});
