Feature: Post network IPFS content route
  As an API consumer
  I want to publish encrypted private binary content to a selected IPFS network
  So that conversation messages can reference private attachment CIDs

  Scenario: Publish encrypted private content to an IPFS network
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-test-network"
    And I set raw IPFS content with content type "application/octet-stream" and text "encrypted-by-client"
    And I sign the current network IPFS content request
    When I POST to the current IPFS network
    Then response code is equal to 201
    And response body should contain "cid"
    And response contains a valid resource with the following fields
      | contentType | application/octet-stream |
      | encrypted   | true                     |
      | filename    | avatar.png               |
      | size        | 19                       |

  Scenario: Reject encrypted private content for an unknown IPFS network
    Given I am an anonymous user
    And I use an unknown IPFS network id
    And I set raw IPFS content with content type "application/octet-stream" and text "encrypted-by-client"
    And I sign the current network IPFS content request
    When I POST to the current IPFS network
    Then response code is equal to 404
    And response body should contain "NotFoundError"
