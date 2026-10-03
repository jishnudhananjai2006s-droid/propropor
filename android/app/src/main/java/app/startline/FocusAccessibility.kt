package app.startline

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast

/**
 * Switched on by the user in Accessibility settings. Active only while a focus timer runs. It reads the address bar of
 * the user's browser to enforce their website list, notices Shorts and Reels pages, and during a Strict sprint keeps
 * Settings and app-removal screens closed. It never stores or sends what it reads.
 */
class FocusAccessibility : AccessibilityService() {
    private var lastAct = 0L

    /** Address-bar view ids of common browsers. Browsers change these sometimes, so this is best effort. */
    private val urlBars = mapOf(
        "com.android.chrome" to listOf("com.android.chrome:id/url_bar"),
        "com.sec.android.app.sbrowser" to listOf("com.sec.android.app.sbrowser:id/location_bar_edit_text"),
        "org.mozilla.firefox" to listOf("org.mozilla.firefox:id/mozac_browser_toolbar_url_view", "org.mozilla.firefox:id/url_bar_title"),
        "com.brave.browser" to listOf("com.brave.browser:id/url_bar"),
        "com.microsoft.emmx" to listOf("com.microsoft.emmx:id/url_bar"),
        "com.opera.browser" to listOf("com.opera.browser:id/url_field"),
        "com.duckduckgo.mobile.android" to listOf("com.duckduckgo.mobile.android:id/omnibarTextInput"),
        "com.kiwibrowser.browser" to listOf("com.kiwibrowser.browser:id/url_bar")
    )

    /** View-id fragments that appear only on full-screen short-video pages. */
    private val shortIds = mapOf(
        "com.google.android.youtube" to listOf("reel_recycler", "reel_player_page_container", "shorts_player", "reel_watch_fragment"),
        "com.instagram.android" to listOf("clips_viewer_view_pager", "clips_viewer_fragment", "reel_viewer_fragment")
    )

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        e ?: return
        val now = System.currentTimeMillis()
        if (now >= Focus.endAt(this)) return
        val pkg = e.packageName?.toString() ?: return
        if (pkg == packageName || now - lastAct < 700) return
        when {
            Focus.strictOn(this) && Focus.PROTECTED.contains(pkg) -> push("Strict mode is on until your sprint ends.", false)
            urlBars.containsKey(pkg) -> browser(pkg)
            shortIds.containsKey(pkg) && Focus.shorts(this) -> shorts(pkg)
        }
    }

    private fun push(msg: String, home: Boolean = true) {
        lastAct = System.currentTimeMillis()
        performGlobalAction(GLOBAL_ACTION_HOME)
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        try {
            startActivity(Intent(this, BlockActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
        } catch (_: Exception) {}
    }

    private fun host(raw: String): String? {
        var t = raw.trim().lowercase()
        if (t.contains(' ')) return null
        t = t.removePrefix("https://").removePrefix("http://").substringBefore('/').substringBefore('?').substringBefore(':')
        for (p in listOf("www.", "m.", "mobile.")) if (t.startsWith(p)) t = t.removePrefix(p)
        return if (t.contains('.')) t else null
    }

    private fun matches(h: String, set: Set<String>) = set.any { h == it || h.endsWith(".$it") }

    private fun browser(pkg: String) {
        val root = rootInActiveWindow ?: return
        var text: String? = null
        for (id in urlBars[pkg].orEmpty()) {
            val n = root.findAccessibilityNodeInfosByViewId(id)?.firstOrNull() ?: continue
            text = n.text?.toString()
            if (!text.isNullOrBlank()) break
        }
        val h = host(text ?: return) ?: return
        val adult = Focus.ADULT_WORDS.any { h.contains(it) }
        val blocked = adult || if (Focus.sitesMode(this) == "allow") !matches(h, Focus.sitesAllow(this)) else matches(h, Focus.sitesBlock(this))
        if (blocked) push(if (adult) "That site is blocked." else "That site is paused while you focus.")
    }

    private fun shorts(pkg: String) {
        val root = rootInActiveWindow ?: return
        val frags = shortIds[pkg].orEmpty()
        if (hasId(root, frags, 0, intArrayOf(0))) {
            lastAct = System.currentTimeMillis()
            performGlobalAction(GLOBAL_ACTION_BACK)
            Toast.makeText(this, "Short videos are paused while you focus.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun hasId(n: AccessibilityNodeInfo?, frags: List<String>, depth: Int, count: IntArray): Boolean {
        if (n == null || depth > 12 || count[0]++ > 900) return false
        val id = n.viewIdResourceName
        if (id != null && frags.any { id.contains(it) }) return true
        for (i in 0 until n.childCount) if (hasId(n.getChild(i), frags, depth + 1, count)) return true
        return false
    }

    override fun onInterrupt() {}
}
