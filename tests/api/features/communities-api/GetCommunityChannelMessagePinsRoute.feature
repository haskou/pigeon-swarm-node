Feature: Get community channel message pins
  As a community member
  I want to page through the pinned messages of a community channel
  So that long pin lists load in bounded pages

  Scenario: List pins page by page until the last page
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-pins-network"
    And I have created a private community text channel
    And I have sent an encrypted community channel message
    And I have pinned the current community channel message
    And I have sent an encrypted community channel message
    And I have pinned the current community channel message
    And I have sent an encrypted community channel message
    And I have pinned the current community channel message
    Given I sign the current community channel pins request
    When I GET pins from the current community channel with query "?limit=2"
    Then response code is equal to 200
    And response lists 2 pins
    And I remember the response next cursor
    Given I sign the current community channel pins request
    When I GET pins from the current community channel with query "?limit=2&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 pins
    And the response next cursor is null

  Scenario: Pins limit is clamped between 1 and 100
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-pins-limit-network"
    And I have created a private community text channel
    And I have sent an encrypted community channel message
    And I have pinned the current community channel message
    And I have sent an encrypted community channel message
    And I have pinned the current community channel message
    Given I sign the current community channel pins request
    When I GET pins from the current community channel with query "?limit=0"
    Then response code is equal to 200
    And response lists 1 pins
    Given I sign the current community channel pins request
    When I GET pins from the current community channel with query "?limit=500"
    Then response code is equal to 200
    And response lists 2 pins

  Scenario: A pins cursor refuses malformed and foreign cursors
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-pins-cursor-network"
    And I have created a private community text channel
    And I have sent an encrypted community channel message
    And I have pinned the current community channel message
    Given I sign the current community channel pins request
    When I GET pins from the current community channel with a garbage cursor
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community channel pins request
    When I GET pins from the current community channel with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A non-member cannot list the pins of a private channel
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-pins-non-member-network"
    And I have created a private community text channel
    Given the community member signs the current community channel pins request
    When I GET pins from the current community channel with query "?limit=1"
    Then response code is equal to 409
