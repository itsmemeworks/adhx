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

        return when (val result = AdhxApi(connection).save(link)) {
            is ApiResult.Ok -> {
                history.update(itemId) { it.savedWith(result.value) }
                Result.success()
            }
            is ApiResult.Offline -> retryOrGiveUp(history, itemId)
            is ApiResult.Failed -> {
                if (result.status in 400..499) {
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
    }
}
