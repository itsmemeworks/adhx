package com.adhx.share.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.adhx.share.net.AdhxApi

/** Open a page of the user's ADHX (the server address plus [path]) in the browser. */
fun openInAdhx(context: Context, server: String, path: String? = null): Boolean {
    val url = AdhxApi.resolve(server, path?.takeIf { it.isNotBlank() } ?: "/")?.toString() ?: return false
    return openUrl(context, url)
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
