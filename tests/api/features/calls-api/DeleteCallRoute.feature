Feature: End call
  As an API consumer
  I want to end calls
  So that clients can close active media sessions

  Scenario: End a one-to-one conversation call
    Given I register an in-memory IPFS network "api-calls-end-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | ended |
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should contain "call_event"
    And response body should contain "ended"
