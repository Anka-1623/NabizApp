package com.nabizapp.accessibility

import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Native Module — BettingAppAccessibilityService olaylarını NativeEventEmitter ile JS'e yollar. */
class AccessibilityBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), BettingAppAccessibilityService.BettingRiskListener {

    companion object {
        const val NAME = "AccessibilityBridgeModule"
        const val EVENT_BETTING_RISK = "NabizAccessibilityBettingRisk"
    }

    init {
        BettingAppAccessibilityService.listener = this
    }

    override fun getName(): String = NAME

    override fun onBettingRiskEvent(
        packageName: String,
        domain: String?,
        eventType: String,
        patternScore: Double,
    ) {
        val params = Arguments.createMap().apply {
            putDouble("timestampMs", System.currentTimeMillis().toDouble())
            putString("packageName", packageName)
            if (domain != null) putString("domain", domain) else putNull("domain")
            putString("eventType", eventType)
            putDouble("patternScore", patternScore)
        }
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_BETTING_RISK, params)
        }
    }

    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        val expectedComponentName =
            "${reactApplicationContext.packageName}/com.nabizapp.accessibility.BettingAppAccessibilityService"
        val enabledServicesSetting = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: ""
        val colonSplitter = TextUtils.SimpleStringSplitter(':')
        colonSplitter.setString(enabledServicesSetting)
        var found = false
        while (colonSplitter.hasNext()) {
            if (colonSplitter.next().equals(expectedComponentName, ignoreCase = true)) {
                found = true
                break
            }
        }
        promise.resolve(found)
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }

    // NativeEventEmitter (RN) addListener/removeListeners çağrılarını gerektirir — no-op yeterli.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
