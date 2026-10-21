package com.adhx.share.net

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The shapes of the apps-without-the-web routes (picture, invites, email sign-in, reactions feed). */
class WithoutWebModelsTest {
    private val json = AdhxApi.json

    @Test
    fun meSaysWhereYourPictureComesFrom() {
        val me = json.decodeFromString(MeResponse.serializer(), """{"username":"pete","avatarUrl":"/api/avatars/ab.jpg","avatarSource":"upload"}""")
        assertEquals("upload", me.avatarSource)
        val old = json.decodeFromString(MeResponse.serializer(), """{"username":"pete"}""")
        assertNull(old.avatarSource)
        assertNull(old.avatarUrl)
    }

    @Test
    fun avatarBodies() {
        assertEquals("""{"source":"gob","colour":"teal"}""", json.encodeToString(AvatarRequest.serializer(), AvatarRequest("gob", "teal")))
        assertEquals("""{"source":"x"}""", json.encodeToString(AvatarRequest.serializer(), AvatarRequest("x")))
        val changed = json.decodeFromString(AvatarResponse.serializer(), """{"avatarUrl":"/api/avatars/cd.jpg","source":"gob"}""")
        assertEquals("/api/avatars/cd.jpg", changed.avatarUrl)
        val removed = json.decodeFromString(AvatarResponse.serializer(), """{"avatarUrl":null,"source":"generated"}""")
        assertNull(removed.avatarUrl)
        assertEquals(AvatarSource.GENERATED, removed.source)
    }

    @Test
    fun invitesReadLoosely() {
        val list = json.decodeFromString(
            InvitesResponse.serializer(),
            """{"invites":[
                {"id":"a1","url":"https://adhx.example/invite/t1","createdAt":"2026-10-20T10:00:00.000Z","expiresAt":"2026-10-27T10:00:00.000Z","uses":0},
                {"id":"b2","createdAt":1792490400000,"expiresAt":"2026-10-28T10:00:00.000Z"},
                {"url":"no id"},
                "junk"
            ]}""",
        )
        assertEquals(listOf("a1", "b2"), list.invites.map { it.id })
        assertEquals("https://adhx.example/invite/t1", list.invites[0].url)
        // A list may leave the link out (the server can keep only its hash); a number time reads as ISO.
        assertNull(list.invites[1].url)
        assertEquals("2026-10-20T10:00:00Z", list.invites[1].createdAt)
        val made = json.decodeFromString(CreatedInvite.serializer(), """{"id":"c3","url":"https://adhx.example/invite/t3","expiresAt":"2026-10-28T10:00:00.000Z"}""")
        assertEquals("https://adhx.example/invite/t3", made.url)
    }

    @Test
    fun signInBodies() {
        assertEquals("""{"email":"ana@example.com","name":"Pixel 9"}""", json.encodeToString(SignInRequest.serializer(), SignInRequest("ana@example.com", "Pixel 9")))
        assertEquals("""{"email":"ana@example.com","code":"123456"}""", json.encodeToString(SignInVerifyRequest.serializer(), SignInVerifyRequest("ana@example.com", "123456")))
    }

    @Test
    fun reactedPostsCarryTheirLastReaction() {
        val page = json.decodeFromString(
            ReactedResponse.serializer(),
            """{"items":[
                {"platform":"twitter","id":"1","kind":"video","reactions":{"count":3,"last":{"emoji":"😂","text":null,"at":"2026-10-21T09:00:00Z","saver":{"username":"ben","name":"Ben","avatarUrl":"/api/avatars/b.jpg","isYou":false}}}},
                {"platform":"tiktok","id":"2","reactions":{"count":1,"last":{"emoji":null,"text":"so good","at":"2026-10-21T08:00:00Z","saver":{"username":"pete","isYou":true}}}},
                {"platform":"youtube","id":"3","reactions":[1,2]}
            ],"nextOffset":3}""",
        )
        assertEquals(3, page.nextOffset)
        val first = page.items[0].reactions!!
        assertEquals(3, first.count)
        assertEquals("😂", first.last?.emoji)
        assertEquals("Ben", first.last?.saver?.label)
        assertEquals("/api/avatars/b.jpg", first.last?.saver?.avatarUrl)
        val second = page.items[1].reactions!!.last!!
        assertNull(second.emoji)
        assertEquals("so good", second.text)
        assertTrue(second.saver!!.isYou)
        // Another shape never fails the post.
        assertNull(page.items[2].reactions)
        val last = json.decodeFromString(ReactedResponse.serializer(), """{"items":[],"nextOffset":null}""")
        assertNull(last.nextOffset)
    }

