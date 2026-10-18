Feature: Get community membership requests API
  As an identity
  I want to see join requests related to me
  So that both sides can track pending community membership

  Scenario: Owner sees join requests for their community
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-membership-requests-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I sign the current community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "request"
    And response body should contain "pending"

  Scenario: A far-future join request pages without losing or repeating the row
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-membership-requests-far-future-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And the community member signs the current community join request with a far-future createdAt
    When I POST to request joining the current community
    Then response code is equal to 200
    And I sign the current community membership requests request
    When I GET community membership requests with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 requests
    And I remember the response next cursor
    And I sign the current community membership requests request
    When I GET community membership requests with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 requests
    And the response next cursor is null

  Scenario: A garbage or foreign membership requests cursor is refused
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-membership-requests-cursor-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I sign the current community membership requests request
    When I GET community membership requests with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    And I sign the current community membership requests request
    When I GET community membership requests with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
