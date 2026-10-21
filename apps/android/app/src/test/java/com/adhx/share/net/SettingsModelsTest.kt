package com.adhx.share.net

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import com.adhx.share.data.Connection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsModelsTest {
    private val json = AdhxApi.json

    @Test
    fun peopleForAnAdminReadsMembersAndRequests() {
        val people = json.decodeFromString(
            PeopleResponse.serializer(),
            """{"members":[
                {"username":"pete","name":"Pete","avatarUrl":"/api/files/avatar/abc","saves":214,"lastSavedAt":"2026-10-19T10:00:00.000Z","role":"owner","banned":false,"isYou":true},
                {"username":"ana","name":null,"avatarUrl":null,"saves":96,"lastSavedAt":null,"role":"member","banned":false,"isYou":false},
                {"username":"","role":"member"},
                "not a person",
                {"username":"troll","role":"member","banned":true}
            ],"isAdmin":true,"canInvite":true,"inviteMode":"approve","requests":[
                {"id":"inv_1","username":"ben","name":"Ben","askedAt":"2026-10-19T09:50:00.000Z","invitedBy":{"username":"jo","name":"Jo"},"snoozedUntil":null},
                {"username":"no-id"}
            ],"later":{"x":1}}""",
        )
        assertEquals(listOf("pete", "ana", "troll"), people.members.map { it.username })
        assertEquals("pete", people.you?.username)
        assertEquals("pete", people.owner?.username)
        assertEquals(214, people.members[0].saves)
        assertEquals("ana", people.members[1].label)
        assertTrue(people.members[2].banned)
        assertTrue(people.isAdmin)
        assertTrue(people.canInvite)
        assertEquals("approve", people.inviteMode)
        assertEquals(1, people.requests.size)
        assertEquals("inv_1", people.requests[0].id)
        assertEquals("Jo", people.requests[0].invitedBy?.label)
    }

    @Test
    fun peopleForAMemberHasNoRequests() {
        val people = json.decodeFromString(
            PeopleResponse.serializer(),
            """{"members":[{"username":"ana","isYou":true}],"isAdmin":false,"canInvite":false,"inviteMode":"admin"}""",
        )
        assertFalse(people.isAdmin)
        assertEquals(emptyList<JoinRequest>(), people.requests)
        assertNull(people.owner)
    }

    @Test
    fun doingReadsItemsAndSummary() {
        val doing = json.decodeFromString(
            DoingResponse.serializer(),
            """{"items":[
                {"platform":"instagram","id":"C1","title":"Trying dark chocolate","network":"Instagram video",
                 "thumbnail":"/api/files/poster/1.jpg","openPath":"/p/instagram/C1",
                 "savers":[{"username":"mum","name":"Mum","avatarUrl":null,"savedAt":"2026-10-19T10:00:00Z","isYou":false}],
                 "savedAt":"2026-10-19T10:00:00Z","step":2,"stepLabel":"Keeping a copy","steps":7,"percent":62.5,
                 "status":"working","playable":false,"reason":null,"retryInfo":null,"quality":null,"learned":[],
                 "retry":false,"keepLinkOnly":false,"finishedAt":null},
                {"platform":"instagram","id":"C2","title":"Private one","step":2,"stepLabel":"Keeping a copy",
                 "status":"needs_you","reason":"It’s private on Instagram.","retry":true,"keepLinkOnly":true,
                 "retryInfo":{"attempt":3,"of":5,"at":"2026-10-19T10:05:00Z"}},
                {"platform":"","id":"x"},
                {"platform":"tiktok","id":"T1","status":"ready","step":7,"stepLabel":"Ready","quality":"4K",
                 "learned":["words","speech"],"finishedAt":"2026-10-19T10:01:00Z"}
            ],"summary":{"onTheirWay":2,"keeping":1,"learning":0,"needsYou":1,"ready":1,
                "freeBytes":123456789012,"processing":"remote","remoteConnected":false}}""",
        )
        assertEquals(listOf("C1", "C2", "T1"), doing.items.map { it.id })
        val first = doing.items[0]
        assertEquals(62.5, first.percent!!, 0.0)
        assertEquals("Mum", first.savers.single().label)
        assertFalse(first.needsYou)
        val stuck = doing.items[1]
        assertTrue(stuck.needsYou)
        assertTrue(stuck.retry)
        assertEquals(3, stuck.retryInfo?.attempt)
        assertTrue(doing.items[2].ready)
        assertEquals(listOf("words", "speech"), doing.items[2].learned)
        assertEquals(2, doing.summary.onTheirWay)
        assertEquals(1, doing.summary.needsYou)
        assertEquals("remote", doing.summary.processing)
        assertEquals(false, doing.summary.remoteConnected)
    }

    @Test
    fun emptyDoingFromAQuietServer() {
        val doing = json.decodeFromString(DoingResponse.serializer(), """{"items":[],"summary":{"onTheirWay":0,"freeBytes":null}}""")
        assertTrue(doing.items.isEmpty())
        assertEquals(0, doing.summary.onTheirWay)
        assertNull(doing.summary.freeBytes)
    }

    @Test
    fun feedReadsWhyReasonsAndNothingYet() {
        val page = json.decodeFromString(
            FeedResponse.serializer(),
            """{"items":[{"platform":"x","id":"1","why":"Ana and Ben saved this","whyReasons":[
                {"kind":"together","text":"Ana and Ben saved this","username":"ana"},
                {"kind":"like","text":"Like the frog video you kept"}
            ]}],"nextCursor":null,"caughtUp":false,"nothingYet":false}""",
        )
        val post = page.items.single()
        assertEquals("Ana and Ben saved this", post.headline)
        assertEquals(listOf("Ana and Ben saved this", "Like the frog video you kept"), post.reasons)
        assertFalse(page.nothingYet)

        val empty = json.decodeFromString(FeedResponse.serializer(), """{"items":[],"caughtUp":true,"nothingYet":true}""")
        assertTrue(empty.nothingYet)

        val older = json.decodeFromString(PhonePost.serializer(), """{"platform":"x","id":"2","why":["Fresh"]}""")
        assertEquals(listOf("Fresh"), older.reasons)
    }

    @Test
    fun letInSendsTheDecisionWithThePhoneKey() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"approval":"approved"}"""))
            val result = AdhxApi(server.url("/").toString(), "phone-key").decideJoin("inv 1/x", JoinDecision.APPROVE)
            assertEquals("approved", (result as ApiResult.Ok).value.approval)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/app/people/requests/inv%201%2Fx", request.path)
            assertEquals("Bearer phone-key", request.getHeader("Authorization"))
            assertEquals("""{"decision":"approve"}""", request.body.readUtf8())
        }
    }

    @Test
    fun notNowAndDeclineSendTheirWords() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"approval":"pending"}"""))
            server.enqueue(MockResponse().setBody("""{"approval":"declined"}"""))
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            assertEquals("pending", (api.decideJoin("a", JoinDecision.NOT_NOW) as ApiResult.Ok).value.approval)
            assertEquals("declined", (api.decideJoin("b", JoinDecision.DECLINE) as ApiResult.Ok).value.approval)
            assertEquals("""{"decision":"not_now"}""", server.takeRequest().body.readUtf8())
            assertEquals("""{"decision":"decline"}""", server.takeRequest().body.readUtf8())
        }
    }

    @Test
    fun decisionRefusalsCarryTheServerWords() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Only the admin can let people in.","code":"forbidden"}"""))
            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"Nobody is waiting with that invite.","code":"not_found"}"""))
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            val forbidden = api.decideJoin("a", JoinDecision.APPROVE) as ApiResult.Failed
            assertEquals(403, forbidden.status)
            assertEquals("forbidden", forbidden.code)
            assertEquals("Only the admin can let people in.", forbidden.message)
            val gone = api.decideJoin("b", JoinDecision.DECLINE) as ApiResult.Failed
            assertEquals(404, gone.status)
            assertEquals("not_found", gone.code)
        }
    }

    @Test
    fun peopleDoingAndRetryUseThePhoneRoutes() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"members":[],"isAdmin":false,"canInvite":true,"inviteMode":"anyone"}"""))
            server.enqueue(MockResponse().setBody("""{"items":[],"summary":{"onTheirWay":0}}"""))
            server.enqueue(MockResponse().setBody("""{"retried":true}"""))
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            assertTrue((api.people() as ApiResult.Ok).value.canInvite)
            assertTrue(api.doing() is ApiResult.Ok)
            assertTrue((api.retry("instagram", "C2") as ApiResult.Ok).value.retried)
            assertEquals("/api/app/people", server.takeRequest().path)
            assertEquals("/api/app/doing?scope=all", server.takeRequest().path)
            val retry = server.takeRequest()
            assertEquals("POST", retry.method)
            assertEquals("/api/app/doing/retry", retry.path)
            assertEquals("""{"platform":"instagram","id":"C2"}""", retry.body.readUtf8())
        }
    }

    @Test
    fun saveLeavesPrivateOutUnlessOnOrExplicit() = runBlocking {
        MockWebServer().use { server ->
            repeat(3) { server.enqueue(MockResponse().setBody("""{"platform":"x","id":"1"}""")) }
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            api.saveAndFollow("https://x.com/a/status/1", { 0L })
            api.saveAndFollow("https://x.com/a/status/1", { 0L }, justForMe = true)
            api.saveAndFollow("https://x.com/a/status/1", { 0L }, explicit = true)
            assertFalse(server.takeRequest().body.readUtf8().contains("private"))
            assertTrue(server.takeRequest().body.readUtf8().contains("\"private\":true"))
            assertTrue(server.takeRequest().body.readUtf8().contains("\"private\":false"))
        }
    }

    @Test
    fun avatarsGetThePhoneKeyOnlyFromTheConnectedServer() {
        MockWebServer().use { mine ->
            MockWebServer().use { other ->
                mine.enqueue(MockResponse().setBody("jpeg"))
                other.enqueue(MockResponse().setBody("jpeg"))
                val connection = Connection(server = mine.url("/").toString().trimEnd('/'), key = "phone-key")
                val client = OkHttpClient.Builder()
                    .addInterceptor(ServerAuthInterceptor { connection })
                    .build()
                client.newCall(Request.Builder().url(mine.url("/api/files/avatar/abc")).build()).execute().close()
                client.newCall(Request.Builder().url(other.url("/api/files/avatar/abc")).build()).execute().close()
                assertEquals("Bearer phone-key", mine.takeRequest().getHeader("Authorization"))
                assertNull(other.takeRequest().getHeader("Authorization"))
            }
        }
    }
}
