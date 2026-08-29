#!/usr/bin/env python3
from pathlib import Path
p = Path("android/app/src/main/java/com/d4exam/app/ScreenSharePlugin.java")
t = p.read_text()
if "Context not available after permission" in t:
    print("already hardened")
    raise SystemExit(0)
old = '''  @ActivityCallback
  private void onScreenPermission(PluginCall call, ActivityResult result) {
    sLivePlugin = this;
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      Log.w(TAG, "permission denied");
      call.reject("Screen share permission denied");
      return;
    }
    try {
      ScreenCaptureService.resetReady();
      Intent svc = new Intent(getContext(), ScreenCaptureService.class);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        getContext().startForegroundService(svc);
      } else {
        getContext().startService(svc);
      }
      boolean ready = false;
      try {
        ready = ScreenCaptureService.READY_LATCH.await(4, TimeUnit.SECONDS);
      } catch (InterruptedException ie) {
        Thread.currentThread().interrupt();
      }
      if (!ready || !ScreenCaptureService.FOREGROUND_READY.get()) {
        Log.w(TAG, "FGS not ready in time — proceeding anyway");
      }

      if (projectionManager == null) {
        projectionManager =
            (MediaProjectionManager)
                getActivity().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
      }
      MediaProjection mp =
          projectionManager.getMediaProjection(result.getResultCode(), result.getData());'''
new = '''  @ActivityCallback
  private void onScreenPermission(PluginCall call, ActivityResult result) {
    sLivePlugin = this;
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      Log.w(TAG, "permission denied");
      try { call.reject("Screen share permission denied"); } catch (Exception ignored) {}
      return;
    }
    try {
      Activity activity = getActivity();
      Context ctx = getContext();
      if (ctx == null) {
        try { call.reject("Context not available after permission"); } catch (Exception ignored) {}
        return;
      }
      ScreenCaptureService.resetReady();
      Intent svc = new Intent(ctx, ScreenCaptureService.class);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(svc);
      } else {
        ctx.startService(svc);
      }
      boolean ready = false;
      try {
        ready = ScreenCaptureService.READY_LATCH.await(4, TimeUnit.SECONDS);
      } catch (InterruptedException ie) {
        Thread.currentThread().interrupt();
      }
      if (!ready || !ScreenCaptureService.FOREGROUND_READY.get()) {
        Log.w(TAG, "FGS not ready in time — proceeding anyway");
      }

      if (projectionManager == null) {
        Context svcCtx = activity != null ? activity : ctx;
        projectionManager =
            (MediaProjectionManager)
                svcCtx.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
      }
      if (projectionManager == null) {
        try { call.reject("MediaProjection service unavailable"); } catch (Exception ignored) {}
        return;
      }
      MediaProjection mp =
          projectionManager.getMediaProjection(result.getResultCode(), result.getData());'''
if old not in t:
    print("block not found")
    raise SystemExit(1)
t = t.replace(old, new, 1)
p.write_text(t)
print("Android ScreenSharePlugin hardened")
