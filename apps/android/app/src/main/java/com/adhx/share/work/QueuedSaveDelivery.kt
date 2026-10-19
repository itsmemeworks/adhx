package com.adhx.share.work

import com.adhx.share.data.HistoryItem
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.SaveResponse

/** Durable two-phase delivery. All mutable intent is reread from storage, never a share-sheet closure. */
class QueuedSaveDelivery(
    private val api: AdhxApi,
    private val read: () -> HistoryItem?,
    private val update: ((HistoryItem) -> HistoryItem) -> Unit,
) {
    suspend fun run(interval: () -> Long, limitMs: Long): ApiResult<SaveResponse> {
        val item = read() ?: return ApiResult.Failed(410, "removed", null)
        // A finished receipt retry must never POST a duplicate save.
        val received = item.asPost()
        val result = if (received != null) ApiResult.Ok(received, 200) else if (item.queueId != null) {
            api.followQueued(item.queueId, interval, limitMs)
        } else {
            api.saveAndFollow(item.link, interval, limitMs,
                justForMe = item.privateChoice ?: (item.privateDefault == true),
                explicit = item.privateChoice != null,
                deferPublish = true,
                requestId = item.id,
                onQueued = { receipt -> update { it.queuedWith(receipt) } })
        }
        if (result !is ApiResult.Ok) return result
        val post = result.value
        if (read()?.postId == null) update { it.savedWith(post) }
        while (true) {
            val current = read() ?: return ApiResult.Failed(410, "removed", null)
            if (!current.publishPending) break
            val choice = current.publicationChoice(post)
            val version = current.privacyIntentVersion
            val ack = if (current.queueId != null) api.queuedPrivacy(current.queueId, choice, version)
                // Older synchronous servers have no two-phase receipt. A changed choice still persists/retries.
                else if (choice != null) api.setPrivate(post.platform, post.id, choice)
                else ApiResult.Ok(Unit, 200)
            when (ack) {
                is ApiResult.Failed -> return ack
                ApiResult.Offline -> return ApiResult.Offline
                is ApiResult.Ok -> Unit
            }
            update { it.acknowledged(choice, post, version) }
        }
        // Refresh the staged private flag after publication; failed refresh is harmless, choice is committed.
        val receipt = read()?.queueId
        val fresh = receipt?.let { api.queued(it) }
        if (receipt != null) when (fresh) {
            is ApiResult.Failed -> return fresh
            ApiResult.Offline -> return ApiResult.Offline
            else -> Unit
        }
        val published = if (fresh is ApiResult.Ok) fresh.value.post ?: post else
            post.copy(isPrivate = read()?.isPrivate ?: post.isPrivate)
        update { it.savedWith(published) }
        return ApiResult.Ok(published, 200)
    }
}
