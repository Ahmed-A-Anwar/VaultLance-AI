# VaultLance PayPal Postman Collection

This collection demonstrates the PayPal sandbox payment lifecycle used by VaultLance AI:

1. Obtain an OAuth 2.0 access token
2. Create an order using `intent: AUTHORIZE`
3. Retrieve the order
4. Authorize the buyer-approved order
5. Capture an authorization
6. Create and authorize a second order
7. Void the second authorization
8. Retrieve authorization details
9. Create a freelancer payout
10. Retrieve payout status

## Setup

1. Import `VaultLance-PayPal.postman_collection.json`.
2. Import `VaultLance-Sandbox.postman_environment.json`.
3. Select the `VaultLance` environment.
4. Add your own PayPal sandbox values:
   - `client_id`
   - `client_secret`
   - `freelancer_email`
5. Run `01 - Get Access Token`.
6. Never commit real credentials or access tokens.

## Test accounts

Use PayPal sandbox accounts only:

- Business sandbox account: VaultLance merchant
- Personal sandbox account: client
- Personal sandbox account: freelancer

## Safety

The exported environment intentionally contains no credentials, access tokens, sandbox account passwords, or recipient email addresses.