from pathlib import Path
p = Path("native-android/app/src/main/java/com/d4exam/app/ScreenSharePlugin.java")
t = p.read_text()
if "sPendingResultData" not in t:
    t = t.replace(
        "private static final AtomicBoolean sKeepAlive = new AtomicBoolean(false);",
        """private static final AtomicBoolean sKeepAlive = new AtomicBoolean(false);
  private static volatile Intent sPendingResultData = null;
  private static volatile int sPendingResultCode = 0;""",
        1,
    )
    print("fields")
if "Thread.sleep(250)" not in t and "sPendingResultData = result.getData()" not in t:
    needle = """    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("Screen share permission denied");
      return;
    }
    try {
      ScreenCaptureService.resetReady();"""
    repl = """    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("Screen share permission denied");
      return;
    }
    sPendingResultCode = result.getResultCode();
    sPendingResultData = result.getData();
    try {
      try { Thread.sleep(250); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
      ScreenCaptureService.resetReady();"""
    if needle in t:
        t = t.replace(needle, repl, 1)
        print("delay+pending")
    else:
        print("needle missing for delay")
if "startForegroundService failed" not in t:
    t = t.replace(
        """      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        getContext().startForegroundService(svc);
      } else {
        getContext().startService(svc);
      }
      try {
        ScreenCaptureService.READY_LATCH.await(8, TimeUnit.SECONDS);""",
        """      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          getContext().startForegroundService(svc);
        } else {
          getContext().startService(svc);
        }
      } catch (Exception startEx) {
        Log.e(TAG, "startForegroundService failed", startEx);
        call.reject("Could not start screen monitoring service: " + startEx.getMessage());
        return;
      }
      try {
        ScreenCaptureService.READY_LATCH.await(8, TimeUnit.SECONDS);""",
        1,
    )
    print("startFGS catch")
if "handleOnPause" not in t:
    t = t.replace(
        "  @Override\n  protected void handleOnDestroy() {",
        """  @Override
  protected void handleOnPause() {
    super.handleOnPause();
  }

  @Override
  protected void handleOnDestroy() {""",
        1,
    )
    print("onPause")
p.write_text(t)
print("plugin ok", p.stat().st_size)

svc = Path("native-android/app/src/main/java/com/d4exam/app/ScreenCaptureService.java")
st = svc.read_text()
if "onCreate promote failed" not in st:
    st = st.replace(
        """  @Override
  public void onCreate() {
    super.onCreate();
    promoteToForeground();
  }""",
        """  @Override
  public void onCreate() {
    super.onCreate();
    try {
      promoteToForeground();
    } catch (Throwable t) {
      Log.e(TAG, "onCreate promote failed", t);
    }
  }""",
        1,
    )
    svc.write_text(st)
    print("svc ok")
else:
    print("svc already")
