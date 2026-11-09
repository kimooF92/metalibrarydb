import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedMediaHost,
  clipOpeningHook,
  generateTranscriptionDeduplicationId,
  WordTimestamp,
} from "./transcription-pipeline";

test("isAllowedMediaHost allowlists legitimate Meta CDN and trusted storage hosts", () => {
  const allowed = [
    "https://video.faep7-1.fna.fbcdn.net/o1/v/t2/f2/video.mp4?oh=123",
    "https://scontent.faep7-1.fna.fbcdn.net/v/t39.35426-6/video.mp4",
    "https://f001.backblazeb2.com/file/meta-ads/ad1.mp4",
    "https://f004.backblazeb2.com/file/meta-ads/ad2.mp4",
    "https://abcdef.supabase.co/storage/v1/object/public/videos/clip.mp4",
    "https://files.catbox.moe/example.mp4",
  ];

  for (const url of allowed) {
    assert.equal(isAllowedMediaHost(url), true, `Expected ${url} to be allowed`);
  }
});

test("isAllowedMediaHost strictly blocks SSRF, internal IPs, and untrusted domains", () => {
  const blocked = [
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/api/secret",
    "http://127.0.0.1:8000/v1/transcribe",
    "https://evil-attacker.com/malicious.mp4",
    "https://facebook.com.evil.com/fake.mp4",
    "ftp://fbcdn.net/video.mp4",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not-a-valid-url",
  ];

  for (const url of blocked) {
    assert.equal(isAllowedMediaHost(url), false, `Expected ${url} to be blocked`);
  }
});

test("clipOpeningHook strictly extracts words ending at or before t <= 3.2s", () => {
  const words: WordTimestamp[] = [
    { word: "Stop", start: 0.1, end: 0.5 },
    { word: "scrolling", start: 0.6, end: 1.2 },
    { word: "si", start: 1.3, end: 1.6 },
    { word: "tu", start: 1.7, end: 2.1 },
    { word: "cherches", start: 2.2, end: 2.9 },
    { word: "ce", start: 3.0, end: 3.2 },
    // Words after 3.2s must NOT be in the hook
    { word: "produit", start: 3.3, end: 3.8 },
    { word: "incroyable", start: 3.9, end: 4.5 },
    { word: "en", start: 4.6, end: 5.0 },
    { word: "Tunisie", start: 5.1, end: 6.0 },
  ];

  const hook = clipOpeningHook(words, 3.2);
  assert.equal(hook, "Stop scrolling si tu cherches ce");
  assert.doesNotMatch(hook || "", /produit/);
  assert.doesNotMatch(hook || "", /Tunisie/);
});

test("clipOpeningHook handles empty, boundary, and missing word arrays cleanly", () => {
  assert.equal(clipOpeningHook([]), null);
  assert.equal(clipOpeningHook(null as any), null);
  assert.equal(clipOpeningHook(undefined as any), null);

  // If first word starts after 3.2s
  const lateWords: WordTimestamp[] = [
    { word: "Late", start: 4.0, end: 4.5 },
    { word: "Speech", start: 4.6, end: 5.0 },
  ];
  assert.equal(clipOpeningHook(lateWords, 3.2), null);
});

test("generateTranscriptionDeduplicationId produces valid QStash-compatible IDs without colons", () => {
  const adId = "42e6327a-31f5-453a-94ab-0e7e5c44b7f8";
  const mediaHash = "sha256_abcdef1234567890";

  const dedupId = generateTranscriptionDeduplicationId(adId, mediaHash);

  assert.match(dedupId, /^transcribe_[a-f0-9]{32}$/);
  assert.equal(dedupId.includes(":"), false, "QStash rejects colons in deduplicationId");

  // Determinism check: same input must produce identical deduplicationId
  const dedupIdRepeat = generateTranscriptionDeduplicationId(adId, mediaHash);
  assert.equal(dedupId, dedupIdRepeat);
});

