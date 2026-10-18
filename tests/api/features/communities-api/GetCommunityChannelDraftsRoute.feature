Feature: Get community channel drafts
  As an identity with saved community channel drafts
  I want to page through my drafts
  So that the draft list loads in bounded pages

  Scenario: List drafts page by page until the last page
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-drafts-network"
    And I have created a private community text channel
    And I have saved the current community channel draft
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I have saved the current community channel draft
    Given I sign the current community drafts request
    When I GET the community drafts with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 drafts
    And I remember the response next cursor
    Given I sign the current community drafts request
    When I GET the community drafts with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 drafts
    And I remember the response next cursor
    Given I sign the current community drafts request
    When I GET the community drafts with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 drafts
    And the response next cursor is null

  Scenario: Drafts limit is clamped between 1 and 100
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-drafts-limit-network"
    And I have created a private community text channel
    And I have saved the current community channel draft
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I have saved the current community channel draft
    Given I sign the current community drafts request
    When I GET the community drafts with query "?limit=0"
    Then response code is equal to 200
    And response lists 1 drafts
    Given I sign the current community drafts request
    When I GET the community drafts with query "?limit=500"
    Then response code is equal to 200
    And response lists 2 drafts

  Scenario: A drafts cursor refuses malformed and foreign cursors
    Given I am an anonymous user
    And I register a test IPFS network "community-channel-drafts-cursor-network"
    And I have created a private community text channel
    And I have saved the current community channel draft
    Given I sign the current community drafts request
    When I GET the community drafts with a garbage cursor
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community drafts request
    When I GET the community drafts with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
