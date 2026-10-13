Feature: Node PubSub consumers

  Scenario: Register a node peer heartbeat through the consumer
    When the node heartbeat consumer handles a heartbeat
    Then the node peer registrar should receive that peer

  Scenario: Record a peer community state announcement through the consumer
    When the node community state consumer handles an announcement
    Then the peer community state recorder should receive that announcement
