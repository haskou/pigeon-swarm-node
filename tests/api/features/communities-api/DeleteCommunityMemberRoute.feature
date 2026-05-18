Feature: Delete community member API
  As a community member
  I want to leave private communities
  So that I stop being part of communities I no longer use

  Scenario: Member leaves a private community
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-leave-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And the community member signs the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And the community member signs the current community leave request
    When I DELETE my membership from the current community
    Then response code is equal to 200
    And response body should not contain the other identity id

  Scenario: Owner leaves a private community when they are the only member
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-owner-leave-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community invite body
    And I sign the current community invite request
    When I POST to the current community invites
    Then response code is equal to 200
    And I remember the current community invite
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I sign the current community leave request
    When I DELETE my membership from the current community
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "memberIds": []
      }
      """
    Given I sign the current community request
    When I GET the current community
    Then response code is equal to 409
    And response body should contain "Community not found"
    Given the community member signs the current community invite accept request
    When I POST to accept the current community invite
    Then response code is equal to 409
    And response body should contain "Community invite not found"
    Given the community member signs the community membership requests request
    When I GET community membership requests
    Then response body should not contain the current community id

  Scenario: Owner cannot leave a private community while other members remain
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-owner-leave-with-members-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And the community member signs the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And I sign the current community leave request
    When I DELETE my membership from the current community
    Then response code is equal to 409
    And response body should contain "Community owner cannot leave the community"
