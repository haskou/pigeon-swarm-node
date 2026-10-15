import { NodeRegistrationCodeRevokerMessage } from '@app/contexts/nodes/application/revoke-registration-code/messages/NodeRegistrationCodeRevokerMessage';
import NodeRegistrationCodeRevoker from '@app/contexts/nodes/application/revoke-registration-code/NodeRegistrationCodeRevoker';
import NodeRegistrationCodeRepository from '@app/contexts/nodes/domain/repositories/NodeRegistrationCodeRepository';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { mock } from 'jest-mock-extended';

describe('NodeRegistrationCodeRevoker', () => {
  it('should remove the code', async () => {
    const repository = mock<NodeRegistrationCodeRepository>();
    const id = NodeRegistrationCodeId.generate();

    await new NodeRegistrationCodeRevoker(repository).revoke(
      new NodeRegistrationCodeRevokerMessage(id.valueOf()),
    );

    expect(repository.remove).toHaveBeenCalledWith(id);
  });
});
