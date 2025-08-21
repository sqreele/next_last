Cloudflare Origin Certificate setup for pcms.live

Place the following files in this directory, owned by root, mode 600 for keys and 644 for certs:

- origin.crt
  The Cloudflare Origin Certificate (PEM) downloaded from Cloudflare Dashboard → SSL/TLS → Origin Server → Create certificate.
  Select RSA 2048, hostnames: pcms.live, www.pcms.live. Validity any.

- origin.key
  The private key (PEM) provided when creating the Origin Certificate. Keep this secret (chmod 600).

- cloudflare_origin_rsa_root.pem
  Cloudflare Origin CA root. Download from Cloudflare docs page for Origin Certificates.
  Example: Cloudflare Origin RSA Root CA (PEM).

Nginx is configured to use these paths:
  ssl_certificate /etc/nginx/ssl/origin.crt;
  ssl_certificate_key /etc/nginx/ssl/origin.key;
  ssl_trusted_certificate /etc/nginx/ssl/cloudflare_origin_rsa_root.pem;

After placing these files, restart Nginx via docker-compose:
  docker compose restart nginx

Verify:
  - openssl s_client -connect pcms.live:443 -servername pcms.live -showcerts | tail -n 20
  - curl -Ik https://pcms.live

Cloudflare settings:
  - SSL/TLS mode: Full (strict)
  - Always Use HTTPS: On
  - HTTP/2 and HTTP/3: On (optional)