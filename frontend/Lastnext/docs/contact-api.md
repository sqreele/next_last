# Contact API

The canonical public Contact endpoint is:

```text
POST /api/contact/
```

StayMaint enables Next.js `trailingSlash`, so browser code must call the
trailing-slash URL directly. Do not submit to `/api/contact` and depend on its
HTTP 308 canonicalization, because POST requests and bodies should reach the
route handler without a redirect.

The Next.js route proxies the request to Django's canonical endpoint:

```text
POST /api/v1/public/contact/
```

Both public and internal paths intentionally include their trailing slash.
