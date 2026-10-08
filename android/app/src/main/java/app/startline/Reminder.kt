package app.startline

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray

/** Gentle reminders at the times the user's own plan chose. Set from the app, shown by the system; nothing leaves the phone. */
object Reminder {
    private const val PREF = "remind"

    fun set(c: Context, json: String) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val sp = c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val old = sp.getInt("n", 0)
        for (i in 0 until old) am.cancel(pi(c, i, "", ""))
        val a = try { JSONArray(json) } catch (_: Exception) { JSONArray() }
        val n = minOf(a.length(), 20)
        val now = System.currentTimeMillis()
        for (i in 0 until n) {
            val o = a.getJSONObject(i)
            val at = o.optLong("at")
            if (at <= now + 30_000) continue
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(c, i, o.optString("t").take(60), o.optString("x").take(120)))
            } catch (_: Exception) { }
        }
        sp.edit().putInt("n", n).apply()
    }

    private fun pi(c: Context, i: Int, t: String, x: String): PendingIntent =
        PendingIntent.getBroadcast(c, 7000 + i, Intent(c, Receiver::class.java).putExtra("t", t).putExtra("x", x),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    class Receiver : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val t = i.getStringExtra("t").orEmpty()
            if (t.isEmpty()) return
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(NotificationChannel("remind", "Reminders", NotificationManager.IMPORTANCE_DEFAULT))
            val open = PendingIntent.getActivity(c, 1, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n: Notification = Notification.Builder(c, "remind").setContentTitle(t).setContentText(i.getStringExtra("x"))
                .setSmallIcon(android.R.drawable.ic_popup_reminder).setContentIntent(open).setAutoCancel(true).build()
            nm.notify((System.currentTimeMillis() % 100000).toInt(), n)
        }
    }
}
