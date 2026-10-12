Feature: Opaque mailbox routes
  As a client
  I want to receive ciphertext envelopes at an unlinkable mailbox
  So that the node never learns who talks to whom

  Background:
    Given I register a test IPFS network "mailboxes-network"

  Scenario: Create, append, page, acknowledge and delete
    When I create a mailbox
    Then response code is equal to 201
    When I create the same mailbox again
    Then response code is equal to 200
    When I create the mailbox again with other capabilities
    Then response code is equal to 409
    When I append an envelope "a" of 1024 bytes to the mailbox with the post capability
    Then response code is equal to 201
    And the mailbox response cursor should be 1
    When I append an envelope "a" of 1024 bytes to the mailbox with the post capability
    Then response code is equal to 200
    And the mailbox response cursor should be 1
    When I append an envelope "b" of 4096 bytes to the mailbox with the post capability
    Then response code is equal to 201
    And the mailbox response cursor should be 2
    When I read the mailbox envelopes after 0 limit 1 with the read capability
    Then response code is equal to 200
    And the mailbox page should hold cursors "1"
    And the mailbox page should report more true
    When I read the mailbox envelopes after 1 limit 10 with the read capability
    Then the mailbox page should hold cursors "2"
    And the mailbox page should report more false
    When I acknowledge the mailbox up to 1 with the read capability
    Then response code is equal to 204
    When I read the mailbox envelopes after 0 limit 10 with the read capability
    Then the mailbox page should hold cursors "2"
    When I delete the mailbox with the read capability
    Then response code is equal to 204
    When I read the mailbox envelopes after 0 limit 10 with the read capability
    Then response code is equal to 404

  Scenario: Wrong, swapped or missing capabilities look like an unknown mailbox
    When I create a mailbox
    And I append an envelope "a" of 1024 bytes to the mailbox with the read capability
    Then response code is equal to 404
    When I append an envelope "a" of 1024 bytes to the mailbox with the none capability
    Then response code is equal to 404
    When I read the mailbox envelopes after 0 limit 10 with the post capability
    Then response code is equal to 404
    When I acknowledge the mailbox up to 1 with the post capability
    Then response code is equal to 404
    When I delete the mailbox with the post capability
    Then response code is equal to 404

  Scenario: Envelopes must match a size bucket
    When I create a mailbox
    And I append an envelope "a" of 1000 bytes to the mailbox with the post capability
    Then response code is equal to 400

  Scenario: Creating a mailbox requires proof of work bound to that mailbox
    When I create a mailbox without proof of work
    Then response code is equal to 400

  Scenario: A short proof of work is refused with the difficulty it needs
    When I create a mailbox with a proof of work below the required difficulty
    Then response code is equal to 400
    And response data should match partially
    """
    {
      "requiredDifficultyBits": 16
    }
    """

  Scenario: A recreated mailbox never reuses a cursor a client may still hold
    When I create a mailbox
    And I append an envelope "a" of 1024 bytes to the mailbox with the post capability
    And I append an envelope "b" of 1024 bytes to the mailbox with the post capability
    When I delete the mailbox with the read capability
    Then response code is equal to 204
    When I create the same mailbox again
    Then response code is equal to 201
    When I append an envelope "c" of 1024 bytes to the mailbox with the post capability
    Then the mailbox response cursor should be greater than 2
    When I read the mailbox envelopes after 2 limit 10 with the read capability
    Then response code is equal to 200
    And the mailbox page should hold only cursors greater than 2

  Scenario: A sender cannot add, list or revoke readers
    When I create a mailbox
    And I create the mailbox again with a new read capability
    Then response code is equal to 409
    When I add a second reader to the mailbox with the post capability
    Then response code is equal to 404
    When I list the mailbox readers with the post capability
    Then response code is equal to 404
    When I revoke the read reader of the mailbox with the post capability
    Then response code is equal to 404

  Scenario: An envelope stays until every reader has acknowledged it
    When I create a mailbox
    And I append an envelope "a" of 1024 bytes to the mailbox with the post capability
    When I add a second reader to the mailbox with the read capability
    Then response code is equal to 201
    When I add a second reader to the mailbox with the read capability
    Then response code is equal to 200
    When I acknowledge the mailbox up to 1 with the read capability
    Then response code is equal to 204
    When I read the mailbox envelopes after 0 limit 10 with the second capability
    Then the mailbox page should hold cursors "1"
    When I acknowledge the mailbox up to 1 with the second capability
    Then response code is equal to 204
    When I read the mailbox envelopes after 0 limit 10 with the read capability
    Then the mailbox page should hold cursors ""

  Scenario: Any reader lists the readers and how far each has acknowledged
    When I create a mailbox
    And I append an envelope "a" of 1024 bytes to the mailbox with the post capability
    And I add a second reader to the mailbox with the read capability
    And I acknowledge the mailbox up to 1 with the read capability
    When I list the mailbox readers with the second capability
    Then response code is equal to 200
    And the mailbox readers should report acked cursors "1,0"

  Scenario: A silent reader can be revoked, but the last reader cannot
    When I create a mailbox
    And I append an envelope "a" of 1024 bytes to the mailbox with the post capability
    And I add a second reader to the mailbox with the read capability
    And I acknowledge the mailbox up to 1 with the read capability
    When I revoke the second reader of the mailbox with the read capability
    Then response code is equal to 204
    When I read the mailbox envelopes after 0 limit 10 with the read capability
    Then the mailbox page should hold cursors ""
    When I read the mailbox envelopes after 0 limit 10 with the second capability
    Then response code is equal to 404
    When I revoke the read reader of the mailbox with the read capability
    Then response code is equal to 409
