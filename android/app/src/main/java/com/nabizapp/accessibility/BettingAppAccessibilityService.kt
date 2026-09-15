package com.nabizapp.accessibility

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Native Android AccessibilityService — JS/React'te hiçbir şekilde yazılamaz, bu yüzden native
 * Kotlin sınıf olarak var. TYPE_WINDOW_STATE_CHANGED dinler (düşük frekanslı/olay-tabanlı,
 * BLE'nin yüksek frekanslı "sıcak yol"unun aksine — bkz. yapım planı Bölüm 4).
 *
 * Davranışsal sinyal SALT "app açık" booleanı değildir (Bölüm 17/Bulgu 1 teammate-audit düzeltmesi):
 * aynı paketin kısa sürede tekrar ön-plana gelme frekansı basit bir örüntü skoruna çevrilir.
 * Gerçek "bahis sıklığı/tutarı" tespiti (erişilebilirlik ağacından işlem tutarı okuma) daha ileri bir
 * ContentClassifier stretch-goal'ü — bu servis onun temelini atar, tam çözüm değildir.
 */
class BettingAppAccessibilityService : AccessibilityService() {

    companion object {
        // AccessibilityBridgeModule (RN native modülü) başlatıldığında kendini buraya kaydeder.
        // Servis telefon açılışında JS bridge'den önce tetiklenirse (soğuk-başlangıç yarışı) olaylar
        // aşağıdaki bellek-içi `pendingEvents` kuyruğunda birikir ve listener bağlanır bağlanmaz
        // sırayla iletilir — bu, dokümante edilmiş yarış durumunu kapatır. Bu kuyruk process
        // ölümünde HAYATTA KALMAZ (disk'e yazılmaz); tam kalıcılık için WorkManager tabanlı bir
        // kuyruk gerekir ama AccessibilityService'in process'i normalde uygulamayla birlikte yaşadığı
        // için (bkz. MonitoringForegroundService) bu, 6-8 haftalık prototip kapsamında gereksiz bir
        // ek karmaşıklık — gerçek ihtiyaç ortaya çıkarsa gelecek çalışma olarak bırakılıyor.
        @Volatile
        private var _listener: BettingRiskListener? = null

        var listener: BettingRiskListener?
            get() = _listener
            set(value) {
                _listener = value
                if (value != null) flushPendingEvents(value)
            }

        private const val MAX_PENDING_EVENTS = 50
        private val pendingEvents = ArrayDeque<PendingEvent>()

        private data class PendingEvent(
            val packageName: String,
            val domain: String?,
            val eventType: String,
            val patternScore: Double,
        )

        @Synchronized
        private fun flushPendingEvents(target: BettingRiskListener) {
            while (pendingEvents.isNotEmpty()) {
                val e = pendingEvents.removeFirst()
                target.onBettingRiskEvent(e.packageName, e.domain, e.eventType, e.patternScore)
            }
        }

        @Synchronized
        private fun dispatch(packageName: String, domain: String?, eventType: String, patternScore: Double) {
            val currentListener = _listener
            if (currentListener != null) {
                currentListener.onBettingRiskEvent(packageName, domain, eventType, patternScore)
            } else {
                if (pendingEvents.size >= MAX_PENDING_EVENTS) pendingEvents.removeFirst()
                pendingEvents.addLast(PendingEvent(packageName, domain, eventType, patternScore))
            }
        }

        val KNOWN_BETTING_PACKAGES: Set<String> = setOf(
            "com.iddaa.android",
            "com.nesine.android",
            "com.misli.android",
            "com.tuttur.android",
            "com.bilyoner.android",
        )

        val TEXT_KEYWORDS: List<String> = listOf(
            "canlı bahis", "canlı casino", "hoşgeldin bonusu", "çevrim şartı",
            "deneme bonusu", "yatırım bonusu", "kayıp bonusu", "güncel giriş",
            "resmi giriş adresi", "alternatif site", "kesintisiz erişim",
        )

        private const val PATTERN_WINDOW_MS = 5 * 60 * 1000L
        private const val MAX_TREE_SCAN_DEPTH = 8
    }

    interface BettingRiskListener {
        fun onBettingRiskEvent(
            packageName: String,
            domain: String?,
            eventType: String,
            patternScore: Double,
        )
    }

    private val recentPackageTimestamps = mutableMapOf<String, MutableList<Long>>()

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val packageName = event.packageName?.toString() ?: return
        val now = System.currentTimeMillis()

        val isKnownBettingApp = KNOWN_BETTING_PACKAGES.contains(packageName)
        val matchedKeyword = if (!isKnownBettingApp) {
            try {
                scanForKeyword(rootInActiveWindow, depth = 0)
            } catch (e: Exception) {
                null
            }
        } else null

        if (!isKnownBettingApp && matchedKeyword == null) return

        val timestamps = recentPackageTimestamps.getOrPut(packageName) { mutableListOf() }
        timestamps.add(now)
        timestamps.removeAll { now - it > PATTERN_WINDOW_MS }

        // Basit frekans-tabanlı örüntü skoru (0-1): pencerede 5+ kez ön-plana gelme = tam skor.
        val patternScore = (timestamps.size / 5.0).coerceAtMost(1.0)

        dispatch(
            packageName = packageName,
            domain = matchedKeyword,
            eventType = if (isKnownBettingApp) "app_foreground" else "bet_pattern_detected",
            patternScore = patternScore,
        )
    }

    private fun scanForKeyword(node: AccessibilityNodeInfo?, depth: Int): String? {
        if (node == null || depth > MAX_TREE_SCAN_DEPTH) return null
        val text = node.text?.toString()?.lowercase()
        if (text != null) {
            for (keyword in TEXT_KEYWORDS) {
                if (text.contains(keyword)) return keyword
            }
        }
        for (i in 0 until node.childCount) {
            val childMatch = scanForKeyword(node.getChild(i), depth + 1)
            if (childMatch != null) return childMatch
        }
        return null
    }

    override fun onInterrupt() {}
}
