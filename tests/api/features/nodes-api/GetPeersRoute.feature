Feature: Get peers

  Scenario: Read active node peers
    Given a node peer heartbeat has been received
    When I GET "/peers"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "peers": [
          {
            "capabilities": {
              "privateIpfs": false,
              "publicIpfs": true,
              "relay": false
            },
            "connectionSummary": {
              "isSharedNetworkPeer": false,
              "sharedNetworkCount": 0
            },
            "id": "550e8400-e29b-41d4-a716-446655440010",
            "networks": [
              {
                "id": "550e8400-e29b-41d4-a716-446655440011",
                "name": "public"
              }
            ],
            "nodeType": "reachable"
          }
        ]
      }
      """

  Scenario: Peers page each array with its own opaque cursor
    Given a node peer heartbeat has been received
    When I GET "/peers?peersLimit=1&ipfsPeersLimit=1"
    Then response code is equal to 200
    And response "peers" holds 1 items
    And response "ipfsPeers" holds 0 items
    And the response "ipfsPeers" next cursor is null
    And I remember the response "peers" next cursor

    When I GET "/peers?peersLimit=1&peersCursor=CURSOR&ipfsPeersLimit=1" with the remembered "peers" page cursor
    Then response code is equal to 200
    And response "peers" holds 0 items
    And the response "peers" next cursor is null

  Scenario: A garbage peers cursor in either array is refused
    When I GET "/peers?peersLimit=1&peersCursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"

    When I GET "/peers?ipfsPeersLimit=1&ipfsPeersCursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A peers cursor issued for the other array is refused
    When I GET "/peers?ipfsPeersLimit=1&ipfsPeersCursor=CURSOR" with the cursor for resource "peers" at position "550e8400-e29b-41d4-a716-446655440010"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario Outline: A forged peers cursor is refused
    When I GET "/peers?peersLimit=1&peersCursor=CURSOR" with the cursor for resource "peers" at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                            |
      | not-a-node                          |
      | 550e8400-e29b-41d4-a716-44665544001 |

  Scenario Outline: A forged ipfs peers cursor is refused
    When I GET "/peers?ipfsPeersLimit=1&ipfsPeersCursor=CURSOR" with the cursor for resource "ipfs-peers" at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                                      |
      | not-a-peer-id                                 |
      | 0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl |

  Scenario: An oversized peers cursor is refused
    When I GET "/peers?peersLimit=1&peersCursor=CURSOR" with the cursor for resource "peers" at a position 257 characters long
    Then response code is equal to 400
    And response body should contain "400110"
