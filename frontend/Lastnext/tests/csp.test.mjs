import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CSP_HEADER,
  buildContentSecurityPolicy,
  createCspContext,
} from "../app/lib/security/csp.mjs";

const NONCE = "fixed-test-nonce";
const productionPolicy = buildContentSecurityPolicy({ nonce: NONCE });

function directive(name, policy = productionPolicy) {
  return policy
    .split("; ")
    .find((value) => value.startsWith(`${name} `));
}

describe("production Content Security Policy", () => {
  it("uses the enforcing response header name", () => {
    const responseHeaders = new Headers();
    responseHeaders.set(CSP_HEADER, productionPolicy);

    assert.equal(CSP_HEADER, "Content-Security-Policy");
    assert.equal(responseHeaders.get(CSP_HEADER), productionPolicy);
    assert.equal(responseHeaders.get("Content-Security-Policy-Report-Only"), null);
  });

  it("starts from restrictive object, base, and framing controls", () => {
    assert.equal(directive("default-src"), "default-src 'self'");
    assert.equal(directive("base-uri"), "base-uri 'self'");
    assert.equal(directive("object-src"), "object-src 'none'");
    assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
    assert.equal(directive("frame-src"), "frame-src 'none'");
    assert.ok(!productionPolicy.includes("*"));
  });

  it("uses a nonce and excludes production script evaluation bypasses", () => {
    assert.equal(
      directive("script-src"),
      "script-src 'self' 'nonce-fixed-test-nonce' 'strict-dynamic'",
    );
    assert.ok(!directive("script-src").includes("'unsafe-inline'"));
    assert.ok(!productionPolicy.includes("'unsafe-eval'"));
  });

  it("limits the inline exception to styles required by React components", () => {
    assert.equal(directive("style-src"), "style-src 'self' 'unsafe-inline'");
    assert.equal(directive("style-src-attr"), "style-src-attr 'unsafe-inline'");
  });

  it("allows only proven browser origins and same-origin protected media", () => {
    assert.equal(directive("connect-src"), "connect-src 'self'");
    assert.match(directive("img-src"), /https:\/\/lh3\.googleusercontent\.com/);
    assert.equal(directive("media-src"), "media-src 'self'");
    assert.ok(!productionPolicy.includes("backend"));
    assert.ok(!productionPolicy.includes("django-backend"));
    assert.ok(!productionPolicy.includes("redis"));
    assert.ok(!productionPolicy.includes("auth0.com"));
  });

  it("limits workers and the application manifest to same-origin", () => {
    assert.equal(directive("worker-src"), "worker-src 'self'");
    assert.equal(directive("manifest-src"), "manifest-src 'self'");
  });

  it("adds development exceptions without changing production", () => {
    const developmentPolicy = buildContentSecurityPolicy({
      nonce: NONCE,
      isDevelopment: true,
    });

    assert.match(directive("script-src", developmentPolicy), /'unsafe-eval'/);
    assert.match(directive("connect-src", developmentPolicy), /ws:\/\/localhost:\*/);
    assert.ok(!productionPolicy.includes("localhost"));
    assert.ok(!productionPolicy.includes("127.0.0.1"));
  });

  it("creates a fresh nonce and exactly one policy per response context", () => {
    const first = createCspContext();
    const second = createCspContext();

    assert.notEqual(first.nonce, second.nonce);
    assert.match(first.policy, new RegExp(`'nonce-${first.nonce}'`));
    assert.equal(first.policy.split("default-src").length - 1, 1);
  });
});
