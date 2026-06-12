Feature: Get notifications route
  As an API consumer
  I want to list my notifications
  So that I can see pending actions for my identity

  Background:
    Given I register an in-memory IPFS network "notifications-api-network"

  Scenario: List notifications for the recipient
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And the notification recipient signs the current notifications request
    When I GET "/notifications/?limit=20"
    Then response code is equal to 200
    And response body is an array with length of 1
    And response body array 0 should contain property "type" with value "conversation_invitation"

  Scenario: Do not list another identity notifications
    Given I am an anonymous user
    And I have created a conversation invitation notification
    And I sign the current notifications request
    When I GET "/notifications/?limit=20"
    Then response code is equal to 200
    And response body is an array with length of 0
