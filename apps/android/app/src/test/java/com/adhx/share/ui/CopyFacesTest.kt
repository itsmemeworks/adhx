package com.adhx.share.ui

import com.adhx.share.net.Saver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CopyFacesTest {
    private val ana = Saver("ana", "Ana")
    private val ben = Saver("ben", "Ben")
    private val mum = Saver("mum", "Mum")
    private val jo = Saver("jo", "Jo")
    private val you = Saver("pete", "Pete", isYou = true)

    @Test
    fun saversLine() {
        assertNull(Copy.saversLine(emptyList()))
        assertEquals("Ana saved this", Copy.saversLine(listOf(ana)))
        assertEquals("Ana and Ben saved this", Copy.saversLine(listOf(ana, ben)))
        assertEquals("Ana and 3 others saved this", Copy.saversLine(listOf(ana, ben, mum, jo)))
        assertEquals("You saved this", Copy.saversLine(listOf(you)))
        assertEquals("Jo and you", Copy.names(listOf(jo, you)))
        assertEquals("sam saved this", Copy.saversLine(listOf(Saver("sam", null))))
    }

    @Test
    fun watchersAndAudience() {
        assertEquals("Ana and Ben are watching with you", Copy.watchersLine(listOf(ana, ben, you)))
        assertEquals("Ana is watching with you", Copy.watchersLine(listOf(ana)))
        assertEquals("Just you, for now", Copy.watchersLine(emptyList()))
        assertEquals("Ana, Ben, Mum and jo will see it", Copy.willSee(listOf("Ana", "Ben", "Mum", "jo")))
        assertEquals("Your people will see it", Copy.willSee(emptyList()))
        assertEquals("12 from Ana, Ben and Mum today", Copy.watchedSummary(12, listOf("Ana", "Ben", "Mum")))
    }

    @Test
    fun facesKeepTheirColourAndInitial() {
        assertEquals(faceColor("ana"), faceColor("Ana"))
        assertEquals("A", initial("ana"))
        assertEquals("?", initial("  "))
    }
}
