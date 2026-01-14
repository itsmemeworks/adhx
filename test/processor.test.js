import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPaywalled, stripQuerystring } from '../src/processor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('isPaywalled', () => {
  test('detects NYT as paywalled', () => {
    assert.strictEqual(isPaywalled('https://www.nytimes.com/2025/01/01/article.html'), true);
  });

  test('detects WSJ as paywalled', () => {
    assert.strictEqual(isPaywalled('https://www.wsj.com/articles/something'), true);
  });

  test('detects Bloomberg as paywalled', () => {
    assert.strictEqual(isPaywalled('https://www.bloomberg.com/news/article'), true);
  });

  test('returns false for GitHub', () => {
    assert.strictEqual(isPaywalled('https://github.com/user/repo'), false);
  });

  test('returns false for Twitter', () => {
    assert.strictEqual(isPaywalled('https://twitter.com/user/status/123'), false);
  });
});

describe('stripQuerystring', () => {
  test('removes query parameters', () => {
    const result = stripQuerystring('https://example.com/page?utm_source=twitter&ref=123');
    assert.strictEqual(result, 'https://example.com/page');
  });

  test('preserves path', () => {
    const result = stripQuerystring('https://example.com/deep/nested/path?foo=bar');
    assert.strictEqual(result, 'https://example.com/deep/nested/path');
  });

  test('handles URLs without querystring', () => {
    const result = stripQuerystring('https://example.com/page');
    assert.strictEqual(result, 'https://example.com/page');
  });

  test('handles invalid URLs gracefully', () => {
    const result = stripQuerystring('not-a-url');
    assert.strictEqual(result, 'not-a-url');
  });
});

describe('pending file handling', () => {
  test('fixture file with bookmarks array loads correctly', () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/pending-bookmarks.json'), 'utf8')
    );
    assert.ok(Array.isArray(fixture.bookmarks));
    assert.strictEqual(fixture.bookmarks.length, 1);
  });

  test('fixture file without bookmarks array handled with fallback', () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/empty-pending.json'), 'utf8')
    );
    // This tests the pattern: (fixture.bookmarks || [])
    const bookmarks = fixture.bookmarks || [];
    assert.ok(Array.isArray(bookmarks));
    assert.strictEqual(bookmarks.length, 0);
  });

  test('null-safe bookmark ID extraction', () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/empty-pending.json'), 'utf8')
    );
    // Pattern from processor.js line 394
    const pendingIds = new Set((fixture.bookmarks || []).map(b => b.id.toString()));
    assert.strictEqual(pendingIds.size, 0);
  });
});

describe('sample bookmarks fixture', () => {
  test('loads sample bookmarks', () => {
    const bookmarks = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/sample-bookmarks.json'), 'utf8')
    );
    assert.strictEqual(bookmarks.length, 2);
    assert.strictEqual(bookmarks[0].author.username, 'testuser');
  });

  test('bookmarks have required fields', () => {
    const bookmarks = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/sample-bookmarks.json'), 'utf8')
    );
    for (const bookmark of bookmarks) {
      assert.ok(bookmark.id, 'bookmark should have id');
      assert.ok(bookmark.text, 'bookmark should have text');
      assert.ok(bookmark.author, 'bookmark should have author');
      assert.ok(bookmark.createdAt, 'bookmark should have createdAt');
    }
  });
});
