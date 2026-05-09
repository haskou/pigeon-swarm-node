Feature: Post one-to-one conversation route
  As an API consumer
  I want to create a one-to-one conversation
  So that I can start an encrypted chat with another identity

  Scenario: Create one-to-one conversation successfully
    Given I am an anonymous user
    And I register an in-memory IPFS network "conversation-api-network"
    And I have published a keychain for the authenticated identity
    And I set a one-to-one conversation body for a new participant
    And I sign the current one-to-one conversation request
    When I POST to "/conversations/1to1"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | type | one-to-one |
    And response body should contain "one-to-one:"
