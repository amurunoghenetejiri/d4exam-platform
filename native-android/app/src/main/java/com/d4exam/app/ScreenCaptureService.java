package com.d4exam.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Foreground service required while MediaProjection is active (Android 10+ / API 34+).
 * Must reach startForeground with FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
 * BEFORE getMediaProjection is called.
 */
public class ScreenCaptureService extends Service {
  private static final String TAG = "D4ScreenCaptureSvc";
  private static final String CHANNEL_ID = "d4exam_screen_share";
  private static final int NOTIF_ID = 4402;
  private static final int NOTIF_COLOR = 0xFF0B1B3A;

  public static final AtomicBoolean FOREGROUND_READY = new AtomicBoolean(false);
  public static volatile CountDownLatch READY_LATCH = new CountDownLatch(1);

  public static void resetReady() {
    FOREGROUND_READY.set(false);
    READY_LATCH = new CountDownLatch(1);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      promoteToForeground();
    } catch (Throwable t) {
      Log.e(TAG, "onCreate promote failed", t);
    }
  }

  private void promoteToForeground() {
    createChannel();

    int smallIcon = android.R.drawable.ic_menu_camera;
    try {
      int resId = getResources().getIdentifier("ic_stat_d4exam", "drawable", getPackageName());
      if (resId != 0) smallIcon = resId;
    } catch (Exception ignored) {
    }

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("D4EXAM exam monitoring")
            .setContentText("Screen sharing stays on until you submit the exam.")
            .setSmallIcon(smallIcon)
            .setColor(NOTIF_COLOR)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

    try {
      Bitmap large = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
      if (large != null) builder.setLargeIcon(large);
    } catch (Exception e) {
      Log.w(TAG, "largeIcon load failed", e);
    }

    Notification notification = builder.build();

    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(
            NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
      } else {
        startForeground(NOTIF_ID, notification);
      }
      FOREGROUND_READY.set(true);
      Log.i(TAG, "FOREGROUND_READY typed=" + (Build.VERSION.SDK_INT >= 29));
    } catch (Exception e) {
      Log.e(TAG, "startForeground MEDIA_PROJECTION failed", e);
      try {
        Notification fallback =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("D4EXAM")
                .setContentText("Screen monitoring active")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
          startForeground(
              NOTIF_ID, fallback, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
          startForeground(NOTIF_ID, fallback);
        }
        FOREGROUND_READY.set(true);
      } catch (Exception e2) {
        Log.e(TAG, "startForeground fallback failed", e2);
        FOREGROUND_READY.set(false);
      }
    }
    try {
      READY_LATCH.countDown();
    } catch (Exception ignored) {
    }
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel =
          new NotificationChannel(
              CHANNEL_ID, "Exam screen monitoring", NotificationManager.IMPORTANCE_DEFAULT);
      channel.setDescription("Shown while screen share is active during an examination");
      channel.setShowBadge(false);
      channel.setSound(null, null);
      NotificationManager nm = getSystemService(NotificationManager.class);
      if (nm != null) nm.createNotificationChannel(channel);
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (!FOREGROUND_READY.get()) {
      promoteToForeground();
    }
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public void onDestroy() {
    FOREGROUND_READY.set(false);
    Log.i(TAG, "onDestroy");
    super.onDestroy();
  }
}
