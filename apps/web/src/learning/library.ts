import { synchronizedTrace, joinTrace } from './synchronization'
import aliasing from './traces/aliasing.json'
import integerCache from './traces/integer-cache.json'
import volatileVisibility from './traces/volatile-visibility.json'
import type { HeapNode, Local, Trace } from './schema'
import { frame, local, primitive as p, reference as r, snapshot as s, withDiffs } from './model'
const obj = (
  id: string,
  type: string,
  fields: Local[],
  zone: HeapNode['zone'] = 'objects',
  extra: Partial<HeapNode> = {}
): HeapNode => ({ id, type, fields, zone, ...extra })
const ref = (name: string, target: string | null, type = 'Box') =>
  local(name, name, r(type, target))
const value = (id: string, name: string, n: string | number | boolean, type = 'int') =>
  local(id, name, p(type, n))
function example(
  id: string,
  title: string,
  subtitle: string,
  misconception: string,
  code: string,
  steps: Trace['steps'],
  note?: string
): Trace {
  return {
    id,
    title,
    subtitle,
    misconception,
    code,
    steps: withDiffs(steps),
    mode: 'memory',
    evidence: 'curated',
    note:
      note ??
      'Curated teaching trace. Objects are logical identities, not physical memory addresses.'
  }
}
const swapA = ref('a', 'A1'),
  swapB = ref('b', 'B1'),
  a = obj('A1', 'Box', [value('A1.n', 'n', 1)]),
  b = obj('B1', 'Box', [value('B1.n', 'n', 2)])
const swap = example(
  'pass-by-value',
  'A swap that doesn’t swap.',
  'Java passes values',
  'A method can swap the caller’s references by reassigning its parameters.',
  `public class Main {
  static class Box { int n; Box(int n) { this.n = n; } }
  static void swap(Box x, Box y) {
    Box temp = x;
    x = y;
    y = temp;
  }
  public static void main(String[] args) {
    Box a = new Box(1), b = new Box(2);
    swap(a, b);
    System.out.println(a.n);
  }
}`,
  [
    s(
      's1',
      9,
      'Two variables point to two different boxes.',
      [frame([swapA, swapB])],
      [a, b],
      'allocate'
    ),
    s(
      's2',
      3,
      'swap receives copies of the reference values in its own frame.',
      [
        frame([swapA, swapB]),
        frame([ref('x', 'A1'), ref('y', 'B1')], 'swap', 'swap', 'Box x, Box y')
      ],
      [a, b],
      'call'
    ),
    s(
      's3',
      4,
      'temp stores another copy of the reference to A1.',
      [
        frame([swapA, swapB]),
        frame([ref('x', 'A1'), ref('y', 'B1'), ref('temp', 'A1')], 'swap', 'swap', 'Box x, Box y')
      ],
      [a, b]
    ),
    s(
      's4',
      5,
      'Reassigning x changes only the local parameter cell.',
      [
        frame([swapA, swapB]),
        frame([ref('x', 'B1'), ref('y', 'B1'), ref('temp', 'A1')], 'swap', 'swap', 'Box x, Box y')
      ],
      [a, b]
    ),
    s(
      's5',
      6,
      'The local parameter references are swapped; the caller’s cells are unchanged.',
      [
        frame([swapA, swapB]),
        frame([ref('x', 'B1'), ref('y', 'A1'), ref('temp', 'A1')], 'swap', 'swap', 'Box x, Box y')
      ],
      [a, b]
    ),
    s(
      's6',
      11,
      'swap returns. a still points to A1, so a.n prints 1.',
      [frame([swapA, swapB])],
      [a, b],
      'return',
      {
        output: '1',
        prediction: {
          id: 'swap-output',
          question: 'What does a.n print after swap(a, b)?',
          options: ['1', '2', 'null'],
          correct: 0,
          why: 'Java passes reference values by value. Reassigning parameters does not reassign a or b.'
        }
      }
    )
  ]
)
const sa = ref('a', 'S1', 'String'),
  sb = ref('b', 'S1', 'String'),
  sc = ref('c', 'S2', 'String'),
  pooled = obj('S1', 'String', [], 'strings', { label: '"hi"', root: true }),
  fresh = obj('S2', 'String', [], 'objects', { label: '"hi"' })
