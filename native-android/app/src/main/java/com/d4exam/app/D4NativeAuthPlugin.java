package com.d4exam.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

/**
 * D4EXAM native auth helpers — works with server.url remote WebView.
 * BiometricPrompt + POST_NOTIFICATIONS without relying solely on Capgo/LocalNotifications.
 */
@CapacitorPlugin(name = "D4NativeAuth")
public class D4NativeAuthPlugin extends Plugin {
  private static final int REQ_POST_NOTIF = 4401;
  private PluginCall pendingNotifCall;

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
      boolean ok =
          can == BiometricManager.BIOMETRIC_SUCCESS
              || can == BiometricManager.BIOMETRIC_STATUS_UNKNOWN;
      r.put("available", ok || can == BiometricManager.BIOMETRIC_SUCCESS);
      r.put("canAuthenticate", can);
      r.put(
          "status",
          can == BiometricManager.BIOMETRIC_SUCCESS
              ? "available"
              : can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED
                  ? "not_enrolled"
              : can == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
                  ? "no_hardware"
              : can == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE
                  ? "hw_unavailable"
                  : "unavailable");
      // Treat SUCCESS as available
      r.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
      if (can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
        r.put("available", false);
        r.put("message", "No fingerprint enrolled. Add one in phone Settings → Security.");
      } else if (can == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
        r.put("message", "This device has no fingerprint sensor.");
      } else if (can == BiometricManager.BIOMETRIC_SUCCESS) {
        r.put("message", "Fingerprint ready");
      } else {
        r.put("message", "Biometric not available (code " + can + ")");
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
                        // USER_CANCELED = 10, NEGATIVE_BUTTON = 13
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
                        // Keep prompt open; do not resolve yet
                      }
                    });

            BiometricPrompt.PromptInfo.Builder builder =
                new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title != null ? title : "D4EXAM")
                    .setSubtitle(subtitle)
                    .setDescription(reason)
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                            | BiometricManager.Authenticators.BIOMETRIC_WEAK)
                    .setNegativeButtonText(negative != null ? negative : "Use password");

            prompt.authenticate(builder.build());
          } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "auth_failed");
          }
        });
  }

  @PluginMethod
  public void checkNotificationPermission(PluginCall call) {
    JSObject r = new JSObject();
    Activity act = getActivity();
    if (act == null) {
      r.put("display", "denied");
      call.resolve(r);
      return;
    }
    if (Build.VERSION.SDK_INT < 33) {
      r.put("display", "granted");
      call.resolve(r);
      return;
    }
    int st =
        ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS);
    r.put("display", st == PackageManager.PERMISSION_GRANTED ? "granted" : "prompt");
    call.resolve(r);
  }

  @PluginMethod
  public void requestNotificationPermission(PluginCall call) {
    Activity act = getActivity();
    if (act == null) {
      call.reject("no_activity");
      return;
    }
    if (Build.VERSION.SDK_INT < 33) {
      JSObject r = new JSObject();
      r.put("display", "granted");
      call.resolve(r);
      return;
    }
    int st =
        ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS);
    if (st == PackageManager.PERMISSION_GRANTED) {
      JSObject r = new JSObject();
      r.put("display", "granted");
      call.resolve(r);
      return;
    }
    pendingNotifCall = call;
    ActivityCompat.requestPermissions(
        act, new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_POST_NOTIF);
  }

  @Override
  protected void handleRequestPermissionsResult(
      int requestCode, String[] permissions, int[] grantResults) {
    super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQ_POST_NOTIF || pendingNotifCall == null) return;
    PluginCall call = pendingNotifCall;
    pendingNotifCall = null;
    JSObject r = new JSObject();
    boolean granted =
        grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
    r.put("display", granted ? "granted" : "denied");
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
