Feature: Get community operations

  Scenario: A member reads the signed operations of a community page by page
    Given I register a test IPFS network "community-operations-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I sign the current community operations request
    When I GET the current community operations with query ""
    Then response code is equal to 200
    And response lists 2 community operations by digest, each signed by its author identity
    And response body should contain "community_created"
    And response body should contain "channel_created"
    And I sign the current community operations request
    When I GET the current community operations with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 community operations by digest, each signed by its author identity
    And I remember the response next cursor
    And I sign the current community operations request
    When I GET the current community operations with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 community operations by digest, each signed by its author identity

  Scenario: An invalid page query or cursor is refused
    Given I register a test IPFS network "community-operations-query-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I sign the current community operations request
    When I GET the current community operations with query "?limit=501"
    Then response code is equal to 400
    And response body should contain "400060"
    And I sign the current community operations request
    When I GET the current community operations with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    And I sign the current community operations request
    When I GET the current community operations with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
    And I sign the current community operations request
    When I GET the current community operations with a cursor whose position is not a digest
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A non-member cannot read the operations of a community
    Given I register a test IPFS network "community-operations-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And the community member signs the current community operations request
    When I GET the current community operations with query ""
    Then response code is equal to 409
    And response body should contain "CommunityMemberNotFoundError"

  Scenario: A non-member cannot page the operations with a valid cursor
    Given I register a test IPFS network "community-operations-cursor-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I sign the current community operations request
    When I GET the current community operations with query "?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    And the community member signs the current community operations request
    When I GET the current community operations with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 409
    And response body should contain "CommunityMemberNotFoundError"
    And the community member signs the current community operations request
    When I GET the current community operations with query ""
    Then response code is equal to 409
    And response body should contain "CommunityMemberNotFoundError"
