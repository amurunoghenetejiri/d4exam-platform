package com.d4exam.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native screen capture for D4EXAM exam monitoring (MediaProjection).
 *
 * Critical design:
 * - Capture state is STATIC so it survives Capacitor plugin / WebView recreation
 *   when the student moves from the security gate into the live CBT session.
 * - stop() is ignored while keepAlive is true (exam hold).
 * - handleOnDestroy does NOT tear down projection while keepAlive is true.
 * - Frames are emitted as JPEG base64 via the "frame" listener and cached for getLatestFrame.
 */
@CapacitorPlugin(name = "D4ScreenShare")
public class ScreenSharePlugin extends Plugin {
  private static final String TAG = "D4ScreenShare";

  private static volatile MediaProjection sMediaProjection = null;
  private static volatile VirtualDisplay sVirtualDisplay = null;
  private static volatile ImageReader sImageReader = null;
  private static volatile HandlerThread sHandlerThread = null;
  private static volatile Handler sHandler = null;
  private static final AtomicBoolean sCapturing = new AtomicBoolean(false);
  private static final AtomicBoolean sKeepAlive = new AtomicBoolean(false);
  private static volatile int sScreenWidth = 720;
  private static volatile int sScreenHeight = 1280;
  private static volatile int sScreenDensity = 320;
  private static volatile long sLastEmitMs = 0;
  private static volatile String sLatestJpeg = null;
  private static volatile long sLatestTs = 0;
  private static volatile int sLatestW = 0;
  private static volatile int sLatestH = 0;
  private static final long MIN_FRAME_INTERVAL_MS = 500;
  private static volatile ScreenSharePlugin sLivePlugin = null;

  private MediaProjectionManager projectionManager;

  @Override
  public void load() {
    super.load();
    sLivePlugin = this;
    Log.i(TAG, "plugin load capturing=" + sCapturing.get() + " keepAlive=" + sKeepAlive.get());
  }

  @PluginMethod
  public void isAvailable(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("available", true);
    ret.put("platform", "android");
    call.resolve(ret);
  }

  @PluginMethod
  public void setKeepAlive(PluginCall call) {
    boolean hold = Boolean.TRUE.equals(call.getBoolean("hold", false));
    sKeepAlive.set(hold);
    Log.i(TAG, "setKeepAlive=" + hold);
    JSObject ret = new JSObject();
    ret.put("keepAlive", hold);
    ret.put("active", isReallyActive());
    call.resolve(ret);
  }

  @PluginMethod
  public void start(PluginCall call) {
    sLivePlugin = this;
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("Activity not available");
      return;
    }

    if (isReallyActive()) {
      Log.i(TAG, "start: already capturing — reuse");
      JSObject ret = new JSObject();
      ret.put("active", true);
      ret.put("reused", true);
      call.resolve(ret);
      return;
    }

    if (sMediaProjection != null && !sCapturing.get()) {
      Log.i(TAG, "start: projection alive, rebuilding virtual display");
      try {
        ensureMetrics(activity);
        startCaptureInternal();
        JSObject ret = new JSObject();
        ret.put("active", sCapturing.get());
        ret.put("rebuilt", true);
        call.resolve(ret);
        return;
      } catch (Exception e) {
        Log.e(TAG, "rebuild failed", e);
        releaseDisplayOnly();
      }
    }

    try {
      ensureMetrics(activity);
    } catch (Exception ignored) {
    }

