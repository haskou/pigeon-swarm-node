import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import IdentityRegistrarService from '@app/contexts/identities/domain/services/IdentityRegistrarService';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('RegisterPublishedIdentity', () => {
  let registrarService: MockProxy<IdentityRegistrarService>;
  let registerPublishedIdentity: RegisterPublishedIdentity;
  let mother: IdentityMother;

  beforeEach(() => {
    registrarService = mock<IdentityRegistrarService>();
    registerPublishedIdentity = new RegisterPublishedIdentity(registrarService);
    mother = new IdentityMother();
  });

  it('should register the published identity from the registrar service', async () => {
    const identity = mother.build();
    const message = new RegisterPublishedIdentityMessage(mother.id);

    registrarService.register.mockResolvedValue(identity);

    const result = await registerPublishedIdentity.register(message);

    expect(registrarService.register).toHaveBeenCalledWith(message.identityId);
    expect(result).toEqual(identity);
  });
});
