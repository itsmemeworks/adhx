package com.adhx.share.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.HistoryStore
import com.adhx.share.data.HistoryWriteException
import com.adhx.share.data.ShareState
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.ui.Copy

/**
 * Sends one waiting link with `POST /api/app/save` once there's a network.
 * No answer or a 5xx: try again later (exponential back-off). A 4xx: the
 * server said no, so record why and stop.
 */
class SaveWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        deliver()
    } catch (_: HistoryWriteException) {
        // Keep the previous durable intent/receipt. Never send a choice that could not be persisted.
        if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()
    }

    private suspend fun deliver(): Result {
        if (inputData.getString(SaveQueue.KEY_LINK) == null) return Result.failure()
        val itemId = inputData.getString(SaveQueue.KEY_ITEM)
        val history = HistoryStore.get(applicationContext)

        val store = ConnectionStore.get(applicationContext)
        val connection = store.current()
        if (connection == null) {
            if (store.storageError.value != null) return Result.retry()
            history.update(itemId) { it.copy(state = ShareState.FAILED, error = Copy.NOT_CONNECTED_TITLE) }
            return Result.failure()
        }

        var item = history.find(itemId) ?: return Result.success()
        if (!store.ownsHistory(item, connection)) return Result.failure()
        // Upgrade offline history written by an older app before submitting it with deferPublish.
        if (item.postId == null && item.queueId == null && !item.publishPending) {
            history.update(itemId) { it.copy(publishPending = true,
                privateChoice = it.privateChoice ?: true.takeIf { _ -> it.isPrivate }) }
            item = history.find(itemId) ?: return Result.success()
        }
        if ((item.ownerServer != null && item.ownerServer != connection.server) ||
            (item.ownerUsername != null && item.ownerUsername != connection.username)) return Result.failure()
        val api = AdhxApi(connection)
        if (!item.publishPending && item.queueId == null && item.postId != null) return sendNote(api, history, itemId)
        val follow = QueuedSaveDelivery(api, { history.find(itemId) }, { change -> history.update(itemId, change) })
            .run(interval = { 1_500L }, limitMs = FOLLOW_MS)
        return when (val result = follow) {
            is ApiResult.Ok -> {
                history.update(itemId) { it.savedWith(result.value) }
                sendNote(api, history, itemId)
            }
            is ApiResult.Offline -> retryOrGiveUp(history, itemId)
            is ApiResult.Failed -> {
                if (result.code == AdhxApi.STILL_SAVING) {
                    // Keep the durable worker alive until deferred publication is acknowledged.
                    Result.retry()
                } else if (result.status == 408 || result.status == 425 || result.status == 429) {
                    retryOrGiveUp(history, itemId)
                } else if (result.status in 200..499) {
                    history.update(itemId) {
                        it.copy(state = ShareState.FAILED, errorStatus = result.status, errorCode = result.code,
                            // A rejected metadata job has no save left to publish. Keep acknowledgement
                            // failures durable when a post already exists.
                            publishPending = it.publishPending && it.postId != null,
                            queueId = it.queueId.takeIf { _ -> it.postId != null },
                            error = Copy.shareError(result.status, result.code, result.message))
                    }
                    Result.failure()
                } else {
                    retryOrGiveUp(history, itemId)
                }
            }
        }
    }

    /**
     * A note added on the share card after the save went out: sent once the
     * save is published (`POST /api/app/note`; on an older server, the save
     * again with `note` and its privacy said outright). A server that says no
     * drops the note; the save itself stays saved.
     */
    private suspend fun sendNote(api: AdhxApi, history: HistoryStore, itemId: String?): Result {
        val item = history.find(itemId) ?: return Result.success()
        val note = item.note?.takeIf { item.notePending && it.isNotBlank() } ?: return Result.success()
        val platform = item.platform
        val id = item.postId
        // The note endpoint when the server has it; an older one gets the save again with `note`.
        var sent: ApiResult<*> = if (platform != null && id != null) api.setNote(platform, id, note) else ApiResult.Failed(404, null, null)
        if (sent is ApiResult.Failed && (sent.status == 404 || sent.status == 405)) {
            sent = api.saveNote(item.link, note, justForMe = item.isPrivate)
        }
        return when (sent) {
            is ApiResult.Ok -> {
                history.update(itemId) { if (it.note == note) it.copy(notePending = false) else it }
                Result.success()
            }
            ApiResult.Offline -> if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.success()
            is ApiResult.Failed -> {
                if (sent.status == 408 || sent.status == 429 || sent.status >= 500) {
                    if (runAttemptCount < MAX_ATTEMPTS) return Result.retry()
                }
                history.update(itemId) { if (it.note == note) it.copy(notePending = false) else it }
                Result.success()
            }
        }
    }

    private fun retryOrGiveUp(history: HistoryStore, itemId: String?): Result {
        if (runAttemptCount < MAX_ATTEMPTS) {
            history.update(itemId) { it.copy(state = ShareState.QUEUED) }
            return Result.retry()
        }
        history.update(itemId) { it.copy(state = ShareState.FAILED, error = Copy.GAVE_UP) }
        return Result.failure()
    }

    private companion object {
        /** With back-off capped at 5 hours, this is roughly a week of trying. */
        const val MAX_ATTEMPTS = 40

        const val FOLLOW_MS = 8 * 60 * 1_000L
    }
}
