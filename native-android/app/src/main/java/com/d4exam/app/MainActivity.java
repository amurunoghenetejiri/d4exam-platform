package com.d4exam.app;

import android.os.Bundle;
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
}
