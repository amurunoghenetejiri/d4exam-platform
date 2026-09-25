package com.d4exam.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.Executor;

/**
 * Native biometric + notification permission for D4EXAM APK.
 * Uses Capacitor's permission aliases so PluginCall always completes (unlike raw
 * ActivityCompat request codes which Bridge often does not forward).
 */
@CapacitorPlugin(
    name = "D4NativeAuth",
    permissions = {
      @Permission(
          alias = "notifications",
          strings = {Manifest.permission.POST_NOTIFICATIONS})
    })
public class D4NativeAuthPlugin extends Plugin {

  @PluginMethod
  public void ping(PluginCall call) {
    JSObject r = new JSObject();
    r.put("ok", true);
    r.put("platform", "android");
    r.put("plugin", "D4NativeAuth");
    call.resolve(r);
  }

  @PluginMethod
  public void isBiometricAvailable(PluginCall call) {
    try {
      Activity act = getActivity();
      if (act == null) {
        call.reject("no_activity");
        return;
      }
      BiometricManager bm = BiometricManager.from(act);
      int can =
          bm.canAuthenticate(
              BiometricManager.Authenticators.BIOMETRIC_WEAK
                  | BiometricManager.Authenticators.BIOMETRIC_STRONG);
      JSObject r = new JSObject();
      r.put("canAuthenticate", can);
      if (can == BiometricManager.BIOMETRIC_SUCCESS) {
        r.put("available", true);
        r.put("status", "available");
        r.put("message", "Fingerprint ready");
      } else if (can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
        r.put("available", false);
        r.put("status", "not_enrolled");
        r.put(
            "message",
            "No fingerprint enrolled. Open phone Settings → Security → Fingerprint and add one.");
      } else if (can == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
        r.put("available", false);
        r.put("status", "no_hardware");
        r.put("message", "This device has no fingerprint sensor.");
      } else if (can == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
        // Hardware exists but busy — still allow prompt attempt
        r.put("available", true);
        r.put("status", "hw_unavailable");
        r.put("message", "Fingerprint sensor temporarily unavailable. Try again.");
      } else {
        // Unknown / other — still try prompt on device
        r.put("available", true);
        r.put("status", "unknown");
        r.put("message", "Biometric status " + can);
      }
      call.resolve(r);
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "biometric_check_failed");
    }
  }

  @PluginMethod
  public void authenticate(PluginCall call) {
    final Activity act = getActivity();
    if (!(act instanceof FragmentActivity)) {
      call.reject("no_activity");
      return;
    }
    final FragmentActivity fa = (FragmentActivity) act;
    final String title = call.getString("title", "D4EXAM");
    final String subtitle = call.getString("subtitle", "Confirm with your fingerprint");
    final String reason = call.getString("reason", "Unlock D4EXAM");
    final String negative = call.getString("negativeButtonText", "Use password");

    fa.runOnUiThread(
        () -> {
          try {
            Executor executor = ContextCompat.getMainExecutor(fa);
            BiometricPrompt prompt =
                new BiometricPrompt(
                    fa,
                    executor,
                    new BiometricPrompt.AuthenticationCallback() {
                      @Override
                      public void onAuthenticationSucceeded(
                          @NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject r = new JSObject();
                        r.put("ok", true);
                        call.resolve(r);
                      }

                      @Override
                      public void onAuthenticationError(int errorCode, @NonNull CharSequence err) {
                        JSObject r = new JSObject();
                        r.put("ok", false);
                        boolean cancelled =
                            errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_CANCELED;
                        r.put("code", cancelled ? "cancelled" : "failed");
                        r.put("message", err != null ? err.toString() : "Authentication failed");
                        call.resolve(r);
                      }

                      @Override
                      public void onAuthenticationFailed() {
                        // Keep prompt open for another attempt
                      }
                    });

            BiometricPrompt.PromptInfo info =
                new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title != null ? title : "D4EXAM")
                    .setSubtitle(subtitle)
                    .setDescription(reason)
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                            | BiometricManager.Authenticators.BIOMETRIC_WEAK)
                    .setNegativeButtonText(negative != null ? negative : "Use password")
                    .build();

            prompt.authenticate(info);
          } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "auth_failed");
          }
        });
  }

  @PluginMethod
  public void checkNotificationPermission(PluginCall call) {
    JSObject r = new JSObject();
    if (Build.VERSION.SDK_INT < 33) {
      r.put("display", "granted");
      call.resolve(r);
      return;
    }
    try {
      PermissionState state = getPermissionState("notifications");
      if (state == PermissionState.GRANTED) {
        r.put("display", "granted");
      } else if (state == PermissionState.DENIED) {
        Activity act = getActivity();
        if (act != null
            && ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
          r.put("display", "granted");
        } else {
          r.put("display", "denied");
        }
      } else {
        r.put("display", "prompt");
      }
    } catch (Exception e) {
      Activity act = getActivity();
      if (act != null
          && ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS)
              == PackageManager.PERMISSION_GRANTED) {
        r.put("display", "granted");
      } else {
        r.put("display", "prompt");
      }
    }
    call.resolve(r);
  }

  @PluginMethod
  public void requestNotificationPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT < 33) {
      JSObject r = new JSObject();
      r.put("display", "granted");
      call.resolve(r);
      return;
    }
    Activity act = getActivity();
    if (act == null) {
      call.reject("no_activity");
      return;
    }
    if (ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED) {
      JSObject r = new JSObject();
      r.put("display", "granted");
      call.resolve(r);
      return;
    }
    // Capacitor tracks this request and invokes notifPermCallback — PluginCall completes
    requestPermissionForAlias("notifications", call, "notifPermCallback");
  }

  @PermissionCallback
  private void notifPermCallback(PluginCall call) {
    JSObject r = new JSObject();
    try {
      if (getPermissionState("notifications") == PermissionState.GRANTED) {
        r.put("display", "granted");
      } else {
        r.put("display", "denied");
      }
    } catch (Exception e) {
      Activity act = getActivity();
      boolean granted =
          act != null
              && ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS)
                  == PackageManager.PERMISSION_GRANTED;
      r.put("display", granted ? "granted" : "denied");
    }
    call.resolve(r);
  }

  @PluginMethod
  public void openNotificationSettings(PluginCall call) {
    try {
      Activity act = getActivity();
      if (act == null) {
        call.reject("no_activity");
        return;
      }
      Intent intent = new Intent();
      if (Build.VERSION.SDK_INT >= 26) {
        intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, act.getPackageName());
      } else {
        intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + act.getPackageName()));
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      act.startActivity(intent);
      JSObject r = new JSObject();
      r.put("ok", true);
      call.resolve(r);
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "settings_failed");
    }
  }
}
