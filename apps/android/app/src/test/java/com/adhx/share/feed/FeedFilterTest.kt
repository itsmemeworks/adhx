package com.adhx.share.feed

import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.FeedMode
import com.adhx.share.net.FeedResponse
import com.adhx.share.net.MediaType
import com.adhx.share.net.PostKind
import com.adhx.share.ui.Copy
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedFilterTest {
    @Test
    fun defaultIsVideosAndPhotosAndKindsMapToTypes() {
        assertEquals(setOf("video", "photo"), MediaType.DEFAULT)
        assertEquals(MediaType.VIDEO, MediaType.of(PostKind.AUDIO))
        assertEquals(MediaType.TEXT, MediaType.of(PostKind.TEXT))
        assertEquals(MediaType.TEXT, MediaType.of("something new"))
        assertEquals(MediaType.ARTICLE, MediaType.of(PostKind.ARTICLE))
        assertEquals(MediaType.DEFAULT, MediaType.clean(listOf("nonsense")))
        assertEquals(setOf("text"), MediaType.clean(listOf("text", "gifs")))
    }

    @Test
    fun hiddenDecodesAsAMapOrAList() {
        val json = AdhxApi.json
        assertEquals(mapOf("text" to 4, "article" to 1), json.decodeFromString(FeedResponse.serializer(), """{"hidden":{"text":4,"article":1.0,"gifs":3,"photo":0}}""").hidden)
        assertEquals(mapOf("text" to 2), json.decodeFromString(FeedResponse.serializer(), """{"hidden":[{"type":"text","count":2},{"type":"x"}]}""").hidden)
        assertTrue(json.decodeFromString(FeedResponse.serializer(), """{"hidden":7}""").hidden.isEmpty())
        assertTrue(json.decodeFromString(FeedResponse.serializer(), "{}").hidden.isEmpty())
    }

    @Test
    fun hiddenOnlyCountsTypesStillOff() {
        val ui = FeedUi(types = setOf("video", "photo"), hiddenByServer = mapOf("text" to 3), hiddenHere = mapOf("text" to 1, "article" to 2, "video" to 5))
        assertEquals(mapOf("text" to 4, "article" to 2), ui.hidden)
        assertEquals("4 text posts and 2 articles waiting", Copy.hiddenLine(ui.hidden))
        assertEquals("1 text post waiting", Copy.hiddenLine(mapOf("text" to 1)))
        assertNull(Copy.hiddenLine(emptyMap()))
    }

    @Test
    fun feedSendsTypesAndTheFilterIsReadAndKept() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            api.feed(FeedMode.NEW, types = setOf("photo", "video"))
            assertEquals("/api/app/feed?mode=new&types=video%2Cphoto", server.takeRequest().path)

            server.enqueue(MockResponse().setBody("""{"types":["video","text"]}"""))
            assertEquals(listOf("video", "text"), (api.feedTypes() as ApiResult.Ok).value.types)
            assertEquals("/api/app/feed/types", server.takeRequest().path)

            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"Not here"}"""))
            assertEquals(404, (api.feedTypes() as ApiResult.Failed).status)
            server.takeRequest()

            server.enqueue(MockResponse().setResponseCode(204))
            assertTrue(api.setFeedTypes(setOf("text", "video")) is ApiResult.Ok)
            val put = server.takeRequest()
            assertEquals("PUT", put.method)
            assertEquals("""{"types":["video","text"]}""", put.body.readUtf8())
        }
    }
}
