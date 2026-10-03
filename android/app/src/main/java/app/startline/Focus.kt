package app.startline

import android.app.AppOpsManager
import android.content.Context
import android.os.Process
import android.provider.Settings

/** Settings kept on this phone only: which apps to block and when the current focus lock ends. */
object Focus {
    private const val PREFS = "focus"
    private const val K_BLOCKED = "blocked"
    private const val K_END = "endAt"
    private const val K_MODE = "mode"
    private const val K_ALLOW = "allow"
    private const val K_STRICT = "strictEnd"

    /** Apps people most often lose time in. Only used until the user picks their own list. */
    val DEFAULTS = setOf(
        "com.instagram.android", "com.google.android.youtube", "com.whatsapp", "com.whatsapp.w4b",
        "com.facebook.katana", "com.facebook.lite", "com.snapchat.android", "com.twitter.android",
        "com.reddit.frontpage", "org.telegram.messenger", "com.netflix.mediaclient",
        "com.amazon.avod.thirdpartyclient", "in.startv.hotstar", "com.jio.media.ondemand",
        "in.mohalla.sharechat", "com.zhiliaoapp.musically", "com.pinterest", "com.discord",
        "com.linkedin.android", "tv.twitch.android.app", "com.google.android.apps.youtube.music",
        "com.instagram.barcelona"
    )

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun blocked(c: Context): Set<String> = prefs(c).getStringSet(K_BLOCKED, null) ?: DEFAULTS
    fun setBlocked(c: Context, s: Set<String>) { prefs(c).edit().putStringSet(K_BLOCKED, s).apply() }
    /** "block" = pause the chosen apps. "allow" = pause everything except the chosen apps and phone essentials. */
    fun mode(c: Context): String = prefs(c).getString(K_MODE, "block") ?: "block"
    fun setMode(c: Context, m: String) { prefs(c).edit().putString(K_MODE, if (m == "allow") "allow" else "block").apply() }
    fun allowed(c: Context): Set<String> = prefs(c).getStringSet(K_ALLOW, null) ?: emptySet()
    fun setAllowed(c: Context, s: Set<String>) { prefs(c).edit().putStringSet(K_ALLOW, s).apply() }
    /** The list the user is editing right now, for the current mode. */
    fun active(c: Context): Set<String> = if (mode(c) == "allow") allowed(c) else blocked(c)
    fun setActive(c: Context, s: Set<String>) { if (mode(c) == "allow") setAllowed(c, s) else setBlocked(c, s) }
    fun strictEnd(c: Context): Long = prefs(c).getLong(K_STRICT, 0L)
    fun setStrictEnd(c: Context, t: Long) { prefs(c).edit().putLong(K_STRICT, t).apply() }
    fun endAt(c: Context): Long = prefs(c).getLong(K_END, 0L)
    fun setEndAt(c: Context, t: Long) { prefs(c).edit().putLong(K_END, t).apply() }

    fun hasUsageAccess(c: Context): Boolean {
        val ops = c.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun hasOverlay(c: Context): Boolean = Settings.canDrawOverlays(c)
}
