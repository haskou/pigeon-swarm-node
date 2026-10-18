Feature: Get community discovery API
  As an identity
  I want to discover private community metadata
  So that I can request to join communities I am not a member of

  Scenario: Discover communities by search text
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-discovery-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And the community member signs the current community discovery request
    When I GET discoverable communities
    Then response code is equal to 200
    And response body should contain "API community"
    And response body should contain "none"
    And response body should not contain "textChannels"

  Scenario: Hide communities from discovery
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-hidden-discovery-network"
    And I set a hidden private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And the community member signs the current community discovery request
    When I GET discoverable communities
    Then response code is equal to 200
    And response body should not contain "API community"

  Scenario: Discovery pages the matching communities and refuses a foreign cursor
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-discovery-paging-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And the community member signs the current community discovery request
    When I GET discoverable communities with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 communities
    And I remember the response next cursor
    And the community member signs the current community discovery request
    When I GET discoverable communities with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 communities
    And I remember the response next cursor
    And the community member signs the current community discovery request
    When I GET discoverable communities with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 communities
    And the response next cursor is null
    Given the community member signs the current community discovery request
    When I GET discoverable communities with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
