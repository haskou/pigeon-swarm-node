Feature: Get peers

  Scenario: Read active node peers
    Given a node peer heartbeat has been received
    When I GET "/peers/"
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
