Feature: Post notification route
  As an API consumer
  I want to create conversation invitation notifications
  So that recipients can accept invitations without exposing private keys

  Scenario: Create a conversation invitation notification
    Given I am an anonymous user
    And I set a conversation invitation notification body
    And I sign the current notification creation request
    When I POST to "/notifications/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | type   | conversation_invitation |
      | status | unread                  |
      | state  | pending                 |
    And response body should contain "encrypted-conversation-key"

  Scenario: Reject notifications from an identity that is not the inviter
    Given I am an anonymous user
    And I set a conversation invitation notification body
    And another identity signs the current notification creation request
    When I POST to "/notifications/"
    Then response code is equal to 403
