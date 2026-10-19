package com.adhx.share.debug

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.main.MainActivity

/**
 * Debug builds only (src/debug): stores a server and phone key the way pairing
 * does, then opens the app. For running the app against a seeded test server
 * without going through the pairing code.
 */
class DebugConnectActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val server = intent.getStringExtra("server")?.trim()?.trimEnd('/')
        val key = intent.getStringExtra("key")?.trim()
        if (!server.isNullOrBlank() && !key.isNullOrBlank()) {
            val saved = ConnectionStore.get(this).save(
                Connection(server, key, intent.getStringExtra("username"), intent.getStringExtra("phone")),
            )
            Log.i("AdhxDebug", "connected to $server: $saved")
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        }
        finish()
    }
}
