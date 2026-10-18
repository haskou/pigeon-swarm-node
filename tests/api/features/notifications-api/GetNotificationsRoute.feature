Feature: Get notifications route
  As an API consumer
  I want to list my notifications
  So that I can see pending actions for my identity

  Background:
    Given I register a test IPFS network "notifications-api-network"

  Scenario: List notifications for the recipient
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And the notification recipient signs the current notifications request
    When I GET "/notifications?limit=20"
    Then response code is equal to 200
    And response body is an array with length of 1
    And response body array 0 should contain property "type" with value "conversation_invitation"

  Scenario: Do not list another identity notifications
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And I sign the current notifications request
    When I GET "/notifications?limit=20"
    Then response code is equal to 200
    And response body is an array with length of 0

  Scenario: List at most four pending group invitations from one inviter
    Given I am an anonymous user
    And I have created 5 group conversation invitation notifications
    And the notification recipient signs the current notifications request
    When I GET "/notifications?limit=20"
    Then response code is equal to 200
    And response body is an array with length of 4
    And response body lists the 4 lowest created notification ids

  Scenario: List the held-back group invitation once the recipient handles a listed one
    Given I am an anonymous user
    And I have created 5 group conversation invitation notifications
    And the current notification is the lowest created notification
    And I set a notification declined body
    And the notification recipient signs the current notification patch request
    And I PATCH the current notification
    And response code is equal to 200
    And the notification recipient signs the current notifications request
    When I GET "/notifications?limit=20"
    Then response code is equal to 200
    And response body lists the 5 lowest created notification ids

  Scenario: Keep a held-back group invitation stored for its recipient
    Given I am an anonymous user
    And I have created 5 group conversation invitation notifications
    And the current notification is the highest created notification
    And I set a notification accepted body
    And the notification recipient signs the current notification patch request
    When I PATCH the current notification
    Then response code is equal to 200
    And the notification recipient signs the current notifications request
    When I GET "/notifications?limit=20"
    Then response code is equal to 200
    And response body lists the 5 lowest created notification ids

  Scenario: Notifications page over the recipient list and end with a null cursor
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And the notification recipient signs the current notifications request
    When I GET "/notifications?limit=1"
    Then response code is equal to 200
    And response body is an array with length of 1
    And I remember the response next cursor
    Given the notification recipient signs the current notifications request
    When I GET "/notifications?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response body is an array with length of 0
    And the response next cursor is null

  Scenario: A garbage or foreign notifications cursor is refused
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And the notification recipient signs the current notifications request
    When I GET "/notifications?limit=1&cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given the notification recipient signs the current notifications request
    When I GET "/notifications?limit=1" with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
