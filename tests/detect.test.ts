import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAndNormalize, InputDetectionError } from "../src/lib/input/detect";

test("plain domain → website, normalized to registrable domain", () => {
  const r = detectAndNormalize("Example.com");
  assert.equal(r.type, "website");
  assert.equal(r.normalized, "example.com");
  assert.equal(r.domain, "example.com");
});

test("full URL keeps path, normalizes on registrable domain", () => {
  const r = detectAndNormalize("https://shop.example.co.uk/products/x?y=1");
  assert.equal(r.type, "website");
  assert.equal(r.normalized, "example.co.uk");
  assert.equal(r.domain, "example.co.uk");
});

test("@handle → instagram", () => {
  const r = detectAndNormalize("@Nike");
  assert.equal(r.type, "instagram");
  assert.equal(r.handle, "nike");
  assert.equal(r.normalized, "instagram:@nike");
});

test("bare token → instagram handle", () => {
  const r = detectAndNormalize("nikestore");
  assert.equal(r.type, "instagram");
  assert.equal(r.handle, "nikestore");
});

test("instagram profile URL → instagram", () => {
  const r = detectAndNormalize("https://www.instagram.com/nike/");
  assert.equal(r.type, "instagram");
  assert.equal(r.handle, "nike");
});

test("known marketplace URL → marketplace, cached on full URL", () => {
  const r = detectAndNormalize("https://www.amazon.com/dp/B08N5WRWNW");
  assert.equal(r.type, "marketplace");
  assert.equal(r.marketplace, "Amazon");
  assert.ok(r.normalized.startsWith("marketplace:"));
  assert.equal(r.domain, "amazon.com");
});

test("empty and invalid inputs throw InputDetectionError", () => {
  assert.throws(() => detectAndNormalize("   "), InputDetectionError);
  assert.throws(() => detectAndNormalize("not a valid ~~ input"), InputDetectionError);
  assert.throws(() => detectAndNormalize("@way-too!!invalid@@handle"), InputDetectionError);
});
