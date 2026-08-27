package com.d4exam.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/** Required foreground service while MediaProjection is active (Android 10+). */
public class ScreenCaptureService extends Service {
  private static final String CHANNEL_ID = "d4exam_screen_share";
  private static final int NOTIF_ID = 4402;

  @Override
  public void onCreate() {
    super.onCreate();
    createChannel();
    Notification notification =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("D4EXAM")
            .setContentText("Screen monitoring is active during your exam.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
    } else {
      startForeground(NOTIF_ID, notification);
    }
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel =
          new NotificationChannel(CHANNEL_ID, "Exam screen monitoring", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Shown while screen share is active during an examination");
      NotificationManager nm = getSystemService(NotificationManager.class);
      if (nm != null) nm.createNotificationChannel(channel);
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
