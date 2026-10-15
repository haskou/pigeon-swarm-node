import { NodeRegistrationAdmitterMessage } from '@app/contexts/nodes/application/admit-registration/messages/NodeRegistrationAdmitterMessage';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationCodeIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationIsClosedError } from '@app/contexts/nodes/domain/errors/NodeRegistrationIsClosedError';
import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import NodeRegistrationCodeRepository from '@app/contexts/nodes/domain/repositories/NodeRegistrationCodeRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import { Integer, Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeRegistrationAdmitter', () => {
  const secret = NodeRegistrationCodeSecret.generate();
  let nodeRepository: MockProxy<NodeRepository>;
  let repository: MockProxy<NodeRegistrationCodeRepository>;
  let admitter: NodeRegistrationAdmitter;

  const givenMode = (mode: NodeRegistrationMode): void => {
    nodeRepository.loadLocalNodeRegistrationMode.mockResolvedValue(mode);
  };

  const issueCode = (): NodeRegistrationCode =>
    NodeRegistrationCode.issue(
      secret,
      new Integer(1),
      Timestamp.now().addDays(1),
      new NodeRegistrationCodeLimits(100, 30),
      Timestamp.now(),
    );

  beforeEach(() => {
    nodeRepository = mock<NodeRepository>();
    repository = mock<NodeRegistrationCodeRepository>();
    admitter = new NodeRegistrationAdmitter(nodeRepository, repository);
  });

  it('should admit a creation on an open node without reserving anything', async () => {
    givenMode(NodeRegistrationMode.OPEN);

    const reservation = await admitter.admit(
      new NodeRegistrationAdmitterMessage(true),
    );

    expect(reservation.codeId).toBeUndefined();
    expect(repository.reserveUse).not.toHaveBeenCalled();
  });

  it('should never gate anything but a creation', async () => {
    givenMode(NodeRegistrationMode.CLOSED);

    await expect(
      admitter.admit(new NodeRegistrationAdmitterMessage(false)),
    ).resolves.toEqual(NodeRegistrationReservation.none());
    expect(nodeRepository.loadLocalNodeRegistrationMode).not.toHaveBeenCalled();
  });

  it('should refuse a creation on a closed node', async () => {
    givenMode(NodeRegistrationMode.CLOSED);

    await expect(
      admitter.admit(
        new NodeRegistrationAdmitterMessage(true, secret.valueOf()),
      ),
    ).rejects.toThrow(NodeRegistrationIsClosedError);
  });

  it.each([undefined, ''])(
    'should refuse a creation without a code in codes mode (%p)',
    async (code) => {
      givenMode(NodeRegistrationMode.CODES);

      await expect(
        admitter.admit(new NodeRegistrationAdmitterMessage(true, code)),
      ).rejects.toThrow(NodeRegistrationCodeIsNotValidError);
      expect(repository.reserveUse).not.toHaveBeenCalled();
    },
  );

  it('should refuse a code the repository cannot reserve', async () => {
    givenMode(NodeRegistrationMode.CODES);
    repository.reserveUse.mockResolvedValue(undefined);

    await expect(
      admitter.admit(
        new NodeRegistrationAdmitterMessage(true, secret.valueOf()),
      ),
    ).rejects.toThrow(NodeRegistrationCodeIsNotValidError);
    expect(repository.reserveUse).toHaveBeenCalledWith(
      secret.hash(),
      expect.anything(),
    );
  });

  it('should reserve a use of a valid code and release it', async () => {
    const code = issueCode();

    givenMode(NodeRegistrationMode.CODES);
    repository.reserveUse.mockResolvedValue(code);

    const reservation = await admitter.admit(
      new NodeRegistrationAdmitterMessage(true, secret.valueOf()),
    );
    await admitter.release(reservation);

    expect(reservation.codeId).toEqual(code.getId());
    expect(repository.releaseUse).toHaveBeenCalledWith(code.getId());
  });

  it('should release nothing for an empty reservation', async () => {
    await admitter.release(NodeRegistrationReservation.none());

    expect(repository.releaseUse).not.toHaveBeenCalled();
  });
});
