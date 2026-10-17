Feature: End call
  As an API consumer
  I want to end calls
  So that clients can close active media sessions

  Scenario: End a group call
    Given I register a test IPFS network "api-calls-end-network"
    And I have published a keychain for the authenticated identity
    And I set a group capability call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | ended |

  Scenario: Reject ending a call without a signed mutation
    Given I register a test IPFS network "api-calls-unsigned-end-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And call requests are sent without a mutation
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 400
