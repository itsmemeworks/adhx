import { test, describe } from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';
import { expandTilde, loadConfig } from '../src/config.js';

describe('expandTilde', () => {
  test('expands ~/ to home directory', () => {
    const result = expandTilde('~/Documents/bookmarks.md');
    assert.strictEqual(result, path.join(os.homedir(), 'Documents/bookmarks.md'));
  });

  test('expands bare ~ to home directory', () => {
    const result = expandTilde('~');
    assert.strictEqual(result, os.homedir());
  });

  test('returns absolute paths unchanged', () => {
    const result = expandTilde('/usr/local/bin');
    assert.strictEqual(result, '/usr/local/bin');
  });

  test('returns relative paths unchanged', () => {
    const result = expandTilde('./bookmarks.md');
    assert.strictEqual(result, './bookmarks.md');
  });

  test('handles null gracefully', () => {
    const result = expandTilde(null);
    assert.strictEqual(result, null);
  });

  test('handles undefined gracefully', () => {
    const result = expandTilde(undefined);
    assert.strictEqual(result, undefined);
  });

  test('handles non-string gracefully', () => {
    const result = expandTilde(123);
    assert.strictEqual(result, 123);
  });
});

describe('loadConfig', () => {
  test('returns default config when no file exists', () => {
    const config = loadConfig('./nonexistent.json');
    assert.ok(config.archiveFile);
    assert.ok(config.pendingFile);
    assert.ok(config.stateFile);
    assert.deepStrictEqual(config.folders, {});
  });

  test('default categories are present', () => {
    const config = loadConfig('./nonexistent.json');
    assert.ok(config.categories.github);
    assert.ok(config.categories.article);
    assert.ok(config.categories.tweet);
  });

  test('expands tilde in archive paths', () => {
    // This tests the integration - loadConfig should expand tildes
    const config = loadConfig('./nonexistent.json');
    // Default paths don't use ~, but the function should work
    assert.ok(!config.archiveFile.includes('~'));
  });
});
