package dev.androidboss.anrdemo;

class SyncManager implements Runnable {
    @Override public void run() {
        synchronized (MainActivity.syncLock) {
            CartRepository.sleep(500);
            synchronized (MainActivity.cartLock) {
                android.util.Log.i("AnrDemo", "synced");
            }
        }
    }
}
