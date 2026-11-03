package com.hyperlog.rp

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileNotFoundException
import java.nio.charset.StandardCharsets
import java.time.Instant

/**
 * MainActivity — Unified Web & Standalone Native Android Shell (v4.0.0 · Build 16)
 *
 * Serves the exact compiled React + Tailwind CSS Web UI 100% offline from APK
 * `assets/webapp/` over `https://app.hyperlog.local/` so every single page
 * (`Tracker`, `Anatomy`, `Workouts`, `Library`, `Wellness`, `Settings`), theme,
 * SVG diagram, animation, and modal stays in strict 1:1 visual and UX sync with
 * the Web App—while bridging native Android OS features (`HealthConnectManager`,
 * `HyperLogStreakWidgetProvider`, `VibrationEffect`, `FLAG_KEEP_SCREEN_ON`,
 * dynamic system bar colors, and `HyperLogFileProvider` PDF/JSON/CSV sharing)
 * through `window.HyperLogNative`.
 */
class MainActivity : Activity() {

    companion object {
        private const val VIRTUAL_HOST = "app.hyperlog.local"
        private const val START_URL = "https://app.hyperlog.local/"
    }

    private lateinit var rootContainer: FrameLayout
    private lateinit var webView: WebView
    private lateinit var db: HyperLogDatabase
    private var pendingWidgetTab: String? = null
    private var pageReady: Boolean = false
    private var backCallback: OnBackInvokedCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        db = HyperLogDatabase.getInstance(applicationContext)
        HyperLogStorageManager.ensureStartupPackageInstalled(applicationContext, db)

        pendingWidgetTab = intent?.getStringExtra(HyperLogStreakWidgetProvider.EXTRA_TARGET_TAB)

        val defaultStatusColor = Color.parseColor("#FAF9FF")
        val defaultNavColor = Color.parseColor("#FAF9FF")

