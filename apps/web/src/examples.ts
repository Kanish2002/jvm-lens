export const acceptanceExample = `class Address {
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
}`

export const examples = {
  'Objects & aliases': acceptanceExample,
  'Primitives': `public class Main {\n    public static void main(String[] args) {\n        int age = 24;\n        double salary = 50000.50;\n        boolean active = true;\n        char grade = 'A';\n        age = 25;\n        System.out.println(age);\n    }\n}`,
  'Recursion': `public class Main {\n    static int factorial(int n) {\n        if (n <= 1) return 1;\n        return n * factorial(n - 1);\n    }\n    public static void main(String[] args) {\n        int result = factorial(4);\n        System.out.println(result);\n    }\n}`,
  'Arrays': `public class Main {\n    public static void main(String[] args) {\n        int[] values = {10, 20, 30};\n        values[1] = 99;\n        String[] words = {"JVM", "Lens"};\n        System.out.println(values[1]);\n    }\n}`,
  'Exception': `public class Main {\n    public static void main(String[] args) {\n        String message = "Invalid";\n        throw new IllegalArgumentException(message);\n    }\n}`
}
