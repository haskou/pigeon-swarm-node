Feature: Community PubSub consumers

  Scenario: Register an added community channel message reaction
    When the community message reaction added consumer handles a reaction announcement
    Then the community message reaction repository should save that reaction

  Scenario: Register a removed community channel message reaction
    When the community message reaction removed consumer handles a reaction announcement
    Then the community message reaction repository should delete that reaction
