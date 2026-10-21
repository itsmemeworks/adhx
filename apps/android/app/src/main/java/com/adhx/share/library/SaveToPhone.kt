package com.adhx.share.library

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.annotation.RequiresApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Save writes a post's file to the phone's gallery (Movies/ADHX, Pictures/ADHX
 * or Music/ADHX) through MediaStore. That needs no permission from Android 10
 * (API 29) on; below that the Save button isn't shown.
 */
object SaveToPhone {

    val supported: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    // A kept 4K video is hundreds of megabytes: no limit on the whole call.
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Fetch [url] with `download=1` and put it in the gallery as [name]. True when it's there. */
    suspend fun save(context: Context, url: String, name: String): Boolean = withContext(Dispatchers.IO) {
        if (!supported) return@withContext false
        val address = url.toHttpUrlOrNull()?.newBuilder()?.addQueryParameter("download", "1")?.build()
            ?: return@withContext false
        try {
            client.newCall(Request.Builder().url(address).build()).execute().use { response ->
                val body = response.body
                if (!response.isSuccessful || body == null) return@withContext false
                val type = body.contentType()?.let { "${it.type}/${it.subtype}" } ?: return@withContext false
                write(context, type, name, body.byteStream())
            }
        } catch (e: IOException) {
            false
        }
    }

    /**
     * Fetch [url] with `download=1` into the app's cache (cache/shared, which
     * the FileProvider hands out) for the share sheet. Earlier ones are cleared
     * after a day on subsequent exports. Fresh batches stay valid for recipients.
     */
    suspend fun fetchToShare(context: Context, url: String, name: String): Pair<File, String>? =
        fetchAllToShare(context, listOf(url), listOf(name))?.firstOrNull()

    /**
     * The same for several files (an album), with [onProgress] from 0 to 1
     * as they come in (null while a file's size isn't known). Null when any
     * of them didn't come.
     */
    suspend fun fetchAllToShare(
        context: Context,
        urls: List<String>,
        names: List<String>,
        onProgress: (Float?) -> Unit = {},
        /** Bytes in so far (all files), and the whole size when it's one file of known length. */
        onBytes: (read: Long, total: Long?) -> Unit = { _, _ -> },
    ): List<Pair<File, String>>? = withContext(Dispatchers.IO) {
        val folder = try { ShareCache.create(File(context.cacheDir, "shared")) }
            catch (_: IOException) { return@withContext null }
        var complete = false
        try {
            val got = mutableListOf<Pair<File, String>>()
            var before = 0L
            for ((i, url) in urls.withIndex()) {
                val address = url.toHttpUrlOrNull()?.newBuilder()?.addQueryParameter("download", "1")?.build()
                    ?: return@withContext null
                try {
                    client.newCall(Request.Builder().url(address).build()).execute().use { response ->
                        val body = response.body
                        if (!response.isSuccessful || body == null) return@withContext null
                        val type = body.contentType()?.let { "${it.type}/${it.subtype}" } ?: "application/octet-stream"
                        val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(type) ?: "bin"
                        val file = File(folder, "${names.getOrElse(i) { "adhx-$i" }}.$extension")
                        val length = body.contentLength().takeIf { it > 0 }
                        ShareCache.requireSpace(folder, length ?: 4 * 1024 * 1024L)
                        var read = 0L
                        var sinceSpaceCheck = 0L
                        body.byteStream().use { input ->
                            file.outputStream().use { out ->
                                val buffer = ByteArray(64 * 1024)
                                while (true) {
                                    coroutineContext.ensureActive()
                                    val n = input.read(buffer)
                                    if (n < 0) break
                                    if (sinceSpaceCheck >= 4 * 1024 * 1024) {
                                        ShareCache.requireSpace(folder, 4 * 1024 * 1024L)
                                        sinceSpaceCheck = 0
                                    }
                                    out.write(buffer, 0, n)
                                    read += n
                                    sinceSpaceCheck += n
                                    onProgress(length?.let { (i + read.toFloat() / it) / urls.size })
                                    onBytes(before + read, length.takeIf { urls.size == 1 })
                                }
                            }
                        }
                        got += file to type
                        before += read
                    }
                } catch (e: IOException) {
                    return@withContext null
                }
            }
            complete = true
            ShareCache.finish(folder)
            got
        } finally {
            if (!complete) ShareCache.discard(folder)
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun write(context: Context, type: String, name: String, input: java.io.InputStream): Boolean {
        val (collection, folder) = when {
            type.startsWith("video/") ->
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) to Environment.DIRECTORY_MOVIES
            type.startsWith("image/") ->
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) to Environment.DIRECTORY_PICTURES
            type.startsWith("audio/") ->
                MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) to Environment.DIRECTORY_MUSIC
            else -> return false
        }
        val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(type) ?: return false
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "$name.$extension")
            put(MediaStore.MediaColumns.MIME_TYPE, type)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "$folder/ADHX")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: return false
        return try {
            val out = resolver.openOutputStream(uri) ?: throw IOException("no stream")
            out.use { input.copyTo(it) }
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            true
        } catch (e: IOException) {
            resolver.delete(uri, null, null)
            false
        }
    }

    /** "adhx-twitter-1234", "adhx-instagram-abc-2" for the second photo. */
    fun fileName(platform: String, id: String, photo: Int? = null): String {
        val safe = "$platform-$id".replace(Regex("[^A-Za-z0-9._-]"), "_")
        return listOfNotNull("adhx", safe, photo?.let { (it + 1).toString() }).joinToString("-")
    }
}
