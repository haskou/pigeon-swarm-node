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
