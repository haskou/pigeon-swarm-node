Feature: Get current calls
  As an API consumer
  I want to list my current calls
  So that clients can render active call state

  Scenario: List current calls for a participant
    Given I register an in-memory IPFS network "api-calls-list-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I sign the current calls request
    When I GET current calls
    Then response code is equal to 200
    And response body should contain the current call
