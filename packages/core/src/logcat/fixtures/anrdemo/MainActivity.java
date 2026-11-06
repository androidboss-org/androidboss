package dev.androidboss.anrdemo;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.TextView;

public class MainActivity extends Activity {
    static final Object cartLock = new Object();
    static final Object syncLock = new Object();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        TextView t = new TextView(this);
        t.setText("ANR demo");
        setContentView(t);
        String mode = getIntent().getStringExtra("mode");
        Log.i("AnrDemo", "mode=" + mode);
        if ("crash".equals(mode)) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> new CartRepository().total("12,50"), 300);
        } else if ("deadlock".equals(mode)) {
            new Thread(new SyncManager(), "SyncWorker").start();
            new Handler(Looper.getMainLooper()).postDelayed(() -> new CartRepository().refresh(), 200);
        }
    }
}
