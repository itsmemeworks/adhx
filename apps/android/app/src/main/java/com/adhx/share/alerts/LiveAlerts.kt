package com.adhx.share.alerts

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.adhx.share.R
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.main.MainActivity
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.LiveAlert
import com.adhx.share.ui.Copy
import java.util.concurrent.TimeUnit

/**
 * "Tell me when it's live": a forming group you rang the bell on has become a
 * moment. The server keeps the alerts (`GET /api/app/alerts`, unseen only);
 * the app shows each as a notification on the Live channel and marks it seen
 * (`POST /api/app/alerts/seen`). It looks while the app is open (every
 * minute) and, from the first bell on, every 15 minutes in the background.
 * Tapping one opens Tune in for that moment (`adhx://live?slug=…`).
 */
object LiveAlerts {
    const val CHANNEL_ID = "live"
    private const val WORK = "live-alerts"
    private const val PREFS = "live_alerts"
    private const val KEY_WANTED = "wanted"
    private const val KEY_ASKED = "asked_notifications"

    /** The foreground check's pace while the app is open. */
    const val FOREGROUND_MS = 60_000L

    /** The deep link a notification opens: Tune in for [slug]. */
    fun link(slug: String): Uri = Uri.Builder().scheme("adhx").authority("live").appendQueryParameter("slug", slug).build()

    /** Whether you've ever rung a bell on this phone (so the checks are worth making). */
    fun wanted(context: Context): Boolean = prefs(context).getBoolean(KEY_WANTED, false)

    /** A bell went on: check in the background from now on. */
    fun want(context: Context) {
        prefs(context).edit().putBoolean(KEY_WANTED, true).apply()
        schedule(context)
    }

    /** Ask for POST_NOTIFICATIONS only on the first bell tap (Android 13 and up). */
    fun shouldAsk(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !granted(context) &&
            !prefs(context).getBoolean(KEY_ASKED, false)

    fun asked(context: Context) {
        prefs(context).edit().putBoolean(KEY_ASKED, true).apply()
    }

    /** Forget it all (this phone was disconnected). */
    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<LiveAlertsWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Notifications can be shown: allowed in Settings and, on Android 13+, permitted. */
    fun canNotify(context: Context): Boolean =
        granted(context) && NotificationManagerCompat.from(context).areNotificationsEnabled()

    private fun granted(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /**
     * Fetch the unseen alerts and deliver them. Shown as notifications when
     * they can be; otherwise, in the foreground, handed back for the app to
     * say in its own way, and in the background left for later. What was
     * delivered is marked seen. Returns the alerts the caller should show.
     */
    suspend fun check(context: Context, connection: Connection, foreground: Boolean): List<LiveAlert> {
        val api = AdhxApi(connection)
        val alerts = (api.alerts() as? ApiResult.Ok)?.value?.alerts.orEmpty()
        if (alerts.isEmpty()) return emptyList()
        val plan = plan(alerts, canNotify(context), foreground)
        if (plan.notify.isNotEmpty()) {
            ensureChannel(context)
            plan.notify.forEach { show(context, it) }
        }
        val delivered = (plan.notify + plan.inApp).map { it.id }
        if (delivered.isNotEmpty()) api.alertsSeen(delivered)
        return plan.inApp
    }

    /** What to do with fetched alerts: notify, say in the app, or (in the background without permission) wait. */
    data class Plan(val notify: List<LiveAlert>, val inApp: List<LiveAlert>)

    fun plan(alerts: List<LiveAlert>, canNotify: Boolean, foreground: Boolean): Plan {
        val usable = alerts.filter { it.id.isNotBlank() && it.slug.isNotBlank() }.distinctBy { it.id }
        return when {
            canNotify -> Plan(usable, emptyList())
            foreground -> Plan(emptyList(), usable)
            else -> Plan(emptyList(), emptyList())
        }
    }

    /** In the app when notifications are off: "Kitchen synths is live · Tune in from Live". */
    fun inAppLine(alert: LiveAlert): String = Copy.isLive(alert.title.ifBlank { alert.slug }) + " · " + Copy.LIVE_ALERT_TEXT

    /** One notification per alert; the same alert replaces itself rather than buzzing twice. */
    fun notificationId(alert: LiveAlert): Int = ("live:" + alert.id).hashCode()

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, Copy.LIVE_CHANNEL, NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = Copy.LIVE_CHANNEL_NOTE
        }
        manager.createNotificationChannel(channel)
    }

    private fun show(context: Context, alert: LiveAlert) {
        val id = notificationId(alert)
        val open = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .setData(link(alert.slug))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val title = alert.title.ifBlank { alert.slug }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(Copy.isLive(title))
            .setContentText(Copy.LIVE_ALERT_TEXT)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // Permission taken away between the check and now: nothing to show.
        }
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

/** The background check, every 15 minutes with a network. Stops itself once the phone isn't connected. */
class LiveAlertsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val connection = ConnectionStore.get(applicationContext).current()
        if (connection == null) {
            LiveAlerts.clear(applicationContext)
            return Result.success()
        }
        LiveAlerts.check(applicationContext, connection, foreground = false)
        return Result.success()
    }
}
