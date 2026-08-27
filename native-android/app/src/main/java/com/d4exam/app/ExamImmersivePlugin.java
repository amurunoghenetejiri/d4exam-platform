package com.d4exam.app;

import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hide Android status + navigation bars during a locked CBT session.
 * Uses immersive sticky so bars stay hidden until the exam ends.
 */
@CapacitorPlugin(name = "ExamImmersive")
public class ExamImmersivePlugin extends Plugin {

  @PluginMethod
  public void enter(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      try {
        Window window = getActivity().getWindow();
        View decor = window.getDecorView();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, decor);
          if (c != null) {
            c.hide(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
            c.setSystemBarsBehavior(
              WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
          }
        } else {
          //noinspection deprecation
          decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
              | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_FULLSCREEN
          );
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      } catch (Exception ignored) {
      }
      call.resolve();
    });
  }

  @PluginMethod
  public void exit(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      try {
        Window window = getActivity().getWindow();
        View decor = window.getDecorView();
        WindowCompat.setDecorFitsSystemWindows(window, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, decor);
          if (c != null) {
            c.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
          }
        } else {
          //noinspection deprecation
          decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      } catch (Exception ignored) {
      }
      call.resolve();
    });
  }
}
