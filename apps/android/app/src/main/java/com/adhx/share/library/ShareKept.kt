package com.adhx.share.library

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind

/**
 * The rail's Share and Save. Your ADHX is private, so Share sends what it
 * kept (the video, every photo of an album, the sound) rather than a link
 * nobody else can open; text posts send their words.
 */
object ShareKept {

    const val STILL_KEEPING = "Still being kept on your ADHX"
    const val COPIED = "Copied"
    private const val DIDNT_COME = "Couldn’t get it from your ADHX"

    /** The kept files of [post]: the video or sound, or all its photos. */
    fun files(post: PhonePost, server: String): List<String> {
        val media = if (PostKind.plays(post.kind)) post.media.take(1) else post.media.filter { it.kind == "photo" }
        return media.mapNotNull { m -> m.url.takeIf { it.isNotBlank() }?.let { AdhxApi.resolve(server, it)?.toString() } }
    }

    /** The words a text post or article shares or copies. */
    fun words(post: PhonePost): String {
        val article = post.article
        return listOfNotNull(
            article?.title?.takeIf { it.isNotBlank() },
            post.text.takeIf { it.isNotBlank() },
            article?.url?.takeIf { it.isNotBlank() },
        ).distinct().joinToString("\n\n")
    }

    /** A post's kept files, fetched into the share cache and ready to hand to another app. */
    class Ready(val files: List<java.io.File>, val uris: List<Uri>, val type: String) {
        /** ACTION_SEND (or SEND_MULTIPLE) for them, with read access to every file. */
        fun intent(): Intent {
            val intent = if (uris.size == 1) {
                Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList<Uri>(uris))
            }
            // ClipData carries the read grant for every file, not just the first.
            val clip = ClipData.newRawUri(null, uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
            intent.setType(type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).clipData = clip
            return intent
        }
    }

    /**
     * Fetch [post]'s kept files for sending (the send sheet). Either they're
     * [Ready], or there's a line saying why not.
     */
    suspend fun prepare(
        context: Context,
        server: String,
        post: PhonePost,
        onProgress: (Float?) -> Unit,
        onBytes: (Long, Long?) -> Unit = { _, _ -> },
    ): Pair<Ready?, String?> {
        val urls = files(post, server)
        if (urls.isEmpty()) return null to "There’s nothing to send in this one"
        if (stillKeeping(context, post)) return null to STILL_KEEPING
        val names = urls.indices.map { i -> SaveToPhone.fileName(post.platform, post.id, i.takeIf { urls.size > 1 }) }
        val got = SaveToPhone.fetchAllToShare(context, urls, names, onProgress, onBytes)
            ?: return null to (AdhxApi.reason(urls.first()) ?: DIDNT_COME)
        val uris = got.map { (file, _) -> FileProvider.getUriForFile(context, "${context.packageName}.files", file) }
        val types = got.map { it.second }.distinct()
        val type = types.singleOrNull() ?: types.map { it.substringBefore('/') }.distinct().singleOrNull()?.let { "$it/*" } ?: "*/*"
        return Ready(got.map { it.first }, uris, type) to null
    }

    /**
     * Share [post]: its kept files through the share sheet, or its words.
     * Returns a notice to show when it couldn't (null when the sheet opened).
     */
    suspend fun share(context: Context, server: String, post: PhonePost, onProgress: (Float?) -> Unit): String? {
        val urls = files(post, server)
        if (urls.isEmpty()) {
            val text = words(post).ifBlank { return "There’s nothing to share in this one" }
            send(context, Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text))
            return null
        }
        if (stillKeeping(context, post)) return STILL_KEEPING
        val names = urls.indices.map { i -> SaveToPhone.fileName(post.platform, post.id, i.takeIf { urls.size > 1 }) }
        val got = SaveToPhone.fetchAllToShare(context, urls, names, onProgress)
            ?: return AdhxApi.reason(urls.first()) ?: DIDNT_COME
        val uris = got.map { (file, _) -> FileProvider.getUriForFile(context, "${context.packageName}.files", file) }
        val types = got.map { it.second }.distinct()
        val type = types.singleOrNull() ?: types.map { it.substringBefore('/') }.distinct().singleOrNull()?.let { "$it/*" } ?: "*/*"
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList<Uri>(uris))
        }
        // ClipData carries the read grant for every file, not just the first.
        val clip = ClipData.newRawUri(null, uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
        intent.setType(type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).clipData = clip
        send(context, intent)
        return null
    }

    /**
     * Save [post] to the phone: the video or sound, or every photo, into the
     * gallery; a text post's words onto the clipboard. Returns the notice.
     */
    suspend fun save(context: Context, server: String, post: PhonePost): String {
        val urls = files(post, server)
        if (urls.isEmpty()) {
            val text = words(post).ifBlank { return "There’s nothing to copy in this one" }
            context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Words", text))
            return COPIED
        }
        if (!SaveToPhone.supported) return "Saving needs Android 10 or later"
        if (stillKeeping(context, post)) return STILL_KEEPING
        var saved = 0
        for ((i, url) in urls.withIndex()) {
            if (SaveToPhone.save(context, url, SaveToPhone.fileName(post.platform, post.id, i.takeIf { urls.size > 1 }))) saved++
        }
        return when {
            saved == 0 -> AdhxApi.reason(urls.first()) ?: "Couldn’t save this to your phone"
            urls.size == 1 -> "Saved to your phone"
            saved == urls.size -> "Saved $saved photos to your phone"
            else -> "Saved $saved of ${urls.size} photos"
        }
    }

    /** True when the server says the copy isn't kept yet. Unsure: false, and the download decides. */
    private suspend fun stillKeeping(context: Context, post: PhonePost): Boolean {
        val connection = ConnectionStore.get(context).current() ?: return false
        val status = AdhxApi(connection).status(post.platform, post.id)
        return status is ApiResult.Ok && stillKeeping(status.value.status)
    }

    fun send(context: Context, intent: Intent) {
        context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
