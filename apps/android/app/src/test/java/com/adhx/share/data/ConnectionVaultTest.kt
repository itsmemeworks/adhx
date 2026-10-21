package com.adhx.share.data

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class ConnectionVaultTest {
    private val paired = Connection("https://example.test", "phone-secret", "owner", "Test phone")
    private val record = ConnectionRecord(paired, paired.server, allowLegacyHistory = true)
    private class FileStore : VaultFile {
        var bytes: ByteArray? = null
        var failWrite = false
        var corruptWrite = false
        override fun read() = bytes?.clone()
        override fun write(bytes: ByteArray) {
            if (failWrite) throw IOException("full")
            this.bytes = bytes.clone().also { if (corruptWrite) it[it.lastIndex] = (it.last() + 1).toByte() }
        }
    }
    private class OldStore(var value: ConnectionRecord? = null) : LegacyConnection {
        var removals = 0
        var failRead = false
        var failRemove = false
        override fun read(): ConnectionRecord? {
            if (failRead) throw IOException("cannot decrypt")
            return value
        }
        override fun remove() {
            if (failRemove) throw IOException("busy")
            removals++
            value = null
        }
    }
    private fun newKey() = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private fun vault(file: FileStore, old: OldStore = OldStore(), secret: SecretKey = newKey()) =
        ConnectionVault(file, { secret }, old)

    @Test fun `migration preserves every credential field and removes legacy only after readback`() {
        val file = FileStore()
        val old = OldStore(record)
        val key = newKey()
        val first = vault(file, old, key).apply { load() }
        assertEquals(record, first.record)
        assertNull(first.error)
        assertEquals(1, old.removals)
        assertEquals(record, vault(file, old, key).apply { load() }.record)
        assertFalse(file.bytes!!.toString(Charsets.ISO_8859_1).contains(paired.key))
    }

    @Test fun `failed migration keeps legacy credentials available and reports failure`() {
        val file = FileStore().apply { failWrite = true }
        val old = OldStore(record)
        val store = vault(file, old).apply { load() }
        assertEquals(record, store.record)
        assertNotNull(store.error)
        assertEquals(record, old.value)
        assertEquals(0, old.removals)
        assertNull(file.bytes)
    }

    @Test fun `failed durable verification never deletes legacy`() {
        val file = FileStore().apply { corruptWrite = true }
        val old = OldStore(record)
        val store = vault(file, old).apply { load() }
        assertEquals(record, old.value)
        assertEquals(0, old.removals)
        assertNotNull(store.error)
    }

    @Test fun `cold start can retry failed migration without new pairing`() {
        val file = FileStore().apply { failWrite = true }
        val old = OldStore(record)
        val key = newKey()
        vault(file, old, key).load()
        file.failWrite = false
        val restarted = vault(file, old, key).apply { load() }
        assertEquals(record, restarted.record)
        assertNull(restarted.error)
        assertNull(old.value)
    }

    @Test fun `failed later save retains previous durable and in memory account`() {
        val file = FileStore()
        val store = vault(file)
        assertTrue(store.write(record))
        val before = file.bytes!!.clone()
        file.failWrite = true
        assertFalse(store.write(record.copy(connection = paired.copy(key = "other"))))
        assertEquals(record, store.record)
        assertArrayEquals(before, file.bytes)
        assertNotNull(store.error)
    }

    @Test fun `missing keystore key leaves ciphertext and legacy untouched`() {
        val file = FileStore()
        vault(file).write(record)
        val before = file.bytes!!.clone()
        val old = OldStore(record)
        val missing = ConnectionVault(file, { throw IOException("no key") }, old).apply { load() }
        assertNull(missing.record.connection)
        assertNotNull(missing.error)
        assertArrayEquals(before, file.bytes)
        assertEquals(record, old.value)
        assertEquals(0, old.removals)
    }

    @Test fun `wrong key and corrupt ciphertext never silently restore stale legacy pairing`() {
        val file = FileStore()
        vault(file).write(record)
        val old = OldStore(record)
        val wrong = vault(file, old).apply { load() }
        assertNull(wrong.record.connection)
        assertNotNull(wrong.error)
        assertEquals(0, old.removals)
        file.bytes!![file.bytes!!.lastIndex] = (file.bytes!!.last() + 1).toByte()
        assertNotNull(vault(file, old).apply { load() }.error)
    }

    @Test fun `unreadable legacy data is preserved without crash or reset`() {
        val old = OldStore(record).apply { failRead = true }
        val file = FileStore()
        val store = vault(file, old).apply { load() }
        assertNotNull(store.error)
        assertNull(store.record.connection)
        assertNull(file.bytes)
        assertEquals(record, old.value)
        assertEquals(0, old.removals)
    }

    @Test fun `durable disconnect tombstone prevents stale legacy reimport`() {
        val file = FileStore()
        val old = OldStore(record).apply { failRemove = true }
        val key = newKey()
        val store = vault(file, old, key).apply { load() }
        assertTrue(store.write(ConnectionRecord(lastServer = paired.server)))
        val restarted = vault(file, old, key).apply { load() }
        assertNull(restarted.record.connection)
        assertEquals(paired.server, restarted.record.lastServer)
        assertNull(restarted.error)
        assertEquals(record, old.value)
    }

    @Test fun `failed disconnect never advertises a successful removal`() {
        val file = FileStore()
        val store = vault(file)
        assertTrue(store.write(record))
        file.failWrite = true
        assertFalse(store.write(ConnectionRecord(lastServer = paired.server)))
        assertEquals(record, store.record)
    }

    @Test fun `new unpaired install does not manufacture a key or credential file`() {
        val file = FileStore()
        var keyCalls = 0
        val store = ConnectionVault(file, { keyCalls++; newKey() }, OldStore()).apply { load() }
        assertNull(store.record.connection)
        assertNull(store.error)
        assertNull(file.bytes)
        assertEquals(0, keyCalls)
    }

    @Test fun `success after storage recovery clears error and retains last server`() {
        val file = FileStore().apply { failWrite = true }
        val store = vault(file)
        assertFalse(store.write(record))
        file.failWrite = false
        assertTrue(store.write(record))
        assertNull(store.error)
        assertEquals(paired.server, store.record.lastServer)
    }

    @Test fun `every write uses a fresh authenticated encryption nonce`() {
        val file = FileStore()
        val store = vault(file)
        assertTrue(store.write(record))
        val first = file.bytes!!.clone()
        assertTrue(store.write(record))
        assertFalse(first.contentEquals(file.bytes!!))
    }

    @Test fun `account changes clear old local state but credential rotation preserves it`() {
        assertFalse(record.changesAccount(paired.copy(key = "new-key")))
        assertTrue(record.changesAccount(paired.copy(username = "another-owner")))
        assertTrue(record.changesAccount(paired.copy(server = "https://different.test")))
        assertTrue(ConnectionRecord(lastServer = paired.server).changesAccount(paired))
        assertTrue(ConnectionRecord().changesAccount(paired))
    }

    @Test fun `durable account scope hides old rows after cleanup failure and restart`() {
        val file = FileStore()
        val key = newKey()
        val store = vault(file, secret = key)
        assertTrue(store.write(record))
        val next = paired.copy(username = "different-owner", key = "new-key")
        assertTrue(store.write(store.record.pairedWith(next)))
        // Simulate a failed history cleanup: old and legacy unscoped rows still exist on disk.
        val previous = HistoryItem("old", "https://post.test", 0,
            ownerServer = paired.server, ownerUsername = paired.username)
        val unscoped = HistoryItem("legacy", "https://post.test", 0)
        val own = previous.copy(id = "new", ownerUsername = next.username)
        val restored = vault(file, secret = key).apply { load() }.record
        assertFalse(restored.allowLegacyHistory)
        assertFalse(previous.belongsTo(restored.connection!!, restored.allowLegacyHistory))
        assertFalse(unscoped.belongsTo(restored.connection, restored.allowLegacyHistory))
        assertTrue(own.belongsTo(restored.connection, restored.allowLegacyHistory))
        // Pairing back must not make anonymous old rows eligible again.
        assertFalse(restored.pairedWith(paired).allowLegacyHistory)
    }

    @Test fun `existing credential migration and rotation preserve old unscoped history`() {
        val unscoped = HistoryItem("legacy", "https://post.test", 0)
        val rotated = record.pairedWith(paired.copy(key = "rotated"))
        assertTrue(unscoped.belongsTo(rotated.connection!!, rotated.allowLegacyHistory))
    }

    @Test fun `stale identity responses cannot rename a new pairing or rotated key`() {
        val current = record.pairedWith(paired.copy(username = "new-owner", key = "new-key"))
        assertEquals(current, current.identityUpdated(paired, "old-owner", "old-phone"))
        val rotated = record.pairedWith(paired.copy(key = "rotated"))
        assertEquals(rotated, rotated.identityUpdated(paired, "outdated", "outdated"))
        val elsewhere = record.pairedWith(paired.copy(server = "https://other.test"))
        assertEquals(elsewhere, elsewhere.identityUpdated(paired, "outdated", "outdated"))
    }

    @Test fun `identity refresh preserves migration history eligibility and ignored null fields`() {
        val unknown = record.copy(connection = paired.copy(username = null))
        val refreshed = unknown.identityUpdated(paired, "owner", null)
        assertEquals(paired, refreshed.connection)
        assertTrue(refreshed.allowLegacyHistory)
        val scoped = record.copy(allowLegacyHistory = false)
        assertFalse(scoped.identityUpdated(paired, "owner", "new-phone").allowLegacyHistory)
    }

    @Test fun `completion ownership includes origin and credential but permits identity refresh`() {
        assertTrue(paired.sameCredential(paired.copy(username = "updated")))
        assertFalse(paired.sameCredential(null))
        assertFalse(paired.sameCredential(paired.copy(key = "new-key")))
        assertFalse(paired.sameCredential(paired.copy(server = "https://different.test")))
    }

    @Test fun `lost credential key cannot grant legacy data to a newly paired account`() {
        val file = FileStore()
        vault(file).write(record)
        val old = OldStore(record)
        val replacementKey = newKey()
        var created = false
        val recovering = ConnectionVault(file, { create ->
            if (create) created = true
            check(created) { "missing old key" }
            replacementKey
        }, old).apply { load() }
        assertNotNull(recovering.error)
        assertFalse(recovering.record.allowLegacyHistory)
        val fresh = paired.copy(username = "another-owner", key = "fresh-key")
        assertTrue(recovering.write(recovering.record.pairedWith(fresh)))
        val reopened = vault(file, old, replacementKey).apply { load() }.record
        assertFalse(reopened.allowLegacyHistory)
        assertFalse(HistoryItem("legacy", "https://post.test", 0).belongsTo(fresh, reopened.allowLegacyHistory))
        assertNull(PrivateDefault(false).forAccount(fresh, reopened.allowLegacyHistory))
    }

    @Test fun `missing credential file and unreadable legacy never authorize unscoped data`() {
        for (old in listOf(OldStore(), OldStore(record).apply { failRead = true })) {
            val file = FileStore()
            val store = vault(file, old).apply { load() }
            assertFalse(store.record.allowLegacyHistory)
            assertTrue(store.write(store.record.pairedWith(paired)))
            assertFalse(store.record.allowLegacyHistory)
            assertFalse(HistoryItem("legacy", "https://post.test", 0).belongsTo(paired, store.record.allowLegacyHistory))
            assertNull(PrivateDefault(true).forAccount(paired, store.record.allowLegacyHistory))
        }
    }

    @Test fun `interrupted legacy and atomic writes recognize backup-only files for native recovery`() {
        val directory = java.nio.file.Files.createTempDirectory("adhx-vault-test").toFile()
        try {
            val base = java.io.File(directory, "connection")
            assertFalse(recoverableFileExists(base))
            java.io.File(base.path + ".bak").writeText("recoverable")
            assertTrue(recoverableFileExists(base))
        } finally { directory.deleteRecursively() }
    }

    @Test fun `truncated oversized and unsupported envelope fail closed`() {
        for (bytes in listOf(byteArrayOf(1, 12), ByteArray(40000), ByteArray(32).apply { this[0] = 2 })) {
            val file = FileStore().apply { this.bytes = bytes }
            val store = vault(file).apply { load() }
            assertNotNull(store.error)
            assertNull(store.record.connection)
            assertArrayEquals(bytes, file.bytes)
        }
    }
}
