package com.d4exam.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import com.getcapacitor.BridgeActivity;

/**
 * D4EXAM main activity — Capacitor WebView shell loading production Vercel URL.
 *
 * Do not use the AndroidX system splash install API here: it needs a matching
 * theme + dependency and caused instant cold-start crashes when CI regenerates
 * the Android project. Splash is handled by:
 *   1) AppTheme.NoActionBarLaunch (solid navy, no adaptive-icon flash on API 31+)
 *   2) Capacitor SplashScreen plugin (kept until web hides it)
 *   3) AnimatedSplash in the web app (branded D4EXAM screen)
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Register native plugins BEFORE super.onCreate (Capacitor requirement)
    registerPlugin(ExamImmersivePlugin.class);
    registerPlugin(ScreenSharePlugin.class);

    super.onCreate(savedInstanceState);
    applyChromeColors();
  }

  @Override
  public void onResume() {
    super.onResume();
    applyChromeColors();
  }

  private void applyChromeColors() {
    try {
      Window w = getWindow();
      if (w == null) return;
      int navy = Color.parseColor("#0b1b3a");
      w.setStatusBarColor(navy);
      w.setNavigationBarColor(navy);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        w.setNavigationBarContrastEnforced(false);
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        View decor = w.getDecorView();
        int flags = decor.getSystemUiVisibility();
        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        decor.setSystemUiVisibility(flags);
      }
    } catch (Exception ignored) {
      // Never block launch
    }
  }
}
