from pathlib import Path
wf = Path(".github/workflows/build-android.yml")
wt = wf.read_text()
if "stopWithTask" in wt:
    print("build-android already")
else:
    inject = '''
          # Keep capture service alive; retain activity across MediaProjection dialog
          if grep -q 'ScreenCaptureService' "$MAN"; then
            sed -i 's|android:name=".ScreenCaptureService"[^/]*|android:name=".ScreenCaptureService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="mediaProjection"|' "$MAN" || true
          fi
          if grep -q 'android:name=".MainActivity"' "$MAN"; then
            if ! grep -q 'alwaysRetainTaskState' "$MAN"; then
              sed -i 's|android:name=".MainActivity"|android:name=".MainActivity" android:alwaysRetainTaskState="true"|' "$MAN" || true
            fi
          fi
'''
    marker = '          echo "Manifest permissions:"'
    if marker in wt:
        wt = wt.replace(marker, inject + "\n" + marker, 1)
        wf.write_text(wt)
        print("build-android patched")
    else:
        print("marker MISSING")
