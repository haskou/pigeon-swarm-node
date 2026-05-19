Feature: Post sticker route
  As an API consumer
  I want to add stickers to a pack
  So that clients can render sticker metadata

  Scenario: Add a static sticker to a pack
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
    And response body should contain "Smile"
    And response body should contain "assetCid"

  Scenario: Reject an oversized animated sticker
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I remember the current sticker pack
    And I set an oversized animated sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 409
    And response body should contain "InvalidStickerSizeError"
