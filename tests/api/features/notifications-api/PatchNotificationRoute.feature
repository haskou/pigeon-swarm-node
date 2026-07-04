Feature: Patch notification route
  As an API consumer
  I want to update my notifications
  So that I can accept or decline actionable invitations

  Background:
    Given I register a private IPFS network "notifications-api-network"

  Scenario: Accept a conversation invitation notification
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And I set a notification accepted body
    And the notification recipient signs the current notification patch request
    When I PATCH the current notification
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | read     |
      | state  | accepted |

  Scenario: Decline a conversation invitation notification
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And I set a notification declined body
    And the notification recipient signs the current notification patch request
    When I PATCH the current notification
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | read     |
      | state  | declined |

  Scenario: Reject notification updates from non-recipient identities
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And I set a notification accepted body
    And another identity signs the current notification patch request
    When I PATCH the current notification
    Then response code is equal to 409
