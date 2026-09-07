# LINE Messaging API job alerts

Job-created, status-changed, and reassigned alerts use the LINE Messaging API
push endpoint. LINE Notify is not used.

## Production configuration

Set the channel access token only in the backend deployment environment:

```text
LINE_CHANNEL_ACCESS_TOKEN=<secret>
```

`LINE_MESSAGING_TIMEOUT_SECONDS` is optional and defaults to `3` seconds.
Never expose either setting through a `NEXT_PUBLIC_*` variable.

For each Property, use Django admin's **LINE Messaging** section to:

1. Set its LINE user, group, or room destination ID.
2. Enable LINE notifications for that Property.

Routing is resolved exclusively from the persisted `Job.property`. There is no
tenant-wide or cross-Property fallback destination.

## Delivery behavior

This repository has no Celery worker infrastructure. Delivery therefore runs
synchronously with a short timeout, but is registered with
`transaction.on_commit` so rolled-back or rejected mutations emit nothing.
Provider failures are logged without credentials, headers, destination IDs, or
message payloads and never roll back a successful Job mutation.
