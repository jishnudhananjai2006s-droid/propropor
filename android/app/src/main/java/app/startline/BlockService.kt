package app.startline

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ServiceCompat
import java.text.DateFormat
import java.util.Date

/**
 * Runs only while the user's own focus timer is running. Every second it checks which app is in front
 * and, if it is one the user chose to block, puts the "back to your task" screen on top.
 */
class BlockService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var current: String? = null
    private var lastTs = 0L
    private val tick = object : Runnable {
        override fun run() {
            val end = Focus.endAt(this@BlockService)
            if (System.currentTimeMillis() >= end) { stopSelf(); return }
            check()
            handler.postDelayed(this, 900)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val end = Focus.endAt(this)
        if (System.currentTimeMillis() >= end) { stopSelf(); return START_NOT_STICKY }
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel("focus", "Focus lock", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val until = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(end))
        val n: Notification = Notification.Builder(this, "focus")
            .setContentTitle("Focus lock is on")
            .setContentText("Distracting apps are paused until $until")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        ServiceCompat.startForeground(this, 1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        lastTs = System.currentTimeMillis() - 3000
        current = null
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_NOT_STICKY
    }

    private fun check() {
        if (!Focus.hasUsageAccess(this) || !Focus.hasOverlay(this)) return
        val um = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val ev = um.queryEvents(lastTs, now)
        val e = UsageEvents.Event()
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e)
            // 1 = app moved to the front, 2 = app left the front
            if (e.eventType == 1) current = e.packageName
            else if (e.eventType == 2 && e.packageName == current) current = null
            lastTs = maxOf(lastTs, e.timeStamp)
        }
        val pkg = current ?: return
        if (pkg != packageName && Focus.blocked(this).contains(pkg)) {
            val i = Intent(this, BlockActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(i)
            current = packageName
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }
}
