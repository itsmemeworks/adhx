package com.adhx.share.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.adhx.share.main.MainActivity

/** adhx://post?platform=…&id=…: one of your saves, in this app's player. */
fun postLink(platform: String, id: String): Uri = Uri.Builder()
    .scheme("adhx")
    .authority("post")
    .appendQueryParameter("platform", platform)
    .appendQueryParameter("id", id)
    .build()

/**
 * Open one of your saves in this app's player; without a network and id to
 * go on, just the app. Never the website.
 */
fun openPostInApp(context: Context, platform: String?, id: String?): Boolean {
    val intent = if (platform.isNullOrBlank() || id.isNullOrBlank()) {
        Intent(context, MainActivity::class.java)
    } else {
        Intent(Intent.ACTION_VIEW, postLink(platform, id)).setClass(context, MainActivity::class.java)
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        false
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
