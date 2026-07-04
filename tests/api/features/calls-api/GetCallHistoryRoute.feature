Feature: Get call history
  As an API consumer
  I want to list my call history
  So that clients can render past calls

  Scenario: List ended calls for a participant
    Given I register a test IPFS network "api-calls-history-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 200
    And I sign the current call history request
    When I GET current call history
    Then response code is equal to 200
    And response body should contain the current call
