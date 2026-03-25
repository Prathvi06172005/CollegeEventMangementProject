package com.collegeeventzone

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import com.collegeeventzone.databinding.ActivityMainBinding

class MainActivity : ComponentActivity() {

    private lateinit var binding: ActivityMainBinding
    private val TAG = "MainActivity"

    // safe lazy - will throw if BuildConfig missing; we handle it below
    private val targetUrlFromBuildConfig: String?
        get() = try {
            BuildConfig.WEB_APP_URL
        } catch (t: Throwable) {
            Log.w(TAG, "BuildConfig.WEB_APP_URL unavailable: ${t.message}")
            null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Determine URL to load: prefer build config, otherwise fallback to google for testing
        val targetUrl = targetUrlFromBuildConfig ?: "https://www.google.com"
        Log.i(TAG, "Loading URL: $targetUrl")

        // WebSettings
        val webSettings: WebSettings = binding.webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.setSupportZoom(false)
        webSettings.cacheMode = WebSettings.LOAD_DEFAULT

        // Chrome client for progress UI
        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                binding.progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                binding.progress.progress = newProgress
            }
        }

        // WebViewClient to handle navigation and errors
        binding.webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                // don't override; let WebView handle it
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                Log.d(TAG, "onPageStarted: $url")
                binding.swipeRefresh.isRefreshing = true
                // ensure webView is visible (in case something set it gone)
                binding.webView.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                Log.d(TAG, "onPageFinished: $url")
                binding.swipeRefresh.isRefreshing = false
                binding.progress.visibility = View.GONE

                // Hide a splash view if you have one named "splash"
                try {
                    val splashView = binding.root.findViewById<View?>(resources.getIdentifier("splash", "id", packageName))
                    splashView?.visibility = View.GONE
                } catch (e: Exception) {
                    // ignore if no splash view
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                Log.e(TAG, "WebView error: ${error.errorCode} - ${error.description}")
                binding.swipeRefresh.isRefreshing = false
                binding.progress.visibility = View.GONE
                Toast.makeText(this@MainActivity, "Page load error: ${error.description}", Toast.LENGTH_LONG).show()
            }
        }

        // finally load the URL
        try {
            binding.webView.loadUrl(targetUrl)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to call loadUrl: ${t.message}", t)
            Toast.makeText(this, "Failed to load URL: ${t.message}", Toast.LENGTH_LONG).show()
        }

        // Swipe refresh reloads the webview
        binding.swipeRefresh.setOnRefreshListener {
            binding.webView.reload()
        }

        // Back handler using the dispatcher (works on ComponentActivity)
        onBackPressedDispatcher.addCallback(this) {
            if (binding.webView.canGoBack()) {
                binding.webView.goBack()
            } else {
                // if you want to finish app instead of default behavior, call finish()
                isEnabled = false
                onBackPressed()
            }
        }
    }
}
