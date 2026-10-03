package app.startline

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView
    private val host = Uri.parse(BuildConfig.APP_URL).host ?: ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFFF3F5F0.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = userAgentString + " StartlineAndroid/1"
        }
        web.addJavascriptInterface(Bridge(), "Android")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                if (r.url.host == host) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, r.url)) } catch (_: Exception) {}
                return true
            }
            override fun onReceivedError(v: WebView, r: WebResourceRequest, e: WebResourceError) {
                if (r.isForMainFrame) {
                    v.loadDataWithBaseURL(null,
                        "<body style='font-family:sans-serif;padding:32px;background:#F3F5F0;color:#13201A'><h2>No connection</h2><p>Check your internet, then try again.</p><p><a href='${BuildConfig.APP_URL}'>Try again</a></p></body>",
                        "text/html", "utf-8", null)
                }
            }
        }
        if (savedInstanceState == null) web.loadUrl(BuildConfig.APP_URL) else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }

    @Deprecated("Back moves through the app first")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    override fun onResume() {
        super.onResume()
        // Tell the page the user may have just changed a permission in system settings.
        web.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null)
    }

    /** The only things the web page can ask this phone to do. Everything stays on the phone. */
    inner class Bridge {
        @JavascriptInterface
        fun status(): String = JSONObject()
            .put("usage", Focus.hasUsageAccess(this@MainActivity))
            .put("overlay", Focus.hasOverlay(this@MainActivity))
            .put("v", 1).toString()

        @JavascriptInterface
        fun openUsage() { runOnUiThread { startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) } }

        @JavascriptInterface
        fun openOverlay() {
            runOnUiThread { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) }
        }

        @JavascriptInterface
        fun apps(): String {
            val pm = packageManager
            val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val chosen = Focus.active(this@MainActivity)
            val arr = JSONArray()
            pm.queryIntentActivities(i, 0)
                .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
                .distinctBy { it.first }
                .filter { it.first != packageName }
                .sortedBy { it.second.lowercase() }
                .forEach { arr.put(JSONObject().put("p", it.first).put("n", it.second).put("on", chosen.contains(it.first))) }
            return arr.toString()
        }

        @JavascriptInterface
        fun setBlocked(json: String) {
            val a = JSONArray(json)
            val s = HashSet<String>()
            for (k in 0 until a.length()) s.add(a.getString(k))
            Focus.setActive(this@MainActivity, s)
        }

        @JavascriptInterface
        fun setMode(m: String) { Focus.setMode(this@MainActivity, m) }

        @JavascriptInterface
        fun mode(): String = Focus.mode(this@MainActivity)

        /** Minutes spent today in the apps the user chose to pause, with the top three. Stays on the phone. */
        @JavascriptInterface
        fun usage(): String {
            val out = JSONObject().put("total", 0).put("top", JSONArray())
            if (!Focus.hasUsageAccess(this@MainActivity)) return out.toString()
            val um = getSystemService(USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
            val cal = java.util.Calendar.getInstance().apply { set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0) }
            val stats = um.queryAndAggregateUsageStats(cal.timeInMillis, System.currentTimeMillis())
            val pm = packageManager
            val set = Focus.blocked(this@MainActivity)
            var total = 0L
            val rows = ArrayList<Pair<String, Long>>()
            for ((p, st) in stats) {
                if (!set.contains(p) || st.totalTimeInForeground <= 0) continue
                total += st.totalTimeInForeground
                val name = try { pm.getApplicationLabel(pm.getApplicationInfo(p, 0)).toString() } catch (_: Exception) { p }
                rows.add(name to st.totalTimeInForeground)
            }
            val top = JSONArray()
            rows.sortedByDescending { it.second }.take(3).forEach { top.put(JSONObject().put("n", it.first).put("m", it.second / 60000)) }
            return out.put("total", total / 60000).put("top", top).toString()
        }

        @JavascriptInterface
        fun start(endAtMs: String, strict: String) {
            val t = endAtMs.toDoubleOrNull()?.toLong() ?: return
            Focus.setEndAt(this@MainActivity, t)
            // Strict mode: the lock cannot be stopped early from the app. Capped at 90 minutes so nobody is ever stuck.
            val cap = System.currentTimeMillis() + 90 * 60000L
            Focus.setStrictEnd(this@MainActivity, if (strict == "1") minOf(t, cap) else 0L)
            if (Focus.hasUsageAccess(this@MainActivity) && Focus.hasOverlay(this@MainActivity)) {
                ContextCompat.startForegroundService(this@MainActivity, Intent(this@MainActivity, BlockService::class.java))
            }
        }

        @JavascriptInterface
        fun stop() {
            if (Focus.strictEnd(this@MainActivity) > System.currentTimeMillis()) return
            Focus.setEndAt(this@MainActivity, 0L)
            stopService(Intent(this@MainActivity, BlockService::class.java))
        }
    }
}