const strings = example(
  'string-pool',
  'Same text. New object.',
  'String pool vs new String',
  'new String("hi") returns the same pooled object as the literal "hi".',
  `public class Main {
  public static void main(String[] args) {
    String a = "hi";
    String b = "hi";
    String c = new String("hi");
    System.out.println(a == b);
    System.out.println(a == c);
  }
}`,
  [
    s(
      'st1',
      3,
      'A string literal refers to the pooled String S1.',
      [frame([sa])],
      [pooled],
      'allocate'
    ),
    s('st2', 4, 'The repeated literal reuses the same pooled String.', [frame([sa, sb])], [pooled]),
    s(
      'st3',
      5,
      'new String creates S2, a distinct object containing equal text.',
      [frame([sa, sb, sc])],
      [pooled, fresh],
      'allocate'
    ),
    s(
      'st4',
      6,
      'a == b prints true: both references have the same identity.',
      [frame([sa, sb, sc])],
      [pooled, fresh],
      'read',
      { output: 'true' }
    ),
    s(
      'st5',
      7,
      'a == c prints false: new created a different String object.',
      [frame([sa, sb, sc])],
      [pooled, fresh],
      'read',
      { output: 'true\nfalse' }
    )
  ]
)
const listA = ref('first', 'L1', 'ArrayList'),
  listB = ref('second', 'L1', 'ArrayList'),
  list = (n: number) => obj('L1', 'ArrayList', [value('L1.0', '[0]', n)])
const shared = example(
  'shared-list',
  'One list. Two editors.',
  'Shared mutable list',
  'Assigning a list gives the second variable an independent list.',
  `public class Main {
  public static void main(String[] args) {
    var first = new java.util.ArrayList<Integer>();
    first.add(10);
    var second = first;
    second.set(0, 99);
    System.out.println(first.get(0));
  }
}`,
  [
    s(
      'l1',
      3,
      'An empty list is allocated on the heap.',
      [frame([listA])],
      [obj('L1', 'ArrayList', [])],
      'allocate'
    ),
    s('l2', 4, 'The list now contains the logical element 10.', [frame([listA])], [list(10)]),
    s('l3', 5, 'second copies the reference to L1.', [frame([listA, listB])], [list(10)]),
    s(
      'l4',
      6,
      'The shared list changes through second. first sees that same list.',
      [frame([listA, listB])],
      [list(99)],
      'write'
    ),
    s('l5', 7, 'first.get(0) prints 99.', [frame([listA, listB])], [list(99)], 'read', {
      output: '99'
    })
  ],
  'Logical list elements are shown; ArrayList backing storage and Integer boxing are omitted.'
)
const copyRoots = [ref('original', 'C1', 'Box[]'), ref('shallow', 'C2', 'Box[]')],
  child = (n: number) => obj('B1', 'Box', [value('B1.n', 'n', n)]),
  arr = (id: string, target: string) =>
    obj(id, 'Box[]', [local(id + '.0', '[0]', r('Box', target))], 'arrays')
