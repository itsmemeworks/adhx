package com.adhx.share.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.HistoryStore
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

    override suspend fun doWork(): Result {
        val link = inputData.getString(SaveQueue.KEY_LINK) ?: return Result.failure()
        val itemId = inputData.getString(SaveQueue.KEY_ITEM)
        val history = HistoryStore.get(applicationContext)

        val connection = ConnectionStore.get(applicationContext).current()
        if (connection == null) {
            history.update(itemId) { it.copy(state = ShareState.FAILED, error = Copy.NOT_CONNECTED_TITLE) }
            return Result.failure()
        }

        // Queued on the server at once; follow it so the history shows how it
        // ended, but well inside WorkManager's 10 minutes: a stopped worker is
        // run again, and that would queue the link a second time.
        val follow = AdhxApi(connection).saveAndFollow(link, interval = { 5_000L }, limitMs = FOLLOW_MS)
        return when (val result = follow) {
            is ApiResult.Ok -> {
                history.update(itemId) { it.savedWith(result.value) }
                Result.success()
            }
            is ApiResult.Offline -> retryOrGiveUp(history, itemId)
            is ApiResult.Failed -> {
                if (result.code == AdhxApi.STILL_SAVING) {
                    // The server has it and carries on by itself.
                    Result.success()
                } else if (result.status in 200..499) {
                    history.update(itemId) {
                        it.copy(state = ShareState.FAILED, error = Copy.shareError(result.status, result.code, result.message))
                    }
                    Result.failure()
                } else {
                    retryOrGiveUp(history, itemId)
                }
            }
        }
    }

    private fun retryOrGiveUp(history: HistoryStore, itemId: String?): Result {
        if (runAttemptCount < MAX_ATTEMPTS) return Result.retry()
        history.update(itemId) { it.copy(state = ShareState.FAILED, error = Copy.GAVE_UP) }
        return Result.failure()
    }

    private companion object {
        /** With back-off capped at 5 hours, this is roughly a week of trying. */
        const val MAX_ATTEMPTS = 40

        const val FOLLOW_MS = 8 * 60 * 1_000L
    }
}
