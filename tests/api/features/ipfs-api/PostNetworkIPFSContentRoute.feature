Feature: Retired network IPFS content route
  As a node owner
  I want the network-scoped IPFS upload route to stay retired
  So that private content is never published to IPFS or announced in the DHT

  Scenario: Reject encrypted content posted to a network IPFS route
    Given I am an anonymous user
    And I register a test IPFS network "api-test-network"
    And I set raw IPFS content with content type "application/octet-stream" and text "encrypted-by-client"
    And I sign the current network IPFS content request
    When I POST to the current IPFS network
    Then response code is equal to 404
