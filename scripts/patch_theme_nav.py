from pathlib import Path
p = Path("src/routes/__root.tsx")
t = p.read_text().replace('content: "#f8fafc"', 'content: "#0b1b3a"')
p.write_text(t)
print("theme-color navy")
main = Path("native-android/app/src/main/java/com/d4exam/app/MainActivity.java")
if main.exists():
    mt = main.read_text()
    if "setNavigationBarColor" not in mt:
        mt = mt.replace(
            "package com.d4exam.app;\n\nimport android.os.Bundle;",
            "package com.d4exam.app;\n\nimport android.graphics.Color;\nimport android.os.Build;\nimport android.os.Bundle;\nimport android.view.Window;",
        )
        mt = mt.replace(
            "super.onCreate(savedInstanceState);",
            """super.onCreate(savedInstanceState);
    try {
      Window w = getWindow();
      if (w != null) {
        w.setStatusBarColor(Color.parseColor("#0b1b3a"));
        w.setNavigationBarColor(Color.parseColor("#0b1b3a"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          w.setNavigationBarContrastEnforced(false);
        }
      }
    } catch (Exception ignored) { }""",
            1,
        )
        main.write_text(mt)
        print("MainActivity nav")
    else:
        print("MainActivity already")
