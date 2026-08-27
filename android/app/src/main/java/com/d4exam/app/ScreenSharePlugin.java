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

/** Native screen capture for D4EXAM exam monitoring (MediaProjection). */
@CapacitorPlugin(name = "D4ScreenShare")
public class ScreenSharePlugin extends Plugin {

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
  private static final long MIN_FRAME_INTERVAL_MS = 800;

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
      call.reject("No activity");
      return;
    }
    try {
      WindowManager wm = (WindowManager) activity.getSystemService(Context.WINDOW_SERVICE);
      DisplayMetrics metrics = new DisplayMetrics();
      wm.getDefaultDisplay().getRealMetrics(metrics);
      screenWidth = Math.min(720, metrics.widthPixels);
      screenHeight = (int) (screenWidth * ((float) metrics.heightPixels / Math.max(1, metrics.widthPixels)));
      screenDensity = metrics.densityDpi;
    } catch (Exception ignored) {
    }

    projectionManager =
        (MediaProjectionManager) activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
    if (projectionManager == null) {
      call.reject("MediaProjection not available");
      return;
    }
    Intent intent = projectionManager.createScreenCaptureIntent();
    startActivityForResult(call, intent, "onScreenPermission");
  }

  @ActivityCallback
  private void onScreenPermission(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("Screen share permission denied");
      return;
    }
    try {
      Intent svc = new Intent(getContext(), ScreenCaptureService.class);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        getContext().startForegroundService(svc);
      } else {
        getContext().startService(svc);
      }

      mediaProjection = projectionManager.getMediaProjection(result.getResultCode(), result.getData());
      if (mediaProjection == null) {
        call.reject("Could not create MediaProjection");
        return;
      }

      mediaProjection.registerCallback(new MediaProjection.Callback() {
        @Override
        public void onStop() {
          stopCaptureInternal();
          notifyStopped();
        }
      }, new Handler(Looper.getMainLooper()));

      startCaptureInternal();
      JSObject ret = new JSObject();
      ret.put("active", true);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Failed to start screen share: " + e.getMessage());
    }
  }

  @PluginMethod
  public void stop(PluginCall call) {
    stopCaptureInternal();
    JSObject ret = new JSObject();
    ret.put("active", false);
    call.resolve(ret);
  }

  @PluginMethod
  public void isActive(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("active", capturing);
    call.resolve(ret);
  }

  private void startCaptureInternal() {
    stopCaptureInternal(false);
    handlerThread = new HandlerThread("D4ScreenShare");
    handlerThread.start();
    handler = new Handler(handlerThread.getLooper());

    imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2);
    imageReader.setOnImageAvailableListener(reader -> {
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
    }, handler);

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
    capturing = true;
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
      cropped.compress(Bitmap.CompressFormat.JPEG, 55, baos);
      cropped.recycle();
      return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
    } catch (Exception e) {
      return null;
    }
  }

  private void stopCaptureInternal() {
    stopCaptureInternal(true);
  }

  private void stopCaptureInternal(boolean stopService) {
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
      if (mediaProjection != null) {
        mediaProjection.stop();
        mediaProjection = null;
      }
    } catch (Exception ignored) {
    }
    try {
      if (handlerThread != null) {
        handlerThread.quitSafely();
        handlerThread = null;
      }
    } catch (Exception ignored) {
    }
    if (stopService) {
      try {
        getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
      } catch (Exception ignored) {
      }
    }
  }

  private void notifyStopped() {
    JSObject data = new JSObject();
    data.put("active", false);
    notifyListeners("stopped", data);
  }

  @Override
  protected void handleOnDestroy() {
    stopCaptureInternal();
    super.handleOnDestroy();
  }
}
