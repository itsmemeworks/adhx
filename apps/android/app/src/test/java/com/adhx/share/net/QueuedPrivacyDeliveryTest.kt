package com.adhx.share.net

import com.adhx.share.data.HistoryItem
import com.adhx.share.data.HistoryWriteException
import com.adhx.share.work.QueuedSaveDelivery
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.atomic.AtomicReference

class QueuedPrivacyDeliveryTest {
    private fun restore(item: HistoryItem) = AdhxApi.json.decodeFromString(HistoryItem.serializer(),
        AdhxApi.json.encodeToString(HistoryItem.serializer(), item))
    private fun post(private: Boolean = true, repeat: Boolean = false) =
        """{"id":"receipt","state":"saved","post":{"platform":"youtube","id":"video","isPrivate":$private,"alreadySaved":$repeat}}"""
    private fun receipt() = MockResponse().setResponseCode(202).setBody("""{"id":"receipt","queued":true}""")
    private fun response(body: String) = MockResponse().setBody(body)
    private fun delivery(server: MockWebServer, state: AtomicReference<HistoryItem>) = QueuedSaveDelivery(
        AdhxApi(server.url("/").toString(), "phone-key"), { state.get() }, { f -> state.updateAndGet(f) })

    @Test fun inFlightToggleIsAcknowledgedBeforeSaveFinishes() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0, publishPending = true))
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse = when (request.method) {
                    "POST" -> { state.updateAndGet { restore(it.choosePrivate(true)) }; receipt() }
                    "PATCH" -> response("{\"ok\":true}")
                    else -> response(post())
                }
            }
            assertTrue(delivery(server, state).run({ 0L }, 1000) is ApiResult.Ok)
            val started = server.takeRequest()
            assertTrue(started.body.readUtf8().contains("\"deferPublish\":true"))
            assertEquals("GET", server.takeRequest().method)
            val ack = server.takeRequest()
            assertEquals("PATCH", ack.method)
            assertEquals("{\"id\":\"receipt\",\"private\":true,\"intentVersion\":2}", ack.body.readUtf8())
            assertFalse(state.get().publishPending)
            assertTrue(state.get().isPrivate)
            assertNull(state.get().queueId)
        }
    }

    @Test fun failedAcknowledgementRestartsFromReceiptWithoutAnotherPost() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                publishPending = true, privateChoice = true))
            server.enqueue(receipt()); server.enqueue(response(post()))
            server.enqueue(MockResponse().setResponseCode(503))
            assertEquals(ApiResult.Offline, delivery(server, state).run({ 0L }, 1000))
            assertTrue(state.get().publishPending)
            assertEquals("receipt", state.get().queueId)
            // Simulate losing every in-memory object when the share sheet/process closes.
            val restored = AtomicReference(restore(state.get()))
            server.enqueue(response("{\"ok\":true}")); server.enqueue(response(post()))
            assertTrue(delivery(server, restored).run({ 0L }, 1000) is ApiResult.Ok)
            val requests = (1..server.requestCount).map { server.takeRequest().method }
            assertEquals(listOf("POST", "GET", "PATCH", "PATCH", "GET"), requests)
            assertFalse(restored.get().publishPending)
        }
    }

    @Test fun secondToggleDuringAcknowledgementIsNotLost() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                queueId = "receipt", postId = "video", platform = "youtube", publishPending = true, privateChoice = false))
            var patches = 0
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    if (request.method == "PATCH") {
                        if (++patches == 1) state.updateAndGet { restore(it.choosePrivate(true)) }
                        return response("{\"ok\":true}")
                    }
                    return response(post())
                }
            }
            assertTrue(delivery(server, state).run({ 0L }, 1000) is ApiResult.Ok)
            assertTrue(server.takeRequest().body.readUtf8().contains("\"private\":false"))
            assertTrue(server.takeRequest().body.readUtf8().contains("\"private\":true"))
            assertFalse(state.get().publishPending)
            assertTrue(state.get().isPrivate)
        }
    }

    @Test fun untouchedFalseDefaultPreservesPrivateRepeatButExplicitFalseChangesIt() {
        val repeat = SaveResponse(platform = "youtube", id = "video", alreadySaved = true, isPrivate = true)
        val item = HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0, privateDefault = false, publishPending = true)
        assertNull(item.publicationChoice(repeat))
        assertEquals(false, item.publicationChoice(repeat.copy(alreadySaved = false)))
        assertEquals(false, restore(item.choosePrivate(false)).publicationChoice(repeat))
        assertEquals(true, item.copy(privateDefault = true).publicationChoice(repeat))
        assertNull(item.copy(privateDefault = null).publicationChoice(repeat.copy(alreadySaved = false)))
    }

    @Test fun omittedChoiceRemainsOmittedAtAcknowledgement() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                queueId = "receipt", publishPending = true, privateDefault = false))
            server.enqueue(response(post(repeat = true))); server.enqueue(response("{\"ok\":true}"))
            server.enqueue(response(post(repeat = true)))
            assertTrue(delivery(server, state).run({ 0L }, 1000) is ApiResult.Ok)
            assertEquals("GET", server.takeRequest().method)
            assertEquals("{\"id\":\"receipt\",\"intentVersion\":1}", server.takeRequest().body.readUtf8())
            assertTrue(state.get().isPrivate)
        }
    }

    @Test fun completedMetadataStillRequiresPendingAcknowledgementAndCannotBeFinal() {
        val item = HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0, queueId = "receipt",
            publishPending = true, privateChoice = false, keep = KeepStatus.KEPT)
            .savedWith(SaveResponse(platform = "youtube", id = "video", isPrivate = true))
        assertEquals("receipt", restore(item).queueId)
        assertFalse(item.isFinal)
        assertFalse(item.isPrivate)
    }

    @Test fun refreshingAfterAcknowledgementFailureNeverRepeatsExplicitChange() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                queueId = "receipt", postId = "video", platform = "youtube", publishPending = true, privateChoice = false))
            server.enqueue(response("{\"ok\":true}")); server.enqueue(MockResponse().setResponseCode(503))
            assertEquals(ApiResult.Offline, delivery(server, state).run({ 0L }, 1000))
            assertFalse(state.get().publishPending)
            assertEquals("receipt", state.get().queueId)
            val restored = AtomicReference(restore(state.get()))
            // A later web private change must not be undone by retrying a completed acknowledgement.
            server.enqueue(response(post(private = true)))
            assertTrue(delivery(server, restored).run({ 0L }, 1000) is ApiResult.Ok)
            assertEquals(listOf("PATCH", "GET", "GET"), (1..3).map { server.takeRequest().method })
            assertTrue(restored.get().isPrivate)
        }
    }
    @Test fun lostAcceptedResponseRetainsVersionAcrossRestartAndCannotUndoLaterWebPrivacy() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                queueId = "receipt", postId = "video", platform = "youtube", publishPending = true, privateChoice = false))
            var accepted = 0L
            var serverPrivate = true
            var first = true
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    if (request.method == "PATCH") {
                        val body = AdhxApi.json.parseToJsonElement(request.body.readUtf8()).jsonObject
                        val version = body.getValue("intentVersion").jsonPrimitive.long
                        if (version > accepted) { accepted = version; serverPrivate = false }
                        if (first) { first = false; return MockResponse().setResponseCode(503) }
                        return response("{\"ok\":true}")
                    }
                    return response(post(private = serverPrivate))
                }
            }
            assertEquals(ApiResult.Offline, delivery(server, state).run({ 0L }, 1000))
            assertEquals(1L, state.get().privacyIntentVersion)
            serverPrivate = true // A newer manual choice after the server accepted the first ACK.
            val restored = AtomicReference(restore(state.get()))
            assertTrue(delivery(server, restored).run({ 0L }, 1000) is ApiResult.Ok)
            assertEquals(1L, accepted)
            assertTrue(serverPrivate)
            assertTrue(restored.get().isPrivate)
            assertEquals(1L, restored.get().privacyIntentVersion)
            assertFalse(restored.get().publishPending)
        }
    }

    @Test fun lostInitialResponseRetriesSameDurableRequestIdAcrossRestart() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                publishPending = true, privateDefault = false))
            server.enqueue(MockResponse().setResponseCode(503)) // Accepted upstream, reply lost.
            assertEquals(ApiResult.Offline, delivery(server, state).run({ 0L }, 1000))
            assertNull(state.get().queueId)
            val first = AdhxApi.json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
            val restored = AtomicReference(restore(state.get()))
            server.enqueue(receipt()); server.enqueue(response(post()))
            server.enqueue(response("{\"ok\":true}")); server.enqueue(response(post(private = false)))
            assertTrue(delivery(server, restored).run({ 0L }, 1000) is ApiResult.Ok)
            val again = AdhxApi.json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
            assertEquals(first["requestId"], again["requestId"])
            assertEquals(state.get().id, again["requestId"]!!.jsonPrimitive.content)
            assertFalse(restored.get().alreadySaved)
            assertFalse(restored.get().isPrivate)
        }
    }

    @Test fun failedReceiptPersistenceCannotPublishAndResumesSameRequestOnceStorageRecovers() = runBlocking {
        MockWebServer().use { server ->
            val state = AtomicReference(HistoryItem("11111111-1111-4111-8111-111111111111", "https://example.com/post", 0,
                publishPending = true, privateChoice = true))
            server.enqueue(receipt())
            val blocked = QueuedSaveDelivery(AdhxApi(server.url("/").toString(), "phone-key"),
                { state.get() }, { _ -> throw HistoryWriteException() })
            try {
                blocked.run({ 0L }, 1000)
                fail("Receipt persistence failure must stop before acknowledging publication")
            } catch (_: HistoryWriteException) { }
            assertEquals(1, server.requestCount)
            assertNull(state.get().queueId)
            val first = AdhxApi.json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
            server.enqueue(receipt()); server.enqueue(response(post()))
            server.enqueue(response("{\"ok\":true}")); server.enqueue(response(post()))
            assertTrue(delivery(server, state).run({ 0L }, 1000) is ApiResult.Ok)
            val recovered = AdhxApi.json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
            assertEquals(first["requestId"], recovered["requestId"])
            assertTrue(state.get().isPrivate)
        }
    }

}
