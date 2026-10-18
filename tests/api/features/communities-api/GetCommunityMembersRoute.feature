Feature: Get community members API
  As a community member
  I want to page through the members of a community
  So that large communities load in bounded pages

  Background:
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-members-paging-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community

  Scenario: A member pages the members and follows the cursor to the end
    Given I sign the current community members request
    When I GET the current community members with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 members
    And I remember the response next cursor
    Given I sign the current community members request
    When I GET the current community members with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 members
    And the response next cursor is null

  Scenario: A short last page has a null next cursor and the limit is clamped to 1..100
    Given I sign the current community members request
    When I GET the current community members with query "?limit=500"
    Then response code is equal to 200
    And response lists 1 members
    And the response next cursor is null
    Given I sign the current community members request
    When I GET the current community members with query "?limit=0"
    Then response code is equal to 200
    And response lists 1 members

  Scenario: A garbage, foreign, or forged members cursor is refused
    Given I sign the current community members request
    When I GET the current community members with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community members request
    When I GET the current community members with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community members request
    When I GET the current community members with a cursor whose position is not an identity id
    Then response code is equal to 400
    And response body should contain "400110"
