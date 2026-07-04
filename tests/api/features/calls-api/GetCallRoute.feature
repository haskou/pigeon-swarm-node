Feature: Get call
  As an API consumer
  I want to inspect one call
  So that clients can render call details

  Scenario: Get a conversation call by id
    Given I register a private IPFS network "api-calls-get-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I sign the current call request
    When I GET the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active       |
      | scope.type | conversation |
