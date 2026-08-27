package com.d4exam.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Foreground service required while MediaProjection is active (Android 10+ / API 34+).
 * Must reach startForeground BEFORE getMediaProjection is called.
 */
public class ScreenCaptureService extends Service {
  private static final String TAG = "D4ScreenCaptureSvc";
  private static final String CHANNEL_ID = "d4exam_screen_share";
  private static final int NOTIF_ID = 4402;

  /** Set when startForeground has completed — plugin waits on this. */
  public static final AtomicBoolean FOREGROUND_READY = new AtomicBoolean(false);
  public static volatile CountDownLatch READY_LATCH = new CountDownLatch(1);

  public static void resetReady() {
    FOREGROUND_READY.set(false);
    READY_LATCH = new CountDownLatch(1);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    promoteToForeground();
  }

  private void promoteToForeground() {
    createChannel();
    Notification notification =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("D4EXAM")
            .setContentText("Screen monitoring is active during your exam.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setSilent(true)
            .build();
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(
            NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
      } else {
        startForeground(NOTIF_ID, notification);
      }
    } catch (Exception e) {
      Log.w(TAG, "startForeground typed failed, fallback", e);
      try {
        startForeground(NOTIF_ID, notification);
      } catch (Exception ignored) {
      }
    }
    FOREGROUND_READY.set(true);
    try {
      READY_LATCH.countDown();
    } catch (Exception ignored) {
    }
    Log.i(TAG, "FOREGROUND_READY");
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel =
          new NotificationChannel(
              CHANNEL_ID, "Exam screen monitoring", NotificationManager.IMPORTANCE_LOW);
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
