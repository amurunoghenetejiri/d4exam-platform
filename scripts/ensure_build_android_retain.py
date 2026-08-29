from pathlib import Path
wf = Path(".github/workflows/build-android.yml")
wt = wf.read_text()
if "stopWithTask" in wt:
    print("ok already")
    raise SystemExit(0)
inject = '''
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
if marker not in wt:
    raise SystemExit('marker missing')
wf.write_text(wt.replace(marker, inject + "\n" + marker, 1))
print("patched")
