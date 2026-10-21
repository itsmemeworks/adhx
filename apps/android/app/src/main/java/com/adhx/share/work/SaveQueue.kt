package com.adhx.share.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.adhx.share.data.HistoryStore
import com.adhx.share.data.ShareState
import java.util.concurrent.TimeUnit

/** Durable delivery and privacy acknowledgements, including shares started while online. */
object SaveQueue {

    const val TAG = "adhx-save"
    const val KEY_LINK = "link"
    const val KEY_ITEM = "item"
    const val KEY_PRIVATE = "private"

    /**
     * One chain per history item. An edit appends behind an in-flight request,
     * so cancelling work can never discard an arriving server receipt.
     */
    fun enqueue(
        context: Context,
        link: String,
        itemId: String?,
        policy: ExistingWorkPolicy = ExistingWorkPolicy.APPEND_OR_REPLACE,
        justForMe: Boolean = false,
    ) {
        val request = OneTimeWorkRequestBuilder<SaveWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setInputData(workDataOf(KEY_LINK to link, KEY_ITEM to itemId, KEY_PRIVATE to justForMe))
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(workName(itemId ?: link), policy, request)
    }

    /** "Send waiting links now": start each waiting link over, without the back-off wait. */
    fun sendWaitingNow(context: Context): Int {
        val waiting = HistoryStore.get(context).items.value.filter { it.state == ShareState.QUEUED || it.publishPending }
        waiting.forEach { enqueue(context, it.link, it.id, ExistingWorkPolicy.APPEND_OR_REPLACE, justForMe = it.isPrivate) }
        return waiting.size
    }

    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
    }

    private fun workName(link: String) = "save:$link"
}
