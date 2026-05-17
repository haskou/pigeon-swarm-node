Feature: Community PubSub consumers

  Scenario: Register an added community channel message reaction
    When the community message reaction added consumer handles a reaction announcement
    Then the community message reaction repository should save that reaction

  Scenario: Register a removed community channel message reaction
    When the community message reaction removed consumer handles a reaction announcement
    Then the community message reaction repository should delete that reaction

  Scenario: Register community reactions announced by a community sync response
    When the community sync available consumer handles a reaction sync response
    Then the community message reaction repository should save that reaction

  Scenario: Skip empty community sync responses
    When the community sync request consumer handles a request without local data
    Then no community sync response should be published
