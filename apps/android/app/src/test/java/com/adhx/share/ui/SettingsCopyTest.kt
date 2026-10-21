package com.adhx.share.ui

import com.adhx.share.net.ApiResult
import com.adhx.share.net.DoingItem
import com.adhx.share.net.DoingStatus
import com.adhx.share.net.DoingSummary
import com.adhx.share.net.Inviter
import com.adhx.share.net.JoinRequest
import com.adhx.share.net.MediaType
import com.adhx.share.net.Person
import com.adhx.share.net.PersonRole
import com.adhx.share.net.Saver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SettingsCopyTest {
    private val mum = Saver(username = "mum", name = "Mum")
    private val jo = Saver(username = "jo", name = "Jo")
    private val you = Saver(username = "pete", isYou = true)

    @Test
    fun removeThisPhoneSaysSoOnlyWhenTheServerWasNotReached() {
        // Removed on the server, or already removed there: nothing more to say.
        assertNull(SettingsCopy.removedNote(ApiResult.Ok(Unit, 200), "adhx.example"))
        assertNull(SettingsCopy.removedNote(ApiResult.Failed(401, "bad_key", null), "adhx.example"))
        // Offline, or an older ADHX without the route: plainly, it may still be listed.
        val offline = SettingsCopy.removedNote(ApiResult.Offline, "adhx.example")!!
        assertEquals(
            "This phone forgot its key, but it couldn’t reach adhx.example. " +
                "It may still show in Settings → Phone app there; remove it there too.",
            offline,
        )
        assertEquals(offline, SettingsCopy.removedNote(ApiResult.Failed(405, null, null), "adhx.example"))
        assertEquals(true, SettingsCopy.removedNote(ApiResult.Offline, null)!!.contains("couldn’t reach your ADHX"))
        assertEquals(false, SettingsCopy.REMOVE_BODY.contains("Settings → Phone app"))
    }

    @Test
    fun linesUnderOnTheirWay() {
        val keeping = DoingItem(platform = "x", id = "1", step = 2, stepLabel = "Keeping a copy", percent = 62.4, savers = listOf(you))
        assertEquals("Keeping a copy · 62%", SettingsCopy.doingLine(keeping))
        assertEquals(0.624f, SettingsCopy.doingProgress(keeping), 0.001f)

        val converting = DoingItem(platform = "x", id = "2", step = 3, stepLabel = "Making it play everywhere", savers = listOf(jo))
        assertEquals("Making it play everywhere · Jo", SettingsCopy.doingLine(converting))

        val listening = DoingItem(platform = "x", id = "3", step = 4, stepLabel = "Listening to what’s said", playable = true)
        assertEquals("Plays now · listening to what’s said", SettingsCopy.doingLine(listening))

        val stuck = DoingItem(
            platform = "instagram", id = "4", step = 2, stepLabel = "Keeping a copy",
            status = DoingStatus.NEEDS_YOU, reason = "It’s private on Instagram.", savers = listOf(mum),
        )
        assertEquals("Private on Instagram", SettingsCopy.doingTitle(stuck))
        assertEquals("Couldn’t keep it · Mum’s save", SettingsCopy.doingLine(stuck))

        val ready = DoingItem(platform = "x", id = "5", status = DoingStatus.READY, quality = "4K", savers = listOf(you))
        assertEquals("Ready · 4K", SettingsCopy.doingLine(ready))
        assertEquals(1f, SettingsCopy.doingProgress(ready), 0f)
    }

    @Test
    fun summaryAndCounts() {
        assertEquals("3 on their way · 1 needs you", SettingsCopy.doingSummary(DoingSummary(onTheirWay = 3, needsYou = 1)))
        assertEquals("1 on its way", SettingsCopy.doingSummary(DoingSummary(onTheirWay = 1)))
        assertEquals("Nothing on its way", SettingsCopy.doingSummary(DoingSummary()))
        assertNull(SettingsCopy.doingSummary(null))
    }

    @Test
    fun peopleWords() {
        val ben = JoinRequest(id = "i", username = "ben", name = "Ben", invitedBy = Inviter("jo", "Jo"))
        assertEquals("Ben wants in", SettingsCopy.wantsIn(ben))
        assertEquals("Let Ben in", SettingsCopy.letIn(ben))
        assertEquals("Invited by Jo", SettingsCopy.requestLine(ben))
        assertEquals("Connected to your ADHX", SettingsCopy.connectedTo(null))
        assertEquals("Connected to Ana’s ADHX", SettingsCopy.connectedTo(Person(username = "ana", name = "Ana", role = PersonRole.OWNER)))
        assertEquals("Connected to James’ ADHX", SettingsCopy.connectedTo(Person(username = "james", name = "James")))
        assertEquals("@ana · 96 saves · Owner", SettingsCopy.personLine(Person(username = "ana", saves = 96, role = PersonRole.OWNER)))
        assertEquals("@pete · 214 saves", SettingsCopy.youLine("pete", 214))
        assertEquals("Videos, photos", SettingsCopy.feedTypes(MediaType.DEFAULT))
    }
}
