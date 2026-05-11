Feature: Post private IPFS content route
  As an API consumer
  I want to publish encrypted private binary content to IPFS
  So that conversation messages can reference private attachment CIDs

  Scenario: Publish encrypted private content to IPFS
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-test-network"
    And I set raw IPFS content with content type "application/octet-stream" and text "encrypted-by-client"
    And I sign the current private IPFS content request
    When I POST to "/ipfs/private"
    Then response code is equal to 201
    And response body should contain "cid"
    And response contains a valid resource with the following fields
      | contentType | application/octet-stream |
      | encrypted   | true                     |
      | filename    | avatar.png               |
      | size        | 19                       |
