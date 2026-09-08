# LINE Messaging API group pairing and job alerts

Job-created, status-changed, and reassigned alerts use the LINE Messaging API
push endpoint. LINE Notify is not used.

## Production configuration

Set both credentials only in the backend deployment environment:

```text
LINE_CHANNEL_ACCESS_TOKEN=<secret>
LINE_CHANNEL_SECRET=<secret>
```

`LINE_MESSAGING_TIMEOUT_SECONDS` is optional and defaults to `3` seconds.
`LINE_PAIRING_EXPIRY_MINUTES` is optional and defaults to `15` minutes.
Never expose any of these settings through a `NEXT_PUBLIC_*` variable.

## LINE Developers setup

1. Create or select the StayMaint Messaging API channel.
2. Enable **Allow bot to join group chats**.
3. Set the Webhook URL to:

   ```text
   https://staymaint.com/api/v1/integrations/line/webhook/
   ```

4. Enable **Use webhook**.
5. Add the bot to the target LINE Group.
6. In StayMaint, an owner, admin, or manager generates a pairing command for
   the exact Property. The command expires after 15 minutes and is shown once.
7. Send that exact command in the target group.
8. Verify that the Property reports a connected LINE destination. Interfaces
   must display only a masked suffix, never the full group ID.

The backend stores only a hash of an unused pairing code. The signed LINE
webhook is the sole authority for the group ID; clients never submit one.
Existing connections must be explicitly disconnected before a new pairing can
be issued.

## Pairing API

Authenticated integration managers use these property-scoped endpoints:

```text
GET  /api/v1/properties/{property_id}/line/status/
POST /api/v1/properties/{property_id}/line/pairing/
POST /api/v1/properties/{property_id}/line/pairing/revoke/
POST /api/v1/properties/{property_id}/line/disconnect/
```

Only active `owner`, `admin`, or `manager` TenantMembership roles may use them.
Pairing creation returns the plaintext command once; it is never persisted.

Routing is resolved exclusively from the persisted `Job.property`. There is no
tenant-wide or cross-Property fallback destination.

## Delivery behavior

This repository has no Celery worker infrastructure. Delivery therefore runs
synchronously with a short timeout, but is registered with
`transaction.on_commit` so rolled-back or rejected mutations emit nothing.
Provider failures are logged without credentials, headers, destination IDs, or
message payloads and never roll back a successful Job mutation.
