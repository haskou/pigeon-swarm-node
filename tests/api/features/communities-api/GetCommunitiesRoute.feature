Feature: Get communities API
  As an identity
  I want to page through the communities I belong to
  So that long lists load in bounded pages

  Scenario: An identity pages its communities and follows the cursor to the end
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-list-paging-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    Given I sign the current communities request
    When I GET current communities with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 communities
    And I remember the response next cursor
    Given I sign the current communities request
    When I GET current communities with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 communities
    And I remember the response next cursor
    Given I sign the current communities request
    When I GET current communities with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 communities
    And the response next cursor is null

  Scenario: A garbage or foreign communities cursor is refused
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-list-cursor-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    Given I sign the current communities request
    When I GET current communities with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current communities request
    When I GET current communities with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
