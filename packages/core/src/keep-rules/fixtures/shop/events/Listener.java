package shop.events;

public class Listener {
    @Subscribe public void onOrderShipped() { System.out.println("onOrderShipped"); }
}