const copying = example(
  'shallow-deep',
  'Copied container. Shared contents.',
  'Shallow vs deep copy',
  'Cloning an array also clones every object stored inside it.',
  `public class Main {
  static class Box { int n = 1; }
  public static void main(String[] args) {
    Box[] original = { new Box() };
    Box[] shallow = original.clone();
    shallow[0].n = 9;
    Box[] deep = { new Box() };
    deep[0].n = original[0].n;
    deep[0].n = 5;
  }
}`,
  [
    s(
      'c1',
      4,
      'original references an array whose element references B1.',
      [frame(copyRoots.slice(0, 1))],
      [arr('C1', 'B1'), child(1)],
      'allocate'
    ),
    s(
      'c2',
      5,
      'clone creates C2 but copies its element reference. B1 is still shared.',
      [frame(copyRoots)],
      [arr('C1', 'B1'), arr('C2', 'B1'), child(1)],
      'allocate'
    ),
    s(
      'c3',
      6,
      'Changing shallow[0].n changes the same Box visible through original.',
      [frame(copyRoots)],
      [arr('C1', 'B1'), arr('C2', 'B1'), child(9)],
      'write'
    ),
    s(
      'c4',
      7,
      'An explicit deep copy starts with a new container and a new Box B2.',
      [frame([...copyRoots, ref('deep', 'C3', 'Box[]')])],
      [
        arr('C1', 'B1'),
        arr('C2', 'B1'),
        child(9),
        arr('C3', 'B2'),
        obj('B2', 'Box', [value('B2.n', 'n', 1)])
      ],
      'allocate'
    ),
    s(
      'c5',
      8,
      'The original value is copied into B2’s independent primitive field.',
      [frame([...copyRoots, ref('deep', 'C3', 'Box[]')])],
      [
        arr('C1', 'B1'),
        arr('C2', 'B1'),
        child(9),
        arr('C3', 'B2'),
        obj('B2', 'Box', [value('B2.n', 'n', 9)])
      ]
    ),
    s(
      'c6',
      9,
      'Changing the deep copy leaves the original Box at 9.',
      [frame([...copyRoots, ref('deep', 'C3', 'Box[]')])],
      [
        arr('C1', 'B1'),
        arr('C2', 'B1'),
        child(9),
        arr('C3', 'B2'),
        obj('B2', 'Box', [value('B2.n', 'n', 5)])
      ],
      'write'
    )
  ]
)
const equals = example(
  'equals',
  'Identity is not equality.',
  '== vs equals',
  '== compares String contents.',
  strings.code
    .replace('System.out.println(a == b);', 'System.out.println(a == c);')
    .replace('System.out.println(a == c);\n  }', 'System.out.println(a.equals(c));\n  }'),
  [
    ...strings.steps.slice(0, 3),
    s(
      'e1',
      6,
      'a == c is false: S1 and S2 have different identities.',
      [frame([sa, sb, sc])],
      [pooled, fresh],
      'read',
      { output: 'false' }
    ),
    s(
      'e2',
      7,
      'a.equals(c) is true: the String contents match.',
      [frame([sa, sb, sc])],
      [pooled, fresh],
      'read',
      { output: 'false\ntrue' }
    )
  ]
)
const staticCode = `public class Main {
  static int count = 0;
  public static void main(String[] args) {
    Main a = new Main();
    Main b = new Main();
    a.count++;
    System.out.println(b.count);
  }
}`
const staticShared = example(
  'static-state',
  'One class. One shared field.',
  'Static shared state',
  'Every object gets its own copy of a static field.',
  staticCode,
  [
    s(
      'ss1',
      4,
      'a references an instance. count belongs to the class.',
      [frame([ref('a', 'M1', 'Main')])],
      [obj('M1', 'Main', [])],
      'allocate',
      { statics: [value('Main.count', 'Main.count', 0)] }
    ),
    s(
      'ss2',
      5,
      'A second instance is created; there is still only one static count.',
      [frame([ref('a', 'M1', 'Main'), ref('b', 'M2', 'Main')])],
      [obj('M1', 'Main', []), obj('M2', 'Main', [])],
      'allocate',
      { statics: [value('Main.count', 'Main.count', 0)] }
    ),
    s(
      'ss3',
      6,
      'Incrementing through a changes the single class field.',
      [frame([ref('a', 'M1', 'Main'), ref('b', 'M2', 'Main')])],
      [obj('M1', 'Main', []), obj('M2', 'Main', [])],
      'write',
      { statics: [value('Main.count', 'Main.count', 1)] }
    ),
    s(
      'ss4',
      7,
      'Access through b reads the same class field and prints 1.',
      [frame([ref('a', 'M1', 'Main'), ref('b', 'M2', 'Main')])],
      [obj('M1', 'Main', []), obj('M2', 'Main', [])],
      'read',
      { statics: [value('Main.count', 'Main.count', 1)], output: '1' }
    )
  ]
)
const recurse = example(
  'stack-overflow',
  'Calls need room, too.',
  'Stack overflow',
  'Recursive calls reuse one stack frame.',
  `public class Main {
  static void recur(int depth) {
    recur(depth + 1);
  }
  public static void main(String[] args) {
    recur(0);
  }
}`,
  Array.from({ length: 6 }, (_, i) =>
    s(
      'r' + i,
      i === 0 ? 6 : 3,
      i === 5
        ? 'The illustrative stack budget is exhausted. Real depth depends on JVM settings.'
        : 'Another recursive call pushes a separate frame with its own depth.',
      [
        frame([]),
        ...Array.from({ length: Math.min(i + 1, 5) }, (_, j) =>
          frame([value('depth' + j, 'depth', j)], 'recur', 'recur' + j, `depth = ${j}`)
        )
      ],
      [],
      i === 5 ? 'error' : 'call',
      i === 5
        ? {
            error: 'StackOverflowError · teaching limit reached. Add a base case to stop recursion.'
          }
        : {}
    )
  ),
  'The five-frame limit is illustrative. Real stack capacity depends on -Xss, platform, and frame sizes.'
)
const kept = obj('Leak', 'Object', []),
  holder = (keep: boolean) =>
    obj('Store', 'ArrayList', keep ? [local('Store.0', '[0]', r('Object', 'Leak'))] : [])
