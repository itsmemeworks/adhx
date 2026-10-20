package com.adhx.share.net

import com.adhx.share.alerts.LiveAlerts
import com.adhx.share.feed.sender
import com.adhx.share.feed.whyChipLabel
import com.adhx.share.library.SendRow
import com.adhx.share.ui.Copy
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Send to your people, forming alerts, the like thumbnail and Keep this channel (board-features contract). */
class BoardFeaturesTest {
    private val json = AdhxApi.json

    // 1. Send straight to your people

    @Test
    fun sendTargetsReadLooselyAndSayWhoHasIt() {
        val body = json.decodeFromString(
            SendTargets.serializer(),
            """{"sendable":true,"people":[
                {"username":"ana","name":"Ana","avatarUrl":null,"has":false,"sent":false},
                {"username":"jo","name":"Jo","has":true,"sent":false},
                {"username":"","name":"nobody"},
                "not a person",
                {"username":"mum","name":"Mum","sent":true,"extra":1}
            ]}""",
        )
        assertTrue(body.sendable)
        assertEquals(listOf("ana", "jo", "mum"), body.people.map { it.username })
        val row = SendRow.of(body)
        assertEquals("Jo already has it.", row.alreadyLine)
        assertTrue(row.shown)
    }

    @Test
    fun aPrivateSaveCantBeSent() {
        val row = SendRow.of(json.decodeFromString(SendTargets.serializer(), """{"sendable":false,"people":[]}"""))
        assertFalse(row.sendable)
        assertTrue(row.shown)
        assertEquals("Just for you. Share it first to send it.", Copy.SEND_PRIVATE)
        // Nobody to send to and nothing private about it: no row at all.
        assertFalse(SendRow.of(SendTargets(sendable = true, people = emptyList())).shown)
    }

    @Test
    fun aSendTicksWhoItWentToAndMarksSkips() {
        val row = SendRow(people = listOf(SendPerson("ana", "Ana"), SendPerson("ben", "Ben"), SendPerson("jo", "Jo")), sending = "ana")
        val after = row.after(SendResult(sent = listOf("ana"), skipped = listOf(SendSkip("ben", "has"), SendSkip("jo", "unknown"))))
        assertNull(after.sending)
        assertEquals(listOf(true, false, false), after.people.map { it.sent })
        assertEquals(listOf(false, true, false), after.people.map { it.has })
        assertEquals("Ben already has it.", after.alreadyLine)
    }

    @Test
    fun alreadyHaveSaysEveryone() {
        assertNull(Copy.alreadyHave(emptyList()))
        assertEquals("Jo already has it.", Copy.alreadyHave(listOf("Jo")))
        assertEquals("Jo and Mum already have it.", Copy.alreadyHave(listOf("Jo", "Mum")))
        assertEquals("Jo, Mum and Ben already have it.", Copy.alreadyHave(listOf("Jo", "Mum", "Ben")))
    }