        rootContainer = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(defaultStatusColor)
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.TRANSPARENT)
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_DEFAULT
                textZoom = 100
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }

            addJavascriptInterface(HyperLogNativeBridge(this@MainActivity), "HyperLogNative")
            webChromeClient = WebChromeClient()
            webViewClient = UnifiedAssetWebViewClient(applicationContext)
        }

        rootContainer.addView(webView)
        setContentView(rootContainer)

        applySystemBarsAppearance(defaultStatusColor, defaultNavColor, isDark = false)
        configureEdgeToEdgeInsets()
        registerBackNavigationHandler()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        val tabKey = intent?.getStringExtra(HyperLogStreakWidgetProvider.EXTRA_TARGET_TAB)
        if (!tabKey.isNullOrBlank()) {
            if (pageReady) {
                dispatchTabSelectionToWeb(tabKey)
            } else {
                pendingWidgetTab = tabKey
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) {
            webView.saveState(outState)
        }
    }

    private fun dispatchTabSelectionToWeb(tabKey: String) {
        val safeKey = JSONObject.quote(tabKey)
        webView.post {
            webView.evaluateJavascript(
                "window.__hyperlogSelectNativeTab && window.__hyperlogSelectNativeTab($safeKey);",
                null
            )
        }
    }

    private fun configureEdgeToEdgeInsets() {
        val win = window
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            win.setDecorFitsSystemWindows(false)
            rootContainer.setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(
                    WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
                )
                val ime = insets.getInsets(WindowInsets.Type.ime())
                val bottomPad = maxOf(bars.bottom, ime.bottom)
                view.setPadding(bars.left, bars.top, bars.right, bottomPad)
                insets
            }
        } else {
            @Suppress("DEPRECATION")
            rootContainer.setOnApplyWindowInsetsListener { view, insets ->
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
                insets
            }
        }
        rootContainer.requestApplyInsets()
    }

    private fun applySystemBarsAppearance(statusColor: Int, navColor: Int, isDark: Boolean) {
        val win = window
        @Suppress("DEPRECATION")
        run {
            win.statusBarColor = statusColor
            win.navigationBarColor = navColor
        }
        rootContainer.setBackgroundColor(statusColor)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            win.insetsController?.let { controller ->
                val lightFlags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                if (isDark) {
                    controller.setSystemBarsAppearance(0, lightFlags)
                } else {
                    controller.setSystemBarsAppearance(lightFlags, lightFlags)
                }
            }
        } else {
            @Suppress("DEPRECATION")
            val vis = win.decorView.systemUiVisibility
            @Suppress("DEPRECATION")
            win.decorView.systemUiVisibility = if (isDark) {
                vis and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv() and
                    View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
            } else {
                vis or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                    View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
        }
    }

    private fun registerBackNavigationHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val cb = OnBackInvokedCallback { handleBackNavigation() }
            backCallback = cb
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                cb
            )
        }
    }

    @Deprecated("Deprecated in Android API 33")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        handleBackNavigation()
    }

    private fun handleBackNavigation() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
            return
        }
        moveTaskToBack(true)
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback?.let { cb ->
                runCatching { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(cb) }
            }
        }
        if (::webView.isInitialized) {
            rootContainer.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private inner class UnifiedAssetWebViewClient(
        private val appContext: Context
    ) : WebViewClient() {

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            pageReady = true
            pendingWidgetTab?.let { target ->
                pendingWidgetTab = null
                dispatchTabSelectionToWeb(target)
            }
        }

        override fun shouldOverrideUrlLoading(
            view: WebView?,
            request: WebResourceRequest?
        ): Boolean {
            val uri = request?.url ?: return false
            val host = uri.host?.lowercase() ?: ""
            if (host == VIRTUAL_HOST) {
                return false
            }
            val scheme = uri.scheme?.lowercase() ?: ""
            if (scheme == "http" || scheme == "https" || scheme == "mailto") {
                runCatching {
                    val externalIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(externalIntent)
                }
                return true
            }
            return false
        }

        override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
        ): WebResourceResponse? {
            val uri = request?.url ?: return null
            val host = uri.host?.lowercase() ?: ""

            if (host != VIRTUAL_HOST) {
                val (isOnline, _) = NativeHardwareBridge.getNetworkStatus(appContext)
                if (!isOnline) {
                    return WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        503,
                        "Offline",
                        mapOf("Access-Control-Allow-Origin" to "*"),
                        ByteArrayInputStream(ByteArray(0))
                    )
                }
                return null
            }

            val rawPath = (uri.path ?: "/").trim()

            // Local offline API responses for Web UI parity
            if (rawPath.startsWith("/api/") || rawPath == "/downloads/apk-manifest.json") {
                return handleLocalApiRequest(rawPath)
            }

            val cleanRel = rawPath.trimStart('/').ifEmpty { "index.html" }
            return openWebAssetResponse(cleanRel)
        }

        private fun handleLocalApiRequest(path: String): WebResourceResponse {
            return when {
                path == "/api/health" -> jsonResponse(
                    200,
                    JSONObject()
                        .put("ok", true)
                        .put("mode", "android-standalone")
                        .put("version", "4.0.0")
                        .put("versionCode", 16)
                        .toString()
                )

                path == "/api/download/manifest" || path == "/downloads/apk-manifest.json" -> {
                    try {
                        val stream = appContext.assets.open("webapp/apk-manifest.json")
                        WebResourceResponse(
                            "application/json",
                            "UTF-8",
                            200,
                            "OK",
                            defaultHeaders(),
                            stream
                        )
                    } catch (_: Exception) {
                        jsonResponse(
                            200,
                            JSONObject()
                                .put("appName", "HyperLog")
                                .put("packageId", "com.hyperlog.rp")
                                .put("version", "4.0.0")
                                .put("versionCode", 16)
                                .toString()
                        )
                    }
                }

                path.startsWith("/api/logs") -> jsonResponse(
                    200,
                    """{"ok":true,"entries":[],"count":0}"""
                )

                path == "/api/google-sync/workout" -> {
                    val receipt = JSONObject()
                        .put("receiptId", "gsync_android_${System.currentTimeMillis()}")
                        .put("sessionId", "android_session_${System.currentTimeMillis()}")
                        .put("workoutTitle", "HyperLog Android Session")
                        .put("syncedAt", Instant.now().toString())
                        .put("status", "SYNCED_ANDROID_BRIDGE")
                        .put("googleFitDataSource", "raw:com.google.activity.segment:com.hyperlog.rp")
                        .put("healthConnectRecordType", "ExerciseSessionRecord + ActiveCaloriesBurnedRecord")
                    jsonResponse(
                        200,
                        JSONObject().put("ok", true).put("receipt", receipt).toString()
                    )
                }

                path.startsWith("/api/google-sync") -> jsonResponse(
                    200,
                    """{"ok":true,"receipts":[]}"""
                )

                else -> jsonResponse(404, """{"ok":false,"offlineEmbedded":true}""")
            }
        }

        private fun openWebAssetResponse(relativePath: String): WebResourceResponse {
            val assetStream = try {
                appContext.assets.open("webapp/$relativePath")
            } catch (_: FileNotFoundException) {
                if (!relativePath.substringAfterLast('/').contains('.')) {
                    appContext.assets.open("webapp/index.html")
                } else {
                    return WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        404,
                        "Not Found",
                        defaultHeaders(),
                        ByteArrayInputStream(ByteArray(0))
                    )
                }
            }

            val resolvedPath = if (!relativePath.substringAfterLast('/').contains('.') &&
                relativePath != "index.html"
            ) {
                "index.html"
            } else {
                relativePath
            }
            val mime = guessMimeType(resolvedPath)
            val encoding = if (
                mime.startsWith("text/") ||
                mime.contains("javascript") ||
                mime.contains("json") ||
                mime.contains("svg")
            ) {
                "UTF-8"
            } else {
                null
            }

            return WebResourceResponse(
                mime,
                encoding,
                200,
                "OK",
                defaultHeaders(),
                assetStream
            )
        }

        private fun guessMimeType(path: String): String {
            val ext = path.substringAfterLast('.', "").lowercase()
            return when (ext) {
                "html", "htm" -> "text/html"
                "js", "mjs" -> "text/javascript"
                "css" -> "text/css"
                "json" -> "application/json"
                "webmanifest" -> "application/manifest+json"
                "svg" -> "image/svg+xml"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "webp" -> "image/webp"
                "ico" -> "image/x-icon"
                "woff2" -> "font/woff2"
                "woff" -> "font/woff"
                "ttf" -> "font/ttf"
                else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                    ?: "application/octet-stream"
            }
        }

        private fun defaultHeaders(): Map<String, String> = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Cache-Control" to "no-store"
        )

        private fun jsonResponse(statusCode: Int, body: String): WebResourceResponse {
            val bytes = body.toByteArray(StandardCharsets.UTF_8)
            return WebResourceResponse(
                "application/json",
                "UTF-8",
                statusCode,
                if (statusCode in 200..299) "OK" else "Not Found",
                defaultHeaders(),
                ByteArrayInputStream(bytes)
            )
        }
    }

    inner class HyperLogNativeBridge(private val activity: Activity) {

        @JavascriptInterface
        fun isStandaloneApk(): Boolean = true

        @JavascriptInterface
        fun getAppVersionJson(): String {
            return JSONObject()
                .put("packageId", activity.packageName)
                .put("versionName", "4.0.0")
                .put("versionCode", 16)
                .put("healthConnectInstalled", NativeHardwareBridge.isHealthConnectInstalled(activity))
                .toString()
        }

        @JavascriptInterface
        fun syncTheme(themeId: String?, statusHex: String?, navHex: String?, isDark: Boolean) {
            val parsedStatus = runCatching { Color.parseColor(statusHex ?: "#FAF9FF") }
                .getOrDefault(Color.parseColor("#FAF9FF"))
            val parsedNav = runCatching { Color.parseColor(navHex ?: "#FAF9FF") }
                .getOrDefault(parsedStatus)
            activity.runOnUiThread {
                UiKit.themeMode = AppThemeMode.fromId(themeId)
                applySystemBarsAppearance(parsedStatus, parsedNav, isDark)
            }
        }

        @JavascriptInterface
        fun syncWidgetSnapshot(snapshotJson: String?, triggerSource: String?) {
            if (snapshotJson.isNullOrBlank()) return
            HyperLogStreakWidgetProvider.saveWebWidgetSnapshot(
                activity.applicationContext,
                snapshotJson,
                triggerSource ?: "web_ui_sync"
            )
        }

        @JavascriptInterface
        fun haptic(kind: String?) {
            activity.runOnUiThread {
                if (kind == "success") {
                    NativeHardwareBridge.hapticRestComplete(activity)
                } else {
                    NativeHardwareBridge.hapticTick(activity)
                }
            }
        }

        @JavascriptInterface
        fun setKeepScreenOn(keepAwake: Boolean) {
            activity.runOnUiThread {
                NativeHardwareBridge.setKeepScreenOn(activity, keepAwake)
            }
        }

        @JavascriptInterface
        fun openHealthConnectSettings(): Boolean {
            var opened = false
            val latch = java.util.concurrent.CountDownLatch(1)
            activity.runOnUiThread {
                opened = NativeHardwareBridge.openHealthConnectPermissionsOrSettings(activity)
                latch.countDown()
            }
            runCatching { latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS) }
            return opened
        }

        @JavascriptInterface
        fun syncWorkoutToHealthConnect(
            title: String?,
            durationMinutes: Int,
            completedSets: Int,
            tonnageKg: Int,
            activeCaloriesKcal: Int
        ): String {
            val cleanTitle = title?.takeIf { it.isNotBlank() } ?: "HyperLog Workout"
            activity.runOnUiThread {
                NativeHardwareBridge.syncWorkoutToHealthConnect(
                    activity = activity,
                    db = db,
                    title = cleanTitle,
                    completedSets = completedSets.coerceAtLeast(0),
                    tonnageKg = tonnageKg.coerceAtLeast(0).toDouble(),
                    durationMinutes = durationMinutes.coerceIn(5, 240),
                    modality = "strength",
                    onStatus = { /* Handled asynchronously via HealthConnectManager */ }
                )
            }
            return JSONObject()
                .put("ok", true)
                .put(
                    "detail",
                    "Queued '$cleanTitle' ($completedSets sets · $activeCaloriesKcal kcal) to Android Health Connect."
                )
                .toString()
        }

        @JavascriptInterface
        fun getHealthConnectStatusJson(): String {
            return JSONObject()
                .put("installed", NativeHardwareBridge.isHealthConnectInstalled(activity))
                .put("sdkInt", Build.VERSION.SDK_INT)
                .toString()
        }

        @JavascriptInterface
        fun requestPinHomeWidget(): Boolean {
            var requested = false
            val latch = java.util.concurrent.CountDownLatch(1)
            activity.runOnUiThread {
                requested = HyperLogStreakWidgetProvider.requestPinToHomeScreen(activity)
                latch.countDown()
            }
            runCatching { latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS) }
            return requested
        }

        @JavascriptInterface
        fun shareBase64File(
            fileName: String?,
            mimeType: String?,
            base64Data: String?,
            title: String?
        ): Boolean {
            if (fileName.isNullOrBlank() || base64Data.isNullOrBlank()) return false
            return try {
                val safeName = File(fileName).name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val exportDir = HyperLogFileProvider.exportDir(activity)
                val outFile = File(exportDir, safeName)
                outFile.writeBytes(bytes)
                val contentUri: Uri = HyperLogFileProvider.uriForExportFile(activity, outFile)
                val resolvedMime = mimeType?.takeIf { it.isNotBlank() } ?: "application/octet-stream"

                activity.runOnUiThread {
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = resolvedMime
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        putExtra(Intent.EXTRA_SUBJECT, title ?: safeName)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    val chooser = Intent.createChooser(shareIntent, title ?: "Export $safeName").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    runCatching { activity.startActivity(chooser) }
                }
                true
            } catch (_: Exception) {
                false
            }
        }
    }
}