const leak = example(
  'static-leak',
  'Still reachable. Still retained.',
  'Memory leak via static list',
  'An object is collected as soon as its local variable becomes null.',
  `public class Main {
  static final java.util.List<Object> saved = new java.util.ArrayList<>();
  public static void main(String[] args) {
    Object item = new Object();
    saved.add(item);
    item = null;
    System.gc();
    saved.clear();
    System.gc();
  }
}`,
  [
    s(
      'm1',
      4,
      'A local item points to a new Object.',
      [frame([ref('item', 'Leak', 'Object')])],
      [holder(false), kept],
      'allocate',
      { statics: [ref('Main.saved', 'Store', 'List')] }
    ),
    s(
      'm2',
      5,
      'The static list keeps an additional reference to the Object.',
      [frame([ref('item', 'Leak', 'Object')])],
      [holder(true), kept],
      'assign',
      { statics: [ref('Main.saved', 'Store', 'List')] }
    ),
    s(
      'm3',
      6,
      'item becomes null, but the path from the static list keeps Leak reachable.',
      [frame([ref('item', null, 'Object')])],
      [holder(true), kept],
      'assign',
      { statics: [ref('Main.saved', 'Store', 'List')] }
    ),
    s(
      'm4',
      7,
      'Run GC: Leak stays alive because the static list still references it.',
      [frame([ref('item', null, 'Object')])],
      [holder(true), kept],
      'gc',
      { statics: [ref('Main.saved', 'Store', 'List')] }
    ),
    s(
      'm5',
      8,
      'Clearing the list removes the last path. Leak becomes eligible for collection.',
      [frame([ref('item', null, 'Object')])],
      [holder(false), { ...kept, unreachable: true }],
      'unreachable',
      { statics: [ref('Main.saved', 'Store', 'List')] }
    ),
    s(
      'm6',
      9,
      'Run GC: the simulated collector can now reclaim Leak.',
      [frame([ref('item', null, 'Object')])],
      [holder(false)],
      'gc',
      { statics: [ref('Main.saved', 'Store', 'List')] }
    )
  ],
  'GC steps are an explicit simulation. A real System.gc() call does not guarantee collection. List internals are omitted.'
)
const nums = (n: number) =>
  obj('N1', 'int[]', [value('N1.0', '[0]', n), value('N1.1', '[1]', 2)], 'arrays')
const arrays = example(
  'array-aliasing',
  'The array is shared.',
  'Array aliasing',
  'Assigning an array copies its elements into independent storage.',
  `public class Main {
  public static void main(String[] args) {
    int[] a = {1, 2};
    int[] b = a;
    b[0] = 9;
    System.out.println(a[0]);
  }
}`,
  [
    s(
      'ar1',
      3,
      'An array is an object. Its primitive elements live inside that heap object.',
      [frame([ref('a', 'N1', 'int[]')])],
      [nums(1)],
      'allocate'
    ),
    s(
      'ar2',
      4,
      'b copies the array reference, not the array elements.',
      [frame([ref('a', 'N1', 'int[]'), ref('b', 'N1', 'int[]')])],
      [nums(1)]
    ),
    s(
      'ar3',
      5,
      'b[0] changes the shared array element.',
      [frame([ref('a', 'N1', 'int[]'), ref('b', 'N1', 'int[]')])],
      [nums(9)],
      'write'
    ),
    s(
      'ar4',
      6,
      'a[0] prints 9 because a and b point to N1.',
      [frame([ref('a', 'N1', 'int[]'), ref('b', 'N1', 'int[]')])],
      [nums(9)],
      'read',
      { output: '9' }
    )
  ]
)
function normalize(trace: Trace): Trace {
  return {
    ...trace,
    steps: withDiffs(trace.steps),
    compare: trace.compare
      ? { ...trace.compare, steps: withDiffs(trace.compare.steps) }
      : undefined,
    alternatives: trace.alternatives?.map((x) => ({ ...x, steps: withDiffs(x.steps) }))
  }
}
export const traces: Trace[] = [
  aliasing as Trace,
  swap,
  strings,
  integerCache as Trace,
  shared,
  copying,
  equals,
  staticShared,
  recurse,
  leak,
  arrays,
  volatileVisibility as Trace,
  synchronizedTrace,
  joinTrace
].map(normalize)
export const misconceptionTraces = traces.filter((t) => t.id !== 'aliasing' && t.mode !== 'jmm')
export const getTrace = (id: string) => traces.find((t) => t.id === id) ?? traces[0]
