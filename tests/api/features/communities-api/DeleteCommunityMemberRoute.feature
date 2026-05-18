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
