package app.startline

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** The screen shown on top of a blocked app while a focus timer runs. */
class BlockActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var left: TextView
    private val tick = object : Runnable {
        override fun run() {
            val ms = Focus.endAt(this@BlockActivity) - System.currentTimeMillis()
            if (ms <= 0) { finish(); return }
            val s = ms / 1000
            left.text = String.format("%02d:%02d left", s / 60, s % 60)
            handler.postDelayed(this, 500)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.parseColor("#0F3B2B"))
        }
        col.addView(TextView(this).apply {
            text = "Focus is on"; textSize = 30f; setTextColor(Color.WHITE); typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        })
        left = TextView(this).apply {
            textSize = 44f; setTextColor(Color.parseColor("#CDEB9A")); typeface = Typeface.MONOSPACE; gravity = Gravity.CENTER
            setPadding(0, pad, 0, pad)
        }
        col.addView(left)
        col.addView(TextView(this).apply {
            text = "This app is paused until your sprint ends. You chose this when you started. Go back to your task."
            textSize = 16f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
        })
        col.addView(Button(this).apply {
            text = "Back to Startline"
            setOnClickListener { goBack() }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = pad * 2 })
        setContentView(col)
    }

    private fun goBack() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        finish()
    }

    @Deprecated("Back goes to the task, never back into the blocked app")
    override fun onBackPressed() { goBack() }

    override fun onResume() { super.onResume(); handler.post(tick) }
    override fun onPause() { handler.removeCallbacks(tick); super.onPause() }
}