    projectionManager =
        (MediaProjectionManager) activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
    if (projectionManager == null) {
      call.reject("MediaProjection not available");
      return;
    }
    Log.i(TAG, "start: requesting MediaProjection permission");
    Intent intent = projectionManager.createScreenCaptureIntent();
    startActivityForResult(call, intent, "onScreenPermission");
  }

  @ActivityCallback
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
          projectionManager.getMediaProjection(result.getResultCode(), result.getData());
      if (mp == null) {
        call.reject("Could not create MediaProjection");
        return;
      }
      sMediaProjection = mp;

      mp.registerCallback(
          new MediaProjection.Callback() {
            @Override
            public void onStop() {
              Log.w(TAG, "MediaProjection.onStop — system stopped projection");
              sCapturing.set(false);
              releaseDisplayOnly();
              sMediaProjection = null;
              sKeepAlive.set(false);
              notifyStopped();
            }
          },
          new Handler(Looper.getMainLooper()));

      startCaptureInternal();
      if (!sCapturing.get()) {
        call.reject("Failed to start screen capture pipeline");
        return;
      }
      sKeepAlive.set(true);
      Log.i(TAG, "SCREEN_CAPTURE_STARTED " + sScreenWidth + "x" + sScreenHeight);
      JSObject ret = new JSObject();
      ret.put("active", true);
      call.resolve(ret);
    } catch (Exception e) {
      Log.e(TAG, "Failed to start screen share", e);
      call.reject("Failed to start screen share: " + e.getMessage());
    }
  }

  @PluginMethod
  public void stop(PluginCall call) {
    if (sKeepAlive.get()) {
      Log.w(TAG, "stop ignored — keepAlive active");
      JSObject ret = new JSObject();
      ret.put("active", isReallyActive());
      ret.put("ignored", true);
      call.resolve(ret);
      return;
    }
    Log.i(TAG, "stop: explicit stop requested");
    stopCaptureInternal(true);
    JSObject ret = new JSObject();
    ret.put("active", false);
    call.resolve(ret);
  }

  @PluginMethod
  public void isActive(PluginCall call) {
    JSObject ret = new JSObject();
    boolean active = isReallyActive();
    ret.put("active", active);
    ret.put("capturing", sCapturing.get());
    ret.put("hasProjection", sMediaProjection != null);
    ret.put("keepAlive", sKeepAlive.get());
    call.resolve(ret);
  }

  @PluginMethod
  public void getLatestFrame(PluginCall call) {
    sLivePlugin = this;
    JSObject ret = new JSObject();
    boolean active =
        isReallyActive()
            || (sLatestJpeg != null && (System.currentTimeMillis() - sLatestTs) < 12000);
    ret.put("active", active);
    if (sLatestJpeg != null && sLatestJpeg.length() > 0) {
      ret.put("jpeg", sLatestJpeg);
      ret.put("ts", sLatestTs);
      ret.put("width", sLatestW);
      ret.put("height", sLatestH);
    }
    call.resolve(ret);
  }

  @PluginMethod
  public void ensureRunning(PluginCall call) {
    sLivePlugin = this;
    try {
      if (isReallyActive()) {
        JSObject ret = new JSObject();
        ret.put("active", true);
        call.resolve(ret);
        return;
      }
      if (sMediaProjection != null) {
        Activity activity = getActivity();
        if (activity != null) {
          try {
            ensureMetrics(activity);
          } catch (Exception ignored) {
          }
        }
        startCaptureInternal();
        JSObject ret = new JSObject();
        ret.put("active", sCapturing.get());
        call.resolve(ret);
        return;
      }
      JSObject ret = new JSObject();
      ret.put("active", false);
      call.resolve(ret);
    } catch (Exception e) {
      JSObject ret = new JSObject();
      ret.put("active", false);
      ret.put("error", e.getMessage());
      call.resolve(ret);
    }
  }

  private static boolean isReallyActive() {
    return sCapturing.get() && sMediaProjection != null && sVirtualDisplay != null;
  }

  private void ensureMetrics(Activity activity) {
    WindowManager wm = (WindowManager) activity.getSystemService(Context.WINDOW_SERVICE);
    if (wm != null) {
      DisplayMetrics metrics = new DisplayMetrics();
      wm.getDefaultDisplay().getRealMetrics(metrics);
      sScreenWidth = Math.min(metrics.widthPixels, 720);
      sScreenHeight =
          Math.max(1, (int) ((float) metrics.heightPixels / metrics.widthPixels * sScreenWidth));
      sScreenDensity = metrics.densityDpi;
    }
  }

  private void startCaptureInternal() {
    releaseDisplayOnly();
    if (sMediaProjection == null) {
      sCapturing.set(false);
      return;
    }
    sHandlerThread = new HandlerThread("D4ScreenShare");
    sHandlerThread.start();
    sHandler = new Handler(sHandlerThread.getLooper());

    sImageReader =
        ImageReader.newInstance(sScreenWidth, sScreenHeight, PixelFormat.RGBA_8888, 2);
    sImageReader.setOnImageAvailableListener(
        reader -> {
          if (!sCapturing.get()) return;
          long now = System.currentTimeMillis();
          if (now - sLastEmitMs < MIN_FRAME_INTERVAL_MS) {
            Image skip = null;
            try {
              skip = reader.acquireLatestImage();
            } catch (Exception ignored) {
            } finally {
              if (skip != null) skip.close();
            }
            return;
          }
          Image image = null;
          try {
            image = reader.acquireLatestImage();
            if (image == null) return;
            sLastEmitMs = now;
            String jpegB64 = imageToJpegBase64(image);
            if (jpegB64 != null) {
              sLatestJpeg = jpegB64;
              sLatestTs = now;
              sLatestW = sScreenWidth;
              sLatestH = sScreenHeight;
              JSObject data = new JSObject();
              data.put("jpeg", jpegB64);
              data.put("width", sScreenWidth);
              data.put("height", sScreenHeight);
              data.put("ts", now);
              ScreenSharePlugin plugin = sLivePlugin;
              if (plugin != null) {
                plugin.notifyListeners("frame", data);
              }
            }
          } catch (Exception ignored) {
          } finally {
            if (image != null) image.close();
          }
        },
        sHandler);

    sVirtualDisplay =
        sMediaProjection.createVirtualDisplay(
            "D4EXAM-Screen",
            sScreenWidth,
            sScreenHeight,
            sScreenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            sImageReader.getSurface(),
            null,
            sHandler);
    sCapturing.set(sVirtualDisplay != null);
    Log.i(TAG, "startCaptureInternal capturing=" + sCapturing.get());
  }

  private static String imageToJpegBase64(Image image) {
    try {
      Image.Plane[] planes = image.getPlanes();
      ByteBuffer buffer = planes[0].getBuffer();
      int pixelStride = planes[0].getPixelStride();
      int rowStride = planes[0].getRowStride();
      int rowPadding = rowStride - pixelStride * sScreenWidth;
      Bitmap bitmap =
          Bitmap.createBitmap(
              sScreenWidth + rowPadding / pixelStride, sScreenHeight, Bitmap.Config.ARGB_8888);
      bitmap.copyPixelsFromBuffer(buffer);
      Bitmap cropped = Bitmap.createBitmap(bitmap, 0, 0, sScreenWidth, sScreenHeight);
      if (cropped != bitmap) bitmap.recycle();
      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      cropped.compress(Bitmap.CompressFormat.JPEG, 55, baos);
      cropped.recycle();
      return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
    } catch (Exception e) {
      return null;
    }
  }

  private static void releaseDisplayOnly() {
    sCapturing.set(false);
    try {
      if (sVirtualDisplay != null) {
        sVirtualDisplay.release();
        sVirtualDisplay = null;
      }
    } catch (Exception ignored) {
    }
    try {
      if (sImageReader != null) {
        sImageReader.close();
        sImageReader = null;
      }
    } catch (Exception ignored) {
    }
    try {
      if (sHandlerThread != null) {
        sHandlerThread.quitSafely();
        sHandlerThread = null;
        sHandler = null;
      }
    } catch (Exception ignored) {
    }
  }

  private void releaseProjectionOnly() {
    releaseDisplayOnly();
    try {
      if (sMediaProjection != null) {
        sMediaProjection.stop();
        sMediaProjection = null;
      }
    } catch (Exception ignored) {
    }
  }

  private void stopCaptureInternal(boolean stopService) {
    Log.i(TAG, "stopCaptureInternal stopService=" + stopService);
    sKeepAlive.set(false);
    sLatestJpeg = null;
    sLatestTs = 0;
    releaseProjectionOnly();
    if (stopService) {
      try {
        getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
      } catch (Exception ignored) {
      }
      ScreenCaptureService.FOREGROUND_READY.set(false);
    }
  }

  private void notifyStopped() {
    JSObject data = new JSObject();
    data.put("active", false);
    ScreenSharePlugin plugin = sLivePlugin;
    if (plugin != null) {
      plugin.notifyListeners("stopped", data);
    }
  }

  @Override
  protected void handleOnDestroy() {
    if (sKeepAlive.get()) {
      Log.i(TAG, "handleOnDestroy — keepAlive, leaving projection running");
      sLivePlugin = null;
      super.handleOnDestroy();
      return;
    }
    Log.i(TAG, "handleOnDestroy — stopping capture");
    stopCaptureInternal(true);
    sLivePlugin = null;
    super.handleOnDestroy();
  }
}
