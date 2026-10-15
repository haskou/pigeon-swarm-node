Feature: Conversation membership
  As a conversation participant
  I want the node to keep no member or admin routes
  So that a one-to-one roster stays immutable and group rosters live in MLS

  Scenario Outline: A member or admin route does not exist
    Given I register a test IPFS network "<network>"
    And I have created a one-to-one conversation
    And I set a conversation member body for a new identity
    And the <signer> signs a <method> request to the current conversation path "<path>"
    When I send the signed conversation request
    Then response code is equal to 404

    Examples:
      | network                                | signer | method | path              |
      | api-conversation-no-add-member-network | owner  | POST   | /members          |
      | api-conversation-no-leave-network      | other  | DELETE | /members/me       |
      | api-conversation-no-remove-network     | owner  | DELETE | /members/{other}  |
      | api-conversation-no-promote-network    | owner  | PUT    | /admins/{other}   |
      | api-conversation-no-demote-network     | owner  | DELETE | /admins/{other}   |

  Scenario: A member reads the frontier a client signs on
    Given I register a test IPFS network "api-conversation-frontier-network"
    And I have created a one-to-one conversation
    And the owner signs a GET request to the current conversation path "/frontier"
    When I send the signed conversation request
    Then response code is equal to 200
    And response body should contain "frontier"