    @Test
    fun aPhotoGoesAsMultipartWithTheCrop() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"avatarUrl":"/api/avatars/new.jpg","source":"upload"}"""))
            val bytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 1, 2, 3)
            val result = AdhxApi(server.url("/").toString(), "phone-key").uploadAvatar(bytes)
            assertEquals("/api/avatars/new.jpg", (result as ApiResult.Ok).value.avatarUrl)
            val request = server.takeRequest()
            assertEquals("/api/app/me/avatar", request.path)
            assertEquals("POST", request.method)
            assertEquals("Bearer phone-key", request.getHeader("Authorization"))
            assertTrue(request.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
            val body = request.body.readUtf8()
            assertTrue(body.contains("name=\"file\"; filename=\"picture.jpg\""))
            assertTrue(body.contains("Content-Type: image/jpeg"))
            assertTrue(Regex("name=\"x\"\r\n(?:[^\r\n]+\r\n)*\r\n0[.]5\r\n").containsMatchIn(body))
            assertTrue(Regex("name=\"y\"\r\n(?:[^\r\n]+\r\n)*\r\n0[.]5\r\n").containsMatchIn(body))
            assertTrue(Regex("name=\"zoom\"\r\n(?:[^\r\n]+\r\n)*\r\n1[.]0\r\n").containsMatchIn(body))
        }
    }

    @Test
    fun noXPhotoIsAnError() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":"Connect X first to use your X picture.","code":"no_x_picture"}"""))
            val result = AdhxApi(server.url("/").toString(), "k").setAvatar(AvatarRequest(AvatarSource.X))
            assertEquals("no_x_picture", (result as ApiResult.Failed).code)
            assertEquals("""{"source":"x"}""", server.takeRequest().body.readUtf8())
        }
    }

    @Test
    fun removingAPictureIsADelete() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"avatarUrl":null,"source":"generated"}"""))
            val result = AdhxApi(server.url("/").toString(), "k").removeAvatar()
            assertNull((result as ApiResult.Ok).value.avatarUrl)
            assertEquals("DELETE", server.takeRequest().method)
        }
    }

    @Test
    fun emailSignInSendsNoKey() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            server.enqueue(MockResponse().setResponseCode(201).setBody("""{"key":"adhx_phone_abc","username":"ana","name":"Pixel"}"""))
            val api = AdhxApi(server.url("/").toString(), null)
            assertTrue(api.signIn("ana@example.com", "Pixel") is ApiResult.Ok)
            val verified = api.verifySignIn("ana@example.com", "123456", "Pixel")
            assertEquals("adhx_phone_abc", (verified as ApiResult.Ok).value.key)
            val first = server.takeRequest()
            assertEquals("/api/app/signin", first.path)
            assertNull(first.getHeader("Authorization"))
            val second = server.takeRequest()
            assertEquals("/api/app/signin/verify", second.path)
            assertEquals("""{"email":"ana@example.com","code":"123456","name":"Pixel"}""", second.body.readUtf8())
        }
    }

    @Test
    fun invitesAndTheReactedFeedUseTheirRoutes() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"i1","url":"https://a/invite/x","expiresAt":"2026-10-28T00:00:00Z"}"""))
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            server.enqueue(MockResponse().setBody("""{"items":[],"nextOffset":null}"""))
            val api = AdhxApi(server.url("/").toString(), "k")
            assertEquals("i1", (api.createInvite() as ApiResult.Ok).value.id)
            assertTrue(api.revokeInvite("i1") is ApiResult.Ok)
            assertTrue(api.reacted(40, limit = 500) is ApiResult.Ok)
            assertEquals("POST /api/app/invites", server.takeRequest().let { "${it.method} ${it.path}" })
            assertEquals("DELETE /api/app/invites/i1", server.takeRequest().let { "${it.method} ${it.path}" })
            // The server's limit is 50.
            assertEquals("/api/app/reacted?offset=40&limit=50", server.takeRequest().path)
        }
    }

    @Test
    fun theServersInviteListHasNoLinks() {
        val list = json.decodeFromString(
            InvitesResponse.serializer(),
            """{"canInvite":false,"invites":[{"id":"a1","url":null,"code":"ABCD-EFGH","nameHint":"Mum","createdAt":"2026-10-20T10:00:00.000Z","expiresAt":"2026-10-27T10:00:00.000Z","uses":0}]}""",
        )
        assertEquals(false, list.canInvite)
        assertNull(list.invites.single().url)
        assertEquals("ABCD-EFGH", list.invites.single().code)
        assertEquals("Mum", list.invites.single().nameHint)
    }

    @Test
    fun shareAgainMakesAFreshLink() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"id":"a1","url":"https://a/invite/new","expiresAt":"2026-10-27T10:00:00.000Z"}"""))
            val result = AdhxApi(server.url("/").toString(), "k").renewInvite("a1")
            assertEquals("https://a/invite/new", (result as ApiResult.Ok).value.url)
            assertEquals("POST /api/app/invites/a1/link", server.takeRequest().let { "${it.method} ${it.path}" })
        }
    }

    @Test
    fun signInsNoEmailIsAnAnswerNotOffline() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(503).setBody("""{"error":"No email here.","code":"no_email"}"""))
            server.enqueue(MockResponse().setResponseCode(503).setBody("<html>Service Unavailable</html>"))
            val api = AdhxApi(server.url("/").toString(), null)
            assertEquals("no_email", (api.signIn("ana@example.com", null) as ApiResult.Failed).code)
            // A 503 that isn't the server's answer still reads as offline.
            assertEquals(ApiResult.Offline, api.signIn("ana@example.com", null))
        }
    }

    @Test
    fun theReactedFeedSaysItsTotal() {
        val page = json.decodeFromString(ReactedResponse.serializer(), """{"items":[],"nextOffset":30,"total":42}""")
        assertEquals(42, page.total)
    }

    @Test
    fun aPostWithoutReactionsHasNone() {
        val post = json.decodeFromString(PhonePost.serializer(), """{"platform":"x","id":"1"}""")
        assertNull(post.reactions)
        assertFalse(post.key.isEmpty())
    }
}
