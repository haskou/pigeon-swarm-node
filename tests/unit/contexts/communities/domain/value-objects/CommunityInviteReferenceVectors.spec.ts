import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { InvalidCommunityInviteReferenceError } from '@haskou/pigeon-swarm-crypto';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

const { inviteToken } = cryptoVectors<{
  inviteToken: { reference: string; token: string };
}>('community-operation');

describe('community invite reference vectors', () => {
  it('references the shipped invite token', () => {
    expect(new CommunityInviteToken(inviteToken.token).toReference()).toBe(
      inviteToken.reference,
    );
  });

  it.each([
    ['a token that is not base64url', 'not a token'],
    ['a token shorter than 32 bytes', inviteToken.token.slice(0, 42)],
    ['a token longer than 32 bytes', `${inviteToken.token}AA`],
    ['a padded token', `${inviteToken.token}=`],
  ])('refuses %s', (_name, token) => {
    expect(() => new CommunityInviteToken(token).toReference()).toThrow(
      InvalidCommunityInviteReferenceError,
    );
  });
});
