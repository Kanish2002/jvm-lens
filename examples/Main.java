class Address {
    String city;
    int pinCode;
}

class Person {
    static int count = 0;
    String name;
    int age;
    boolean active;
    Address address;

    Person(String name) {
        this.name = name;
        count++;
    }
}

public class Main {
    public static void main(String[] args) {
        int version = 1;
        String x = "hello";
        String y = "hello";
        String z = new String("hello");
        Person p1 = new Person("Kanish");
        Person p2 = p1;
        p1.age = 24;
        p1.active = true;
        Address address = new Address();
        address.city = "Chennai";
        address.pinCode = 600001;
        p1.address = address;
        int[] numbers = {10, 20, 30};
        version = 2;
        p1 = null;
        System.out.println(p2.name);
    }
}

