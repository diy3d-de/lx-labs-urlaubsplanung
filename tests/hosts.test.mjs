// Host-Prüfung gegen DNS-Rebinding (src/lib/hosts.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostname, isAllowedHost } from "../src/lib/hosts.ts";

test("Lokale Hosts sind erlaubt", () => {
  for (const h of [
    "127.0.0.1:53211",
    "localhost:3000",
    "192.168.178.20:3000",
    "[::1]:3000",
    "nas:3000",
    "urlaub.fritz.box",
    "server.local",
    "planer.home.arpa",
  ]) {
    assert.equal(isAllowedHost(h, undefined), true, h);
  }
});

test("Fremde Domains (DNS-Rebinding) werden abgelehnt", () => {
  for (const h of ["evil.example.com", "127.0.0.1.nip.io:3000", "attacker.de", null, "", "a b", "x.com:abc"]) {
    assert.equal(isAllowedHost(h, undefined), false, String(h));
  }
});

test("ALLOWED_HOSTS ergänzt eigene Domains", () => {
  assert.equal(isAllowedHost("urlaub.example.de", "urlaub.example.de, other.de"), true);
  assert.equal(isAllowedHost("URLAUB.example.de:443", "urlaub.example.de"), true);
  assert.equal(isAllowedHost("evil.example.de", "urlaub.example.de"), false);
});

test("hostname normalisiert Port, Groß-/Kleinschreibung und IPv6", () => {
  assert.equal(hostname("Server.LAN:8080"), "server.lan");
  assert.equal(hostname("[fe80::1]:80"), "fe80::1");
  assert.equal(hostname("example.com."), "example.com");
});
