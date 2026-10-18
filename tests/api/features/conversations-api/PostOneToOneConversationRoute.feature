Feature: Post one-to-one conversation route
  As an API consumer
  I want to create a one-to-one conversation
  So that I can start an encrypted chat with another identity

  Scenario: Create one-to-one conversation successfully
    Given I am an anonymous user
    And I register a test IPFS network "conversation-api-network"
    And I have published a keychain for the authenticated identity
    And I set a one-to-one conversation body for a new participant
    And I sign the current one-to-one conversation request
    When I POST to "/conversations"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | type | one-to-one |
    And response body should contain "one-to-one:"

  Scenario: Refuse a malformed participant id as a bad request
    Given I am an anonymous user
    And I register a test IPFS network "conversation-api-malformed-participant-network"
    And I have published a keychain for the authenticated identity
    And I set a one-to-one conversation body with a malformed participant
    And I sign the current one-to-one conversation request
    When I POST to "/conversations"
    Then response code is equal to 400

  Scenario: Refuse a group conversation genesis signed as older clients did
    Given I am an anonymous user
    And I register a test IPFS network "conversation-api-group-network"
    And I have published a keychain for the authenticated identity
    And I set a group conversation body for new participants
    And I sign the current group conversation request as an older client did
    When I POST to "/conversations"
    Then response code is equal to 409
    And response body should contain "InvalidConversationOperationError"
    And I sign the current conversations request
    When I GET current conversations
    Then response code is equal to 200
    And response body should not contain "group:"

  Scenario: Reject an expired signed request timestamp
    Given I am an anonymous user
    And I register a test IPFS network "conversation-api-expired-timestamp-network"
    And I have created a one-to-one conversation
    And I sign the current conversations request with an expired timestamp
    When I GET current conversations
    Then response code is equal to 401
