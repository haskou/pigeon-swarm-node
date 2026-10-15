Feature: Conversation membership
  As a conversation participant
  I want the node to keep a one-to-one roster immutable
  So that nobody joins, leaves or reshapes a one-to-one conversation

  Scenario: A one-to-one conversation cannot change
    Given I register a test IPFS network "api-conversation-immutable-network"
    And I have created a one-to-one conversation
    And the other signs a DELETE request to the current conversation path "/members/me"
    When I send the signed conversation request
    Then response code is equal to 409

  Scenario: A one-to-one conversation takes no new member
    Given I register a test IPFS network "api-conversation-one-to-one-add-network"
    And I have created a one-to-one conversation
    And I set a conversation member body for a new identity
    And the owner signs a POST request to the current conversation path "/members"
    When I send the signed conversation request
    Then response code is equal to 409

  Scenario: A member reads the frontier a client signs on
    Given I register a test IPFS network "api-conversation-frontier-network"
    And I have created a one-to-one conversation
    And the owner signs a GET request to the current conversation path "/frontier"
    When I send the signed conversation request
    Then response code is equal to 200
    And response body should contain "frontier"
