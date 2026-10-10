Feature: Private blob store routes
  As a client
  I want to park client-encrypted bytes on one node behind capabilities
  So that attachments never reach IPFS, the DHT or a public index

  Background:
    Given I register a test IPFS network "private-blobs-network"

  Scenario: Reserve, upload, download and range-read an opaque blob
    When I reserve a private blob of 10 bytes
    Then response code is equal to 201
    And response body should contain "uploadToken"
    And response body should contain "downloadToken"
    When I upload "0123456789" to the private blob with the upload capability
    Then response code is equal to 204
    When I download the private blob with the download capability
    Then response code is equal to 200
    And binary response body should be "0123456789"
    And the response header "cache-control" should be "no-store"
    And the response header "accept-ranges" should be "bytes"
    When I download the private blob with the download capability and range "bytes=2-4"
    Then response code is equal to 206
    And binary response body should be "234"
    And the response header "content-range" should be "bytes 2-4/10"
    When I download the private blob with the download capability and range "bytes=10-"
    Then response code is equal to 416
    And the response header "content-range" should be "bytes */10"

  Scenario: Reservation requires a signed identity
    Given I set json body
      """
      { "size": 10 }
      """
    When I POST to "/private-blobs"
    Then response code is equal to 401

  Scenario: Wrong, swapped or missing capabilities look like an unknown blob
    When I reserve a private blob of 3 bytes
    And I upload "abc" to the private blob with the download capability
    Then response code is equal to 404
    When I upload "abc" to the private blob with the none capability
    Then response code is equal to 404
    When I upload "abc" to the private blob with the upload capability
    Then response code is equal to 204
    When I download the private blob with the upload capability
    Then response code is equal to 404
    When I download the private blob with the none capability
    Then response code is equal to 404
    When I delete the private blob with the download capability
    Then response code is equal to 404

  Scenario: Tampered size is rejected and nothing is served
    When I reserve a private blob of 5 bytes
    And I upload "abc" to the private blob with the upload capability
    Then response code is equal to 400
    When I download the private blob with the download capability
    Then response code is equal to 404
    When I upload "abcdefgh" to the private blob with the upload capability
    Then response code is equal to 400

  Scenario: A completed upload cannot be overwritten
    When I reserve a private blob of 3 bytes
    And I upload "abc" to the private blob with the upload capability
    And I upload "xyz" to the private blob with the upload capability
    Then response code is equal to 409
    When I download the private blob with the download capability
    Then binary response body should be "abc"

  Scenario: The uploader can withdraw a blob
    When I reserve a private blob of 3 bytes
    And I upload "abc" to the private blob with the upload capability
    And I delete the private blob with the upload capability
    Then response code is equal to 204
    When I download the private blob with the download capability
    Then response code is equal to 404

  Scenario: Invalid sizes are rejected
    When I reserve a private blob of 0 bytes
    Then response code is equal to 400
    When I reserve a private blob of 999999999 bytes
    Then response code is equal to 400