    @Test
    fun sendAsksAndSends() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"sendable":true,"people":[{"username":"ana","name":"Ana"}]}"""))
            val targets = api.sendTargets("youtube", "abc")
            assertEquals(listOf("ana"), (targets as ApiResult.Ok).value.people.map { it.username })
            val get = server.takeRequest()
            assertEquals("GET", get.method)
            assertEquals("/api/app/send?platform=youtube&id=abc", get.path)
            assertEquals("Bearer phone-key", get.getHeader("Authorization"))

            server.enqueue(MockResponse().setBody("""{"sent":["ana"],"skipped":[{"username":"ben","reason":"has"}]}"""))
            val sent = api.sendTo("youtube", "abc", listOf("ana", "ben"), note = "  ")
            assertEquals(listOf("ana"), (sent as ApiResult.Ok).value.sent)
            val post = server.takeRequest()
            assertEquals("POST", post.method)
            assertEquals("/api/app/send", post.path)
            assertEquals("""{"platform":"youtube","id":"abc","to":["ana","ben"]}""", post.body.readUtf8())

            server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "30").setBody("""{"error":"Slow down a little.","code":"busy"}"""))
            val busy = api.sendTo("youtube", "abc", listOf("ana"))
            assertEquals(429, (busy as ApiResult.Failed).status)
            assertEquals("busy", busy.code)
        }
    }

    @Test
    fun theSentReasonIsTheChipWithTheSendersFace() {
        val post = json.decodeFromString(
            FeedResponse.serializer(),
            """{"items":[{"platform":"x","id":"1","kind":"video",
                "savers":[{"username":"pete","name":"Pete","avatarUrl":"/api/files/avatar/pete","note":"you'll love this"}],
                "why":"Pete sent you this",
                "whyReasons":[{"kind":"sent","text":"Pete sent you this","username":"pete"},{"kind":"together","text":"Ana and Ben both saved it"}]}]}""",
        ).items.single()
        assertEquals(WhyKind.SENT, post.whyKind)
        assertEquals("Pete sent you this", whyChipLabel(post))
        val who = sender(post)
        assertEquals("pete", who?.username)
        assertEquals("/api/files/avatar/pete", who?.avatarUrl)
        assertEquals("you'll love this", post.savers.single().note)
    }

    @Test
    fun aSenderWhoIsntASaverStillHasAFace() {
        val post = PhonePost(platform = "x", id = "1", whyReasons = listOf(WhyReason("Pete sent you this", WhyKind.SENT, "pete")))
        assertEquals("pete", sender(post)?.username)
        // Not the headline: no sender face on the chip.
        val second = PhonePost(platform = "x", id = "1", whyReasons = listOf(WhyReason("New to you", "fresh"), WhyReason("Pete sent you this", WhyKind.SENT, "pete")))
        assertNull(sender(second))
    }

    @Test
    fun unknownReasonKindsAreJustTheirWords() {
        val post = json.decodeFromString(
            PhonePost.serializer(),
            """{"platform":"x","id":"1","whyReasons":[{"kind":"zodiac","text":"The stars say so","username":7}]}""",
        )
        assertEquals("zodiac", post.whyKind)
        assertEquals("The stars say so", whyChipLabel(post))
        assertNull(sender(post))
    }

    // 2. Forming moments

    @Test
    fun formingRowsCarryFacesAndTheBell() {
        val live = json.decodeFromString(
            LiveResponse.serializer(),
            """{"moments":[],"forming":[
                {"id":"f1","title":"Kitchen synths","have":2,"need":3,"unit":"saves","covers":[],
                 "people":[{"username":"jo","name":"Jo"},{"username":"ben","name":"Ben","avatarUrl":null},"x",{"name":"no username"}],
                 "alert":true},
                {"id":"f2","title":"Old server group","have":1,"need":3}
            ]}""",
        )
        val (a, b) = live.forming
        assertEquals(listOf("jo", "ben"), a.people.map { it.username })
        assertTrue(a.alert)
        assertTrue(b.people.isEmpty())
        assertFalse(b.alert)
    }

    @Test
    fun theBellIsPutAndDeleted() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"alert":true}"""))
            assertTrue((api.setFormingAlert("f 1", true) as ApiResult.Ok).value.alert)
            val put = server.takeRequest()
            assertEquals("PUT", put.method)
            assertEquals("/api/app/live/forming/f%201/alert", put.path)

            server.enqueue(MockResponse().setBody("""{"alert":false}"""))
            assertFalse((api.setFormingAlert("f1", false) as ApiResult.Ok).value.alert)
            assertEquals("DELETE", server.takeRequest().method)

            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"That group isn’t forming any more.","code":"forming_gone"}"""))
            val gone = api.setFormingAlert("f1", true) as ApiResult.Failed
            assertEquals(404, gone.status)
            assertEquals("forming_gone", gone.code)
        }
    }

    @Test
    fun alertsAreReadAndMarkedSeen() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(
                MockResponse().setBody(
                    """{"alerts":[{"id":"a1","slug":"kitchen-synths-x1y2","title":"Kitchen synths","at":"2026-10-20T20:00:00Z"},{"id":"a2"},{"slug":"nope"}]}""",
                ),
            )
            val alerts = (api.alerts() as ApiResult.Ok).value.alerts
            assertEquals(listOf("a1"), alerts.map { it.id })
            assertEquals("/api/app/alerts", server.takeRequest().path)

            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            assertTrue(api.alertsSeen(listOf("a1")) is ApiResult.Ok)
            val seen = server.takeRequest()
            assertEquals("POST", seen.method)
            assertEquals("/api/app/alerts/seen", seen.path)
            assertEquals("""{"ids":["a1"]}""", seen.body.readUtf8())
        }
    }

    @Test
    fun alertsNotifyWhenTheyCanElseSayItInTheApp() {
        val alerts = listOf(LiveAlert("a1", "kitchen-synths", "Kitchen synths"), LiveAlert("a1", "kitchen-synths", "dup"), LiveAlert("a2", "", "no slug"))
        assertEquals(listOf("a1"), LiveAlerts.plan(alerts, canNotify = true, foreground = false).notify.map { it.id })
        val inApp = LiveAlerts.plan(alerts, canNotify = false, foreground = true)
        assertTrue(inApp.notify.isEmpty())
        assertEquals(listOf("a1"), inApp.inApp.map { it.id })
        // In the background without permission they wait (unseen) for the app.
        val later = LiveAlerts.plan(alerts, canNotify = false, foreground = false)
        assertTrue(later.notify.isEmpty() && later.inApp.isEmpty())
        assertEquals(LiveAlerts.notificationId(alerts[0]), LiveAlerts.notificationId(alerts[1]))
        assertEquals("Kitchen synths is live · Tune in", LiveAlerts.inAppLine(alerts[0]))
    }

    // 3. The like thumbnail

    @Test
    fun theLikeReasonCarriesYourPost() {
        val post = json.decodeFromString(
            PhonePost.serializer(),
            """{"platform":"reddit","id":"h1","whyReasons":[
                {"kind":"together","text":"Ana and Ben both saved it"},
                {"kind":"like","text":"Like the baby videos you kept","post":{"platform":"youtube","id":"_OBlgSz8sSM","posterUrl":"/api/files/youtube/_OBlgSz8sSM/poster"}},
                {"kind":"like","text":"Like a thing with a broken post","post":{"id":"9"}},
                {"kind":"close","text":"You watch most of Ben's saves to the end","username":"ben"}
            ]}""",
        )
        val like = post.whyReasons[1].post
        assertEquals(ReasonPost("youtube", "_OBlgSz8sSM", "/api/files/youtube/_OBlgSz8sSM/poster"), like)
        assertNull(post.whyReasons[2].post)
        assertEquals("ben", post.whyReasons[3].username)
        assertNull(post.whyReasons[3].post)
    }

    // 4. Keep this channel

    @Test
    fun aGroupChannelSaysWhetherItsKept() {
        val kept = json.decodeFromString(
            ChannelItemsResponse.serializer(),
            """{"items":[],"kept":{"tag":"food-youll-cook","url":"/t/pete/food-youll-cook"}}""",
        )
        assertEquals(KeptChannel("food-youll-cook", "/t/pete/food-youll-cook"), kept.kept)
        listOf("""{"items":[]}""", """{"items":[],"kept":null}""", """{"items":[],"kept":"yes"}""", """{"items":[],"kept":{"url":"/t/x"}}""")
            .forEach { assertNull(json.decodeFromString(ChannelItemsResponse.serializer(), it).kept) }
    }

    @Test
    fun keepingPostsToTheGroupChannel() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"tag":"food-youll-cook","url":"/t/pete/food-youll-cook","added":37}"""))
            val kept = (api.keepGroupChannel("food-youll-cook-one-day") as ApiResult.Ok).value
            assertEquals("food-youll-cook", kept.tag)
            assertEquals(37, kept.added)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/app/channels/group/food-youll-cook-one-day/keep", request.path)
            assertEquals("Kept. 37 posts are in your channel now.", Copy.keptCount(37))
        }
    }
}
