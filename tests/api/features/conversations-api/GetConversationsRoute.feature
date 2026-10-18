Feature: Get conversations route
  As an API consumer
  I want to page through my conversations
  So that clients can load long conversation lists in bounded pages

  Background:
    Given I register a test IPFS network "conversations-api-list-network"

  Scenario: Conversations page with an opaque cursor and end with a null cursor
    Given I am an anonymous user
    And I have created a one-to-one conversation
    And I have created a one-to-one conversation
    And I sign the current conversations request
    When I GET "/conversations?limit=1"
    Then response code is equal to 200
    And response lists 1 conversations
    And I remember the response next cursor
    Given I sign the current conversations request
    When I GET "/conversations?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 1 conversations
    And I remember the response next cursor
    Given I sign the current conversations request
    When I GET "/conversations?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 0 conversations
    And the response next cursor is null

  Scenario: A garbage or foreign conversations cursor is refused
    Given I am an anonymous user
    And I have created a one-to-one conversation
    And I sign the current conversations request
    When I GET "/conversations?limit=1&cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current conversations request
    When I GET "/conversations?limit=1" with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A cursor from another identity does not reveal its conversations
    Given I am an anonymous user
    And I have created a one-to-one conversation
    And I have created a one-to-one conversation
    And I sign the current conversations request
    When I GET "/conversations?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    Given another identity signs a GET request to "/conversations"
    When I GET "/conversations?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 0 conversations

  Scenario Outline: A forged conversations cursor is refused
    Given I am an anonymous user
    And I have created a one-to-one conversation
    And I sign the current conversations request
    When I GET "/conversations?limit=1" with a forged "conversations" cursor at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                                 |
      | abc\|notanid                             |
      | 0000000000000001\|notanid                |
      | 99999999999999999\|notanid               |
      | 00000000000000001                        |

  Scenario: Oversized and non-canonical conversations cursors are refused
    Given I am an anonymous user
    And I have created a one-to-one conversation
    And I sign the current conversations request
    When I GET "/conversations?limit=1" with a "conversations" cursor whose position is 257 characters long
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current conversations request
    When I GET "/conversations?limit=1" with a "conversations" cursor whose position is 400 characters long
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current conversations request
    When I GET "/conversations?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    Given I sign the current conversations request
    When I GET "/conversations?limit=1&cursor=CURSOR" with the remembered page cursor followed by "="
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A well-formed conversations position matching no conversation reads an empty page
    Given I am an anonymous user
    And I have created a one-to-one conversation
    And I sign the current conversations request
    When I GET "/conversations?limit=1" with a forged "conversations" cursor at position "00000000000000001|no-such-conversation"
    Then response code is equal to 200
    And response lists 0 conversations
