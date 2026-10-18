Feature: Get call history
  As an API consumer
  I want to list my call history
  So that clients can render past calls

  Scenario: List ended calls for a participant
    Given I register a test IPFS network "api-calls-history-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 200
    And I sign the current call history request
    When I GET current call history
    Then response code is equal to 200
    And response body should contain the current call

  Scenario: A garbage or foreign call history cursor is refused
    Given I register a test IPFS network "api-calls-history-cursor-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current call history request
    When I GET "/past-calls?limit=1&cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current call history request
    When I GET "/past-calls?limit=1" with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A current calls cursor is refused by the call history list
    Given I register a test IPFS network "api-calls-history-cross-list-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I sign the current calls request
    When I GET "/calls?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    Given I sign the current call history request
    When I GET "/past-calls?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A call history cursor is refused by the current calls list
    Given I register a test IPFS network "api-calls-history-reverse-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 200
    And I sign the current call history request
    When I GET "/past-calls?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    Given I sign the current calls request
    When I GET "/calls?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 400
    And response body should contain "400110"
