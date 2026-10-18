Feature: Get current calls
  As an API consumer
  I want to list my current calls
  So that clients can render active call state

  Scenario: List current calls for a participant
    Given I register a test IPFS network "api-calls-list-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current calls request
    When I GET current calls
    Then response code is equal to 200
    And response body should contain the current call

  Scenario: A trailing slash names no route
    Given I am an anonymous user
    When I GET "/calls/"
    Then response code is equal to 404
    When I GET "/node/"
    Then response code is equal to 404

  Scenario: Current calls clamp the page size and continue to an empty last page
    Given I register a test IPFS network "api-calls-list-page-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current calls request
    When I GET "/calls?limit=0"
    Then response code is equal to 200
    And response lists 1 calls
    And I remember the response next cursor
    Given I sign the current calls request
    When I GET "/calls?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 0 calls
    And the response next cursor is null

  Scenario: A garbage or foreign current calls cursor is refused
    Given I register a test IPFS network "api-calls-list-cursor-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current calls request
    When I GET "/calls?limit=1&cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current calls request
    When I GET "/calls?limit=1" with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
