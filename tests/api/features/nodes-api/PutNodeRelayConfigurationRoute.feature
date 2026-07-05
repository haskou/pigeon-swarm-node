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
        "publicRelay": {
          "enabled": false,
          "autoEnabled": false,
          "discoveryEnabled": false,
          "port": 4011,
          "libp2pPort": 4001
        },
        "privateRelay": {
          "enabled": false,
          "publicRecordPublicationEnabled": false,
          "publicRecordDiscoveryEnabled": false
        }
      }
      """

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
        "publicRelay": {
          "enabled": true,
          "autoEnabled": false,
          "discoveryEnabled": true,
          "port": 4011,
          "libp2pPort": 4001
        },
        "privateRelay": {
          "enabled": true,
          "portStart": 4100,
          "portEnd": 4199,
          "publicRecordPublicationEnabled": true,
          "publicRecordDiscoveryEnabled": true
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
        "publicRelay": {
          "enabled": true,
          "discoveryEnabled": true
        },
        "privateRelay": {
          "enabled": true,
          "portStart": 4100,
          "portEnd": 4199,
          "publicRecordPublicationEnabled": true,
          "publicRecordDiscoveryEnabled": true
        }
      }
      """

  Scenario: Replace relay configuration before the node is claimed
    Given the local node has no owner and no networks
    And I set json body
      """
      {
        "callsRelay": {},
        "manualRelayMultiaddrs": [],
        "publicRelay": {
          "enabled": false,
          "autoEnabled": false,
          "discoveryEnabled": true
        },
        "privateRelay": {
          "enabled": false,
          "publicRecordPublicationEnabled": false,
          "publicRecordDiscoveryEnabled": false
        }
      }
      """
    When I PUT "/node/relay-configuration/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "manualRelayMultiaddrs": [],
        "publicRelay": {
          "enabled": false,
          "autoEnabled": false,
          "discoveryEnabled": true
        },
        "privateRelay": {
          "enabled": false,
          "publicRecordPublicationEnabled": false,
          "publicRecordDiscoveryEnabled": false
        }
      }
      """

  Scenario: Reject relay configuration changes from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "publicRelay": {
          "enabled": true,
          "autoEnabled": false,
          "discoveryEnabled": false,
          "port": 4011,
          "libp2pPort": 4001
        },
        "privateRelay": {
          "enabled": false,
          "publicRecordPublicationEnabled": false,
          "publicRecordDiscoveryEnabled": false
        },
        "manualRelayMultiaddrs": []
      }
      """
    And another identity signs the current node relay configuration request
    When I PUT "/node/relay-configuration/"
    Then response code is equal to 403
