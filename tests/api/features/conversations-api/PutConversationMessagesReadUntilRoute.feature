Feature: Mark conversation messages as read

  Scenario: Track and clear unread messages
    Given I register a test IPFS network "api-conversation-unread-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And the other identity signs the current conversations request
    When I GET current conversations
    Then response code is equal to 200
    And response body should contain "\"unreadCount\":1"
    And I set a read conversation messages body
    And the other identity signs the current read conversation messages request
    When I PUT the current conversation messages read marker
    Then response code is equal to 200
    And the other identity signs the current conversations request
    When I GET current conversations
    Then response code is equal to 200
    And response body should contain "\"unreadCount\":0"
