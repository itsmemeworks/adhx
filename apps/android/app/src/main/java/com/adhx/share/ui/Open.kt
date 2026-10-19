package com.adhx.share.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.adhx.share.main.MainActivity
import com.adhx.share.net.AdhxApi

/** Open a page of the user's ADHX (the server address plus [path]) in the browser. */
fun openInAdhx(context: Context, server: String, path: String? = null): Boolean {
    val url = AdhxApi.resolve(server, path?.takeIf { it.isNotBlank() } ?: "/")?.toString() ?: return false
    return openUrl(context, url)
}

/** adhx://post?platform=…&id=…: one of your saves, in this app's player. */
fun postLink(platform: String, id: String): Uri = Uri.Builder()
    .scheme("adhx")
    .authority("post")
    .appendQueryParameter("platform", platform)
    .appendQueryParameter("id", id)
    .build()

/**
 * Open one of your saves in this app's player. Falls back to the post on
 * your ADHX in the browser ([path]) when there's no network or id to go on.
 */
fun openPostInApp(context: Context, server: String, platform: String?, id: String?, path: String?): Boolean {
    if (platform.isNullOrBlank() || id.isNullOrBlank()) return openInAdhx(context, server, path)
    val intent = Intent(Intent.ACTION_VIEW, postLink(platform, id))
        .setClass(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        openInAdhx(context, server, path)
    }
}

fun openUrl(context: Context, url: String): Boolean {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "There’s no browser to open it in.", Toast.LENGTH_SHORT).show()
        false
    }
}
