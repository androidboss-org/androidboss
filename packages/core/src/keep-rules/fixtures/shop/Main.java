package shop;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;

/** Each scenario prints what it found by reflection, or what failed. */
public class Main {
    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "json-models": {
                // Like Gson: list the field names and fill a new instance from "JSON".
                Object item = shop.model.Item.class.getDeclaredConstructor().newInstance();
                String[] names = Arrays.stream(item.getClass().getDeclaredFields()).map(Field::getName).sorted().toArray(String[]::new);
                System.out.println(String.join(",", names));
                break;
            }
            case "class-for-name":
                // The name comes from outside (config, server), so R8 cannot see it.
                System.out.println(Class.forName("shop.plugins." + args[1]).getDeclaredConstructor().newInstance());
                break;
            case "annotated-members": {
                Object listener = new shop.events.Listener();
                for (Method m : listener.getClass().getDeclaredMethods())
                    if (m.isAnnotationPresent(shop.events.Subscribe.class)) m.invoke(listener);
                break;
            }
            default:
                System.out.println("unknown");
        }
    }
}
