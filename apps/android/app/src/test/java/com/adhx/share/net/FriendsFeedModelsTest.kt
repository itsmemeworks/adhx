package com.adhx.share.net

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FriendsFeedModelsTest {
    private val json = AdhxApi.json

    @Test
    fun phonePostReadsSaversAndPrivate() {
        val post = json.decodeFromString(
            PhonePost.serializer(),
            """{"platform":"reddit","id":"1","kind":"video","savers":[
                {"username":"ana","name":"Ana","avatarUrl":"/api/avatars/ana","savedAt":"2026-10-19T10:00:00Z","isYou":false},
                {"username":"pete","name":null,"avatarUrl":null,"savedAt":"2026-10-19T09:00:00Z","isYou":true}
            ],"isPrivate":true,"somethingNew":{"x":1}}""",
        )
        assertEquals(2, post.savers.size)
        assertEquals("Ana", post.savers[0].label)
        assertEquals("/api/avatars/ana", post.savers[0].avatarUrl)
        assertEquals("pete", post.savers[1].label)
        assertTrue(post.savers[1].isYou)
        assertTrue(post.isPrivate)
        assertTrue(post.yours)
    }

    @Test
    fun phonePostFromAnOlderServerHasNoSaversAndIsShared() {
        val post = json.decodeFromString(PhonePost.serializer(), """{"platform":"x","id":"2"}""")
        assertEquals(emptyList<Saver>(), post.savers)
        assertFalse(post.isPrivate)
        assertFalse(post.yours)
        assertEquals(emptyList<String>(), post.why)
    }

    @Test
    fun saverWithOnlyAUsernameAndNulls() {
        val saver = json.decodeFromString(Saver.serializer(), """{"username":"jo","name":null,"avatarUrl":null,"isYou":null}""")
        assertEquals("jo", saver.label)
        assertNull(saver.savedAt)
        assertFalse(saver.isYou)
    }

    @Test
    fun whyReadsALineAListOrObjects() {
        fun why(value: String) = json.decodeFromString(PhonePost.serializer(), """{"platform":"x","id":"1","why":$value}""").why
        assertEquals(listOf("Ana and Ben saved this"), why("\"Ana and Ben saved this\""))
        assertEquals(listOf("Saved together", "Close to you"), why("""["Saved together","Close to you"]"""))
        assertEquals(listOf("Like the frog video you kept"), why("""[{"kind":"like","text":"Like the frog video you kept"}]"""))
        assertEquals(listOf("Fresh"), why("""{"reasons":["Fresh"]}"""))
        assertEquals(emptyList<String>(), why("null"))
        assertEquals(emptyList<String>(), why("42"))
    }

    @Test
    fun feedPageWithMissingFieldsAndABadItem() {
        val page = json.decodeFromString(
            FeedResponse.serializer(),
            """{"items":[{"platform":"x","id":"1","why":"Fresh"},"not a post",{"platform":"","id":""},{"platform":"tiktok","id":"2","kind":7}]}""",
        )
        // The string and the blank one are dropped; a wrong type keeps the rest of the page.
        assertEquals(listOf("x:1"), page.items.map { it.key }.take(1))
        assertTrue(page.items.size in 1..2)
        assertNull(page.nextCursor)
        assertFalse(page.caughtUp)

        val end = json.decodeFromString(FeedResponse.serializer(), """{"items":[],"nextCursor":null,"caughtUp":true}""")
        assertTrue(end.caughtUp)
        assertTrue(end.items.isEmpty())

        val empty = json.decodeFromString(FeedResponse.serializer(), "{}")
        assertTrue(empty.items.isEmpty())
    }

    @Test
    fun wrappedMomentItemsAreUnwrapped() {
        val detail = json.decodeFromString(
            LiveDetail.serializer(),
            """{"moment":{"slug":"babies","title":"Babies vs objects","people":3,"watching":2},
                "items":[{"post":{"platform":"reddit","id":"9","kind":"video"},"savedAt":"2026-10-19T10:00:00Z","people":2}],
                "watchers":[{"username":"ana","name":"Ana","savedAt":"","isYou":false}]}""",
        )
        assertEquals("Babies vs objects", detail.moment?.label)
        assertEquals("reddit:9", detail.items.single().key)
        assertEquals("2026-10-19T10:00:00Z", detail.items.single().savedAt)
        assertEquals("Ana", detail.watchers?.single()?.label)

        val bare = json.decodeFromString(LiveDetail.serializer(), """{"items":[]}""")
        assertNull(bare.moment)
        assertNull(bare.watchers)
    }

    @Test
    fun channelsWithMissingRowsAndCoversAsPosts() {
        val channels = json.decodeFromString(
            ChannelsResponse.serializer(),
            """{"group":[{"slug":"cats","name":"Cats with opinions","size":38,
                  "covers":["/api/files/a.jpg",{"media":[{"kind":"video","url":"/v.mp4","posterUrl":"/p.jpg"}]},{"posterUrl":"/q.jpg"},7]}],
                "friends":[{"username":"ana","name":"Ana","avatarUrl":null,"size":96,"newCount":4,"covers":[]}]}""",
        )
        val cats = channels.group.single()
        assertEquals(listOf("/api/files/a.jpg", "/p.jpg", "/q.jpg"), cats.covers)
        assertTrue(cats.savers.isEmpty())
        assertEquals(4, channels.friends.single().newCount)
        assertEquals("ana", channels.friends.single().asSaver.username)
        assertTrue(channels.mine.isEmpty())

        val friendOnly = json.decodeFromString(FriendChannel.serializer(), """{"username":"ben"}""")
        assertEquals(0, friendOnly.newCount)
        assertEquals("ben", friendOnly.label)
    }

    @Test
    fun liveMomentsDecodeLoosely() {
        val live = json.decodeFromString(
            LiveResponse.serializer(),
            """{"label":"Right now","moments":[
                {"slug":"a","name":"Babies vs objects","people":3,"watching":3,"watchers":[{"username":"ana"}],"covers":["/c.jpg"],"live":true,"hue":"#fff"},
                {"slug":"b","title":"Sunday roast energy","covers":[{"platform":"x","id":"1","media":[{"kind":"photo","url":"/photo.jpg"}]}]}
            ],"forming":[]}""",
        )
        assertEquals(2, live.moments.size)
        assertEquals("Babies vs objects", live.moments[0].label)
        assertEquals("Sunday roast energy", live.moments[1].label)
        assertEquals(listOf("/photo.jpg"), live.moments[1].covers)
        assertTrue(live.moments[1].live)
        assertEquals(0, live.moments[1].watching)
        assertTrue(json.decodeFromString(LiveResponse.serializer(), "{}").moments.isEmpty())
    }

    @Test
    fun liveReactionsDecodeFlatOrNestedAndSkipEmptyOnes() {
        val detail = json.decodeFromString(
            LiveDetail.serializer(),
            """{"items":[],"reactions":[
                {"id":"r1","emoji":"🔥","username":"ana","name":"Ana","avatarUrl":"/a.png","at":"2026-10-19T19:00:00Z"},
                {"id":7,"text":"who sent this 💀","by":{"username":"jo","name":"Jo","isYou":false}},
                {"emoji":"😂","user":{"username":"pete","isYou":true},"createdAt":"2026-10-19T19:00:01Z"},
                {"id":"r4","username":"ben"},
                "nonsense"
            ]}""",
        )
        val r = detail.reactions
        assertEquals(3, r.size)
        assertEquals("r1", r[0].key)
        assertEquals("🔥", r[0].emoji)
        assertEquals("Ana", r[0].who?.label)
        assertEquals("/a.png", r[0].who?.avatarUrl)
        assertEquals("7", r[1].key)
        assertEquals("who sent this 💀", r[1].text)
        assertEquals("jo", r[1].who?.username)
        assertTrue(r[2].who?.isYou == true)
        assertEquals("pete|😂|null|2026-10-19T19:00:01Z", r[2].key)
        // Older servers send no reactions at all.
        assertTrue(json.decodeFromString(LiveDetail.serializer(), """{"items":[]}""").reactions.isEmpty())
    }

    @Test
    fun liveReactionsInTheServersShape() {
        val detail = json.decodeFromString(
            LiveDetail.serializer(),
            """{"moment":{"slug":"b"},"items":[],"watchers":[],"reactions":[
                {"id":"a1","at":"2026-10-19T20:00:00Z","saver":{"username":"ana","name":"Ana","avatarUrl":"/api/avatars/ana","savedAt":"2026-10-19T19:00:00Z","isYou":false},"emoji":"😂","post":{"platform":"x","id":"1"}},
                {"id":"a2","at":"2026-10-19T20:00:02Z","saver":{"username":"pete","name":null,"avatarUrl":null,"savedAt":"2026-10-19T19:00:00Z","isYou":true},"text":"again","post":{"platform":"x","id":"1"}}
            ]}""",
        )
        assertEquals(listOf("a1", "a2"), detail.reactions.map { it.key })
        assertEquals("Ana", detail.reactions[0].who?.label)
        assertEquals("/api/avatars/ana", detail.reactions[0].who?.avatarUrl)
        assertEquals("😂", detail.reactions[0].emoji)
        assertTrue(detail.reactions[1].who?.isYou == true)
        assertEquals("again", detail.reactions[1].text)
    }

    @Test
    fun saveSendsPrivateOnlyWhenOn() {
        val off = json.encodeToString(SaveRequest.serializer(), SaveRequest("https://x.com/a/status/1"))
        assertFalse(off.contains("private"))
        val on = json.encodeToString(SaveRequest.serializer(), SaveRequest("https://x.com/a/status/1", isPrivate = true))
        assertTrue(on.contains("\"private\":true"))
        val answer = json.decodeFromString(SaveResponse.serializer(), """{"platform":"x","id":"1","isPrivate":true}""")
        assertTrue(answer.isPrivate)
        assertFalse(json.decodeFromString(SaveResponse.serializer(), """{"platform":"x","id":"1"}""").isPrivate)
        assertEquals(
            """{"platform":"x","id":"1","private":false}""",
            json.encodeToString(PrivateRequest.serializer(), PrivateRequest("x", "1", false)),
        )
    }

    @Test
    fun endpointsSendTheContractShapes() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")

            server.enqueue(MockResponse().setResponseCode(204))
            assertTrue(api.seen(listOf(PostRef("x", "1"), PostRef("tiktok", "2"))) is ApiResult.Ok)
            val seen = server.takeRequest()
            assertEquals("POST", seen.method)
            assertEquals("/api/app/seen", seen.path)
            assertEquals("""{"posts":[{"platform":"x","id":"1"},{"platform":"tiktok","id":"2"}]}""", seen.body.readUtf8())
            assertEquals("Bearer phone-key", seen.getHeader("Authorization"))

            server.enqueue(MockResponse().setBody("""{"items":[],"nextCursor":"abc","caughtUp":false}"""))
            assertEquals("abc", (api.feed(FeedMode.NEW) as ApiResult.Ok).value.nextCursor)
            assertEquals("/api/app/feed?mode=new", server.takeRequest().path)

            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            api.feed(FeedMode.FRIENDS, "abc")
            assertEquals("/api/app/feed?mode=friends&cursor=abc", server.takeRequest().path)

            // A server without the feed yet.
            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"Not found"}"""))
            assertEquals(404, (api.feed(FeedMode.NEW) as ApiResult.Failed).status)
            server.takeRequest()

            server.enqueue(MockResponse().setBody("""{"private":true}"""))
            assertEquals(true, (api.setPrivate("x", "1", true) as ApiResult.Ok).value)
            val priv = server.takeRequest()
            assertEquals("/api/app/private", priv.path)
            assertEquals("""{"platform":"x","id":"1","private":true}""", priv.body.readUtf8())

            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            api.search("sauce", scope = SearchScope.EVERYONE)
            assertEquals("/api/app/search?q=sauce&offset=0&scope=everyone", server.takeRequest().path)

            server.enqueue(MockResponse().setBody("""{"items":[{"platform":"x","id":"1"}]}"""))
            assertEquals(1, (api.channel(ChannelKind.GROUP, "cats & dogs") as ApiResult.Ok).value.items.size)
            assertEquals("/api/app/channels/group/cats%20&%20dogs", server.takeRequest().path)

            server.enqueue(MockResponse().setResponseCode(204))
            assertTrue(api.react("babies", "x", "1", emoji = "🔥") is ApiResult.Ok)
            val react = server.takeRequest()
            assertEquals("/api/app/live/babies/react", react.path)
            assertEquals("""{"emoji":"🔥","platform":"x","id":"1"}""", react.body.readUtf8())

            server.enqueue(MockResponse().setResponseCode(204))
            api.react("babies", "x", "1", text = "  who sent this, and why is it so good, honestly  ")
            assertEquals(
                """{"text":"who sent this, and why is it so good, ho","platform":"x","id":"1"}""",
                server.takeRequest().body.readUtf8(),
            )

            server.enqueue(MockResponse().setBody("""{"id":"q","state":"waiting"}""").setResponseCode(202))
            api.saveAndFollow("https://x.com/a/status/1", { 0L }, limitMs = 0, justForMe = true)
            assertEquals("""{"url":"https://x.com/a/status/1","private":true}""", server.takeRequest().body.readUtf8())
        }
    }
}
