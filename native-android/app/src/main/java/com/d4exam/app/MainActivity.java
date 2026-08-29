package com.d4exam.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

/**
 * D4EXAM main activity.
 *
 * Native splash (Theme.SplashScreen + Capacitor SplashScreen) shows the branded
 * D4EXAM artwork immediately on cold start — offline, no Vercel dependency.
 * Plugins registered before super.onCreate as required by Capacitor.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Android 12+ system splash → seamless handoff to Capacitor splash drawable
    SplashScreen splash = SplashScreen.installSplashScreen(this);
    splash.setKeepOnScreenCondition(() -> false);

    registerPlugin(ExamImmersivePlugin.class);
    registerPlugin(ScreenSharePlugin.class);
    super.onCreate(savedInstanceState);
    applyChromeColors();
    try {
      Window w = getWindow();
      if (w != null) {
        w.setStatusBarColor(Color.parseColor("#0b1b3a"));
        w.setNavigationBarColor(Color.parseColor("#0b1b3a"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          w.setNavigationBarContrastEnforced(false);
        }
      }
    } catch (Exception ignored) { }

    // Subtle fade-in of web content after splash (decorative only).
    try {
      View content = findViewById(android.R.id.content);
      if (content != null) {
        content.setAlpha(0f);
        content.animate().alpha(1f).setDuration(350).start();
      }
    } catch (Throwable ignored) {
      // Never block launch
    }
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
    }
  }

}
