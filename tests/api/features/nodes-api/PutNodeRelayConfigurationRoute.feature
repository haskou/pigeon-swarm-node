Feature: Put node relay configuration

  Scenario: Get default relay configuration as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I sign the current node relay configuration query
    When I GET "/node/relay-configuration/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "callsRelay": {},
        "manualRelayMultiaddrs": [],
        "publicNetwork": {
          "enabled": false,
          "port": 4011
        },
        "privateRelay": {
          "enabled": false,
          "publicationEnabled": false,
          "discoveryEnabled": false
        }
      }
      """
    And response body should not contain "publicRelay"

  Scenario: Replace relay configuration as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "publicHost": "relay.example.com",
        "callsRelay": {
          "port": 4199
        },
        "manualRelayMultiaddrs": [
          "/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelayPeerId"
        ],
        "publicNetwork": {
          "enabled": true,
          "port": 4011
        },
        "privateRelay": {
          "enabled": true,
          "portStart": 4100,
          "portEnd": 4199,
          "publicationEnabled": true,
          "discoveryEnabled": true
        }
      }
      """
    And I sign the current node relay configuration request
    When I PUT "/node/relay-configuration/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "publicHost": "relay.example.com",
        "callsRelay": {
          "port": 4199
        },
        "manualRelayMultiaddrs": [
          "/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelayPeerId"
        ],
        "publicNetwork": {
          "enabled": true,
          "port": 4011
        },
        "privateRelay": {
          "enabled": true,
          "portStart": 4100,
          "portEnd": 4199,
          "publicationEnabled": true,
          "discoveryEnabled": true
        }
      }
      """
    And response body should not contain "publicRelay"

  Scenario: Replace relay configuration before the node is claimed
    Given the local node has no owner and no networks
    And I set json body
      """
      {
        "callsRelay": {},
        "manualRelayMultiaddrs": [],
        "publicNetwork": {
          "enabled": false
        },
        "privateRelay": {
          "enabled": false,
          "publicationEnabled": false,
          "discoveryEnabled": true
        }
      }
      """
    When I PUT "/node/relay-configuration/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "manualRelayMultiaddrs": [],
        "publicNetwork": {
          "enabled": false
        },
        "privateRelay": {
          "enabled": false,
          "publicationEnabled": false,
          "discoveryEnabled": true
        }
      }
      """
    And response body should not contain "publicRelay"

  Scenario: Reject relay configuration changes from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "privateRelay": {
          "enabled": false,
          "publicationEnabled": false,
          "discoveryEnabled": false
        },
        "publicNetwork": {
          "enabled": true,
          "port": 4011
        },
        "manualRelayMultiaddrs": []
      }
      """
    And another identity signs the current node relay configuration request
    When I PUT "/node/relay-configuration/"
    Then response code is equal to 403
