Feature: Group conversation membership
  As a group creator, admin or member
  I want to change who is in a group conversation with signed operations
  So that every node folds the same roster

  Scenario: The creator adds a member to a group
    Given I register a test IPFS network "api-conversation-add-member-network"
    And I have created a group conversation
    And I set a conversation member body for a new identity
    And the owner signs a POST request to the current conversation path "/members"
    When I send the signed conversation request
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | type | group |

  Scenario: A plain member cannot add a member
    Given I register a test IPFS network "api-conversation-plain-add-network"
    And I have created a group conversation
    And I set a conversation member body for a new identity
    And the other signs a POST request to the current conversation path "/members"
    When I send the signed conversation request
    Then response code is equal to 409
    And response body should contain "InvalidConversationOperationError"

  Scenario: A promoted admin can add a member
    Given I register a test IPFS network "api-conversation-admin-add-network"
    And I have created a group conversation
    And the owner signs a PUT request to the current conversation path "/admins/{other}"
    When I send the signed conversation request
    Then response code is equal to 200
    And I set a conversation member body for a new identity
    And the other signs a POST request to the current conversation path "/members"
    When I send the signed conversation request
    Then response code is equal to 200

  Scenario: A demoted admin can no longer add a member
    Given I register a test IPFS network "api-conversation-demote-network"
    And I have created a group conversation
    And the owner signs a PUT request to the current conversation path "/admins/{other}"
    And I send the signed conversation request
    And the owner signs a DELETE request to the current conversation path "/admins/{other}"
    And I send the signed conversation request
    And I set a conversation member body for a new identity
    And the other signs a POST request to the current conversation path "/members"
    When I send the signed conversation request
    Then response code is equal to 409

  Scenario: Nobody but the creator promotes an admin
    Given I register a test IPFS network "api-conversation-promote-network"
    And I have created a group conversation
    And the other signs a PUT request to the current conversation path "/admins/{other}"
    When I send the signed conversation request
    Then response code is equal to 409

  Scenario: A member leaves a group by themselves
    Given I register a test IPFS network "api-conversation-leave-network"
    And I have created a group conversation
    And the other signs a DELETE request to the current conversation path "/members/me"
    When I send the signed conversation request
    Then response code is equal to 200

  Scenario: The creator cannot leave their group
    Given I register a test IPFS network "api-conversation-creator-leave-network"
    And I have created a group conversation
    And the owner signs a DELETE request to the current conversation path "/members/me"
    When I send the signed conversation request
    Then response code is equal to 409

  Scenario: The creator removes a member
    Given I register a test IPFS network "api-conversation-remove-network"
    And I have created a group conversation
    And the owner signs a DELETE request to the current conversation path "/members/{other}"
    When I send the signed conversation request
    Then response code is equal to 200

  Scenario: A plain member cannot remove another member
    Given I register a test IPFS network "api-conversation-plain-remove-network"
    And I have created a group conversation
    And the other signs a DELETE request to the current conversation path "/members/{owner}"
    When I send the signed conversation request
    Then response code is equal to 409

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
    And I have created a group conversation
    And the owner signs a GET request to the current conversation path "/frontier"
    When I send the signed conversation request
    Then response code is equal to 200
    And response body should contain "frontier"
