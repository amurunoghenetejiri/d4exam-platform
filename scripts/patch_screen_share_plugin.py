from pathlib import Path
p = Path("native-android/app/src/main/java/com/d4exam/app/ScreenSharePlugin.java")
t = p.read_text()
t = t.replace(
    "ScreenCaptureService.READY_LATCH.await(4, TimeUnit.SECONDS);",
    "ScreenCaptureService.READY_LATCH.await(8, TimeUnit.SECONDS);",
)
old_await = """      try {
        ScreenCaptureService.READY_LATCH.await(8, TimeUnit.SECONDS);
      } catch (InterruptedException ie) {
        Thread.currentThread().interrupt();
      }

      if (projectionManager == null) {"""
new_await = """      try {
        ScreenCaptureService.READY_LATCH.await(8, TimeUnit.SECONDS);
      } catch (InterruptedException ie) {
        Thread.currentThread().interrupt();
      }
      if (!ScreenCaptureService.FOREGROUND_READY.get()) {
        Log.w(TAG, "FGS not ready after await — retry startForegroundService");
        try {
          ScreenCaptureService.resetReady();
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(svc);
          } else {
            getContext().startService(svc);
          }
          ScreenCaptureService.READY_LATCH.await(5, TimeUnit.SECONDS);
        } catch (Exception retryEx) {
          Log.e(TAG, "FGS retry failed", retryEx);
        }
      }
      if (!ScreenCaptureService.FOREGROUND_READY.get()) {
        call.reject(
            "Could not start screen monitoring service. Allow notifications for D4EXAM and try again.");
        return;
      }

      if (projectionManager == null) {"""
if old_await in t:
    t = t.replace(old_await, new_await, 1)
    print("await ok")
elif "FGS not ready after await" in t:
    print("await already")
else:
    print("await MISSING")

old_onstop = """          new MediaProjection.Callback() {
            @Override
            public void onStop() {
              sCapturing.set(false);
              releaseDisplayOnly();
              sMediaProjection = null;
              notifyStopped();
            }
          },"""
new_onstop = """          new MediaProjection.Callback() {
            @Override
            public void onStop() {
              Log.w(TAG, "MediaProjection onStop keepAlive=" + sKeepAlive.get());
              sCapturing.set(false);
              releaseDisplayOnly();
              sMediaProjection = null;
              if (sKeepAlive.get()) {
                try {
                  Intent svc2 = new Intent(getContext(), ScreenCaptureService.class);
                  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getContext().startForegroundService(svc2);
                  } else {
                    getContext().startService(svc2);
                  }
                } catch (Exception ignored) {
                }
              }
              notifyStopped();
            }
          },"""
if old_onstop in t:
    t = t.replace(old_onstop, new_onstop, 1)
    print("onStop ok")
elif "MediaProjection onStop keepAlive" in t:
    print("onStop already")
else:
    print("onStop MISSING")

p.write_text(t)
print("plugin size", p.stat().st_size)
