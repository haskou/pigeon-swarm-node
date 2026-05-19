Feature: Post used sticker route
  As an API consumer
  I want to record sticker usage
  So that identities can see their recent stickers

  Scenario: Record a recently used sticker
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I remember the current sticker pack
    And I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the current sticker
    And I sign the current used sticker request
    When I POST the current sticker as used
    Then response code is equal to 200
    And response body should contain "recentStickers"
    And response body should contain "assetCid"
