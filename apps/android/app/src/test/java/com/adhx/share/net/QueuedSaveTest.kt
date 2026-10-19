package com.adhx.share.net

import com.adhx.share.data.HistoryItem
import com.adhx.share.data.ShareState
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class QueuedSaveTest {
    @Test
    fun queueReceiptSurvivesHistorySerializationAndClearsOnSuccess() {
        val item = HistoryItem("history-id", "https://example.com/post", 0).queuedWith("receipt")
        val restored = AdhxApi.json.decodeFromString(HistoryItem.serializer(),
            AdhxApi.json.encodeToString(HistoryItem.serializer(), item))
        assertEquals("receipt", restored.queueId)
        assertEquals(ShareState.SAVING, restored.state)
        val saved = restored.savedWith(SaveResponse(platform = "youtube", id = "video"))
        assertEquals(ShareState.SAVED, saved.state)
        assertNull(saved.queueId)
        // History written by earlier versions still decodes.
        val old = AdhxApi.json.decodeFromString(HistoryItem.serializer(),
            """{"id":"old","link":"https://example.com","sharedAt":0}""",
        )
        assertNull(old.queueId)
    }

    @Test
    fun recordsReceiptBeforeFollowingAndResumesWithoutPostingAgain() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(202).setBody("""{"queued":true,"id":"receipt","state":"waiting"}"""))
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            var receipt: String? = null
            val waiting = api.saveAndFollow("https://example.com/post", { 0L }, limitMs = 0,
                onQueued = { receipt = it })
            assertEquals("receipt", receipt)
            assertEquals(AdhxApi.STILL_SAVING, (waiting as ApiResult.Failed).code)
            assertEquals("POST", server.takeRequest().method)
            server.enqueue(MockResponse().setBody("""{"id":"receipt","state":"saved","post":{"platform":"youtube","id":"video"}}"""))
            val saved = api.followQueued(receipt!!, { 0L }, limitMs = 1_000)
            assertEquals("video", (saved as ApiResult.Ok<SaveResponse>).value.id)
            val request = server.takeRequest()
            assertEquals("GET", request.method)
            assertEquals("/api/app/save?id=receipt", request.path)
            assertEquals(2, server.requestCount)
        }
    }

    @Test
    fun resumedReceiptReportsServerFailure() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"id":"receipt","state":"failed","code":"unavailable","error":"Gone"}"""))
            val result = AdhxApi(server.url("/").toString(), "phone-key").followQueued("receipt", { 0L }, 1_000)
            assertEquals("unavailable", (result as ApiResult.Failed).code)
            assertEquals("GET", server.takeRequest().method)
        }
    }
}
