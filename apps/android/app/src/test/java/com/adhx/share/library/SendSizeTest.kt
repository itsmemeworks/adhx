package com.adhx.share.library

import org.junit.Assert.assertEquals
import org.junit.Test

class SendSizeTest {
    @Test
    fun smallFilesAreKilobytesNotZeroMegabytes() {
        assertEquals("47 KB", megabytes(47_000))
        assertEquals("1 KB", megabytes(120))
        assertEquals("9.6 MB", megabytes(9_600_000))
        assertEquals("12 MB", megabytes(12_400_000))
    }

    @Test
    fun progressCountsInTheTotalsUnit() {
        assertEquals("12", megabytes(12_000, unit = false, scale = 47_000))
        assertEquals("0", megabytes(0, unit = false, scale = 47_000))
        assertEquals("3.4", megabytes(3_400_000, unit = false, scale = 12_000_000))
    }
}
