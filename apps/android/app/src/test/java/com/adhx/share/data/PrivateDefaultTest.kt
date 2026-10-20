package com.adhx.share.data

import org.junit.Assert.*
import org.junit.Test

class PrivateDefaultTest {
    private val owner = Connection("https://one.test", "first-key", "owner")
    private val original = ConnectionRecord(owner, owner.server, allowLegacyHistory = true)

    @Test fun `process death before legacy preference reset cannot apply previous default to new account`() {
        for (choice in listOf(true, false)) {
            val oldOnDisk = PrivateDefault(choice)
            val newOwner = owner.copy(username = "new-owner", key = "new-key")
            val durablePairing = original.pairedWith(newOwner)
            // Reopen with old preference bytes because the async cleanup never completed.
            assertNull(oldOnDisk.forAccount(durablePairing.connection, durablePairing.allowLegacyHistory))
        }
    }

    @Test fun `owned preference survives credential rotation but never another account or origin`() {
        for (choice in listOf(true, false)) {
            val saved = PrivateDefault.capture(choice, owner)
            val rotated = original.pairedWith(owner.copy(key = "rotated"))
            assertEquals(choice, saved.forAccount(rotated.connection, rotated.allowLegacyHistory))
            assertNull(saved.forAccount(owner.copy(username = "other"), true))
            assertNull(saved.forAccount(owner.copy(server = "https://other.test"), true))
        }
    }

    @Test fun `legacy upgrade keeps exact default only while migration eligibility is retained`() {
        for (choice in listOf(true, false)) {
            val saved = PrivateDefault(choice)
            assertEquals(choice, saved.forAccount(owner, allowLegacy = true))
            assertNull(saved.forAccount(owner, allowLegacy = false))
            val rotated = original.pairedWith(owner.copy(key = "rotated"))
            assertEquals(choice, saved.forAccount(rotated.connection, rotated.allowLegacyHistory))
        }
    }

    @Test fun `disconnect and pairing back never revive anonymous old preference`() {
        val onDisk = PrivateDefault(false)
        val disconnected = ConnectionRecord(lastServer = owner.server, allowLegacyHistory = false)
        assertNull(onDisk.forAccount(null, true))
        val returned = disconnected.pairedWith(owner.copy(key = "new-key"))
        assertNull(onDisk.forAccount(returned.connection, returned.allowLegacyHistory))
    }

    @Test fun `new account choice is scoped and false remains distinct from omission`() {
        assertEquals(PrivateDefault(false, owner.server, owner.username), PrivateDefault.capture(false, owner))
        assertEquals(false, PrivateDefault.capture(false, owner).forAccount(owner, false))
        assertNull(PrivateDefault.capture(null, owner).forAccount(owner, true))
        assertNull(PrivateDefault.capture(true, null).forAccount(owner, true))
    }
}
