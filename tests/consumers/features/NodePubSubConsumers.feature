Feature: Node PubSub consumers

  Scenario: Register a node peer heartbeat through the consumer
    When the node heartbeat consumer handles a heartbeat
    Then the node peer registrar should receive that peer
