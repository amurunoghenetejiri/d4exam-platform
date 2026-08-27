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
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.activity.result.ActivityResult;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.TimeUnit;

/**
 * Native screen capture for D4EXAM exam monitoring (MediaProjection).
 * Lifecycle survives exam start / route changes / immersive mode.
 * stop() only on explicit exam end.
 */
@CapacitorPlugin(name = "D4ScreenShare")
public class ScreenSharePlugin extends Plugin {
  private static final String TAG = "D4ScreenShare";

  private MediaProjectionManager projectionManager;
  private MediaProjection mediaProjection;
  private VirtualDisplay virtualDisplay;
  private ImageReader imageReader;
  private HandlerThread handlerThread;
  private Handler handler;
  private volatile boolean capturing = false;
  private int screenWidth = 720;
  private int screenHeight = 1280;
  private int screenDensity = 320;
  private long lastEmitMs = 0;
  private static final long MIN_FRAME_INTERVAL_MS = 550;

  @PluginMethod
  public void isAvailable(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("available", true);
    ret.put("platform", "android");
    call.resolve(ret);
  }

  @PluginMethod
  public void start(PluginCall call) {
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("Activity not available");
      return;
    }
    if (capturing && mediaProjection != null && virtualDisplay != null) {
      Log.i(TAG, "start: already capturing — reuse");
      JSObject ret = new JSObject();
      ret.put("active", true);
      ret.put("reused", true);
      call.resolve(ret);
      return;
    }
    if (mediaProjection != null && !capturing) {
      Log.i(TAG, "start: projection alive, rebuilding virtual display");
      try {
        ensureMetrics(activity);
        startCaptureInternal();
        JSObject ret = new JSObject();
        ret.put("active", capturing);
        ret.put("rebuilt", true);
        call.resolve(ret);
        return;
      } catch (Exception e) {
        Log.e(TAG, "rebuild failed", e);
        releaseProjectionOnly();
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
      boolean ready = ScreenCaptureService.READY_LATCH.await(3, TimeUnit.SECONDS);
      if (!ready || !ScreenCaptureService.FOREGROUND_READY.get()) {
        Log.w(TAG, "FGS not ready in time — proceeding anyway");
      }

      mediaProjection = projectionManager.getMediaProjection(result.getResultCode(), result.getData());
      if (mediaProjection == null) {
        call.reject("Could not create MediaProjection");
        return;
      }

      mediaProjection.registerCallback(
          new MediaProjection.Callback() {
            @Override
            public void onStop() {
              Log.w(TAG, "MediaProjection.onStop — system stopped projection");
              capturing = false;
              releaseDisplayOnly();
              mediaProjection = null;
              notifyStopped();
            }
          },
          new Handler(Looper.getMainLooper()));

      startCaptureInternal();
      if (!capturing) {
        call.reject("Failed to start screen capture pipeline");
        return;
      }
      Log.i(TAG, "SCREEN_CAPTURE_STARTED " + screenWidth + "x" + screenHeight);
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
    Log.i(TAG, "stop: explicit stop requested");
    stopCaptureInternal(true);
    JSObject ret = new JSObject();
    ret.put("active", false);
    call.resolve(ret);
  }

  @PluginMethod
  public void isActive(PluginCall call) {
    JSObject ret = new JSObject();
    boolean active = capturing && mediaProjection != null && virtualDisplay != null;
    ret.put("active", active);
    ret.put("capturing", capturing);
    ret.put("hasProjection", mediaProjection != null);
    call.resolve(ret);
  }

  @PluginMethod
  public void ensureRunning(PluginCall call) {
    try {
      if (capturing && mediaProjection != null && virtualDisplay != null) {
        JSObject ret = new JSObject();
        ret.put("active", true);
        call.resolve(ret);
        return;
      }
      if (mediaProjection != null) {
        startCaptureInternal();
        JSObject ret = new JSObject();
        ret.put("active", capturing);
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

  private void ensureMetrics(Activity activity) {
    WindowManager wm = (WindowManager) activity.getSystemService(Context.WINDOW_SERVICE);
    if (wm != null) {
      DisplayMetrics metrics = new DisplayMetrics();
      wm.getDefaultDisplay().getRealMetrics(metrics);
      screenWidth = Math.min(metrics.widthPixels, 720);
      screenHeight = Math.max(1, (int) ((float) metrics.heightPixels / metrics.widthPixels * screenWidth));
      screenDensity = metrics.densityDpi;
    }
  }

  private void startCaptureInternal() {
    releaseDisplayOnly();
    if (mediaProjection == null) {
      capturing = false;
      return;
    }
    handlerThread = new HandlerThread("D4ScreenShare");
    handlerThread.start();
    handler = new Handler(handlerThread.getLooper());

    imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2);
    imageReader.setOnImageAvailableListener(
        reader -> {
          if (!capturing) return;
          long now = System.currentTimeMillis();
          if (now - lastEmitMs < MIN_FRAME_INTERVAL_MS) {
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
            lastEmitMs = now;
            String jpegB64 = imageToJpegBase64(image);
            if (jpegB64 != null) {
              JSObject data = new JSObject();
              data.put("jpeg", jpegB64);
              data.put("width", screenWidth);
              data.put("height", screenHeight);
              data.put("ts", now);
              notifyListeners("frame", data);
            }
          } catch (Exception ignored) {
          } finally {
            if (image != null) image.close();
          }
        },
        handler);

    virtualDisplay =
        mediaProjection.createVirtualDisplay(
            "D4EXAM-Screen",
            screenWidth,
            screenHeight,
            screenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null,
            handler);
    capturing = virtualDisplay != null;
    Log.i(TAG, "startCaptureInternal capturing=" + capturing);
  }

  private String imageToJpegBase64(Image image) {
    try {
      Image.Plane[] planes = image.getPlanes();
      ByteBuffer buffer = planes[0].getBuffer();
      int pixelStride = planes[0].getPixelStride();
      int rowStride = planes[0].getRowStride();
      int rowPadding = rowStride - pixelStride * screenWidth;
      Bitmap bitmap =
          Bitmap.createBitmap(
              screenWidth + rowPadding / pixelStride, screenHeight, Bitmap.Config.ARGB_8888);
      bitmap.copyPixelsFromBuffer(buffer);
      Bitmap cropped = Bitmap.createBitmap(bitmap, 0, 0, screenWidth, screenHeight);
      if (cropped != bitmap) bitmap.recycle();
      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      cropped.compress(Bitmap.CompressFormat.JPEG, 52, baos);
      cropped.recycle();
      return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
    } catch (Exception e) {
      return null;
    }
  }

  private void releaseDisplayOnly() {
    capturing = false;
    try {
      if (virtualDisplay != null) {
        virtualDisplay.release();
        virtualDisplay = null;
      }
    } catch (Exception ignored) {
    }
    try {
      if (imageReader != null) {
        imageReader.close();
        imageReader = null;
      }
    } catch (Exception ignored) {
    }
    try {
      if (handlerThread != null) {
        handlerThread.quitSafely();
        handlerThread = null;
        handler = null;
      }
    } catch (Exception ignored) {
    }
  }

  private void releaseProjectionOnly() {
    releaseDisplayOnly();
    try {
      if (mediaProjection != null) {
        mediaProjection.stop();
        mediaProjection = null;
      }
    } catch (Exception ignored) {
    }
  }

  private void stopCaptureInternal(boolean stopService) {
    Log.i(TAG, "stopCaptureInternal stopService=" + stopService);
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
    notifyListeners("stopped", data);
  }

  @Override
  protected void handleOnDestroy() {
    Log.i(TAG, "handleOnDestroy");
    stopCaptureInternal(true);
    super.handleOnDestroy();
  }
}
