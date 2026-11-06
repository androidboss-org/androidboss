package dev.androidboss.anrdemo;

class CartRepository {
    double total(String price) {
        try {
            return PriceParser.parse(price);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("Cart total failed", e);
        }
    }

    void refresh() {
        synchronized (MainActivity.cartLock) {
            sleep(500);
            synchronized (MainActivity.syncLock) {
                android.util.Log.i("AnrDemo", "refreshed");
            }
        }
    }

    static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) {}
    }
}
