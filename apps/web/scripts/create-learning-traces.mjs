// Reproducible JSON fixtures. Run with: node scripts/create-learning-traces.mjs
import { writeFileSync } from 'node:fs'
const p = (type, value) => ({ kind: 'primitive', type, value }),
  r = (type, target) => ({ kind: 'reference', type, target }),
  v = (id, name, value) => ({ id, name, value })
const f = (locals) => [{ id: 'main', method: 'main', args: 'String[] args', locals }]
const s = (id, line, explanation, locals, heap, event = 'assign', extra = {}) =>
  structuredClone({
    id,
    line,
    stack: f(locals),
    heap,
    statics: [],
    threads: [],
    event,
    explanation,
    diff: { added: [], changed: [], removed: [] },
    ...extra
  })
const node = (id, type, fields, zone = 'objects', extra = {}) => ({
  id,
  type,
  fields,
  zone,
  ...extra
})
const a = v('p1', 'p1', r('Person', 'A1')),
  b = v('p2', 'p2', r('Person', 'A1'))
const name = (x) => node('A1', 'Person', [v('A1.name', 'name', r('String', x))])
const str = (id, text) => node(id, 'String', [], 'strings', { label: `"${text}"`, root: true })
const ann = str('S1', 'Ana'),
  bob = str('S2', 'Bo'),
  n = v('n', 'n', p('int', 7))
const steps = [
  s('a1', 4, 'main starts. Each method call gets its own stack frame.', [], [], 'start'),
  s('a2', 5, '7 is a primitive value. It lives directly inside n’s stack cell.', [n], []),
  s(
    'a3',
    6,
    'A Person is allocated on the heap. p1 holds its reference.',
    [n, a],
    [name('S1'), ann],
    'allocate'
  ),
  s(
    'a4',
    7,
    'p2 copies the reference. Both variables point to the same Person.',
    [n, a, b],
    [name('S1'), ann]
  ),
  s(
    'a5',
    8,
    'Changing the shared Person through p2 also changes what p1 sees.',
    [n, a, b],
    [name('S2'), ann, bob],
    'write',
    {
      prediction: {
        id: 'alias-name',
        question: 'After p2.name = "Bo", what does p1.name print?',
        options: ['Ana', 'Bo', 'null'],
        correct: 1,
        why: 'p1 and p2 contain the same reference to A1. There is only one Person.'
      }
    }
  ),
  s(
    'a6',
    9,
    'The output is Bo. A second reference did not create a second object.',
    [n, a, b],
    [name('S2'), ann, bob],
    'read',
    { output: 'Bo' }
  ),
  s(
    'a7',
    10,
    'Clearing p1 removes one reference. p2 still keeps the Person reachable.',
    [n, v('p1', 'p1', r('Person', null)), b],
    [name('S2'), ann, bob]
  ),
  s(
    'a8',
    11,
    'The last Person reference is cleared. A1 is now unreachable, but still present.',
    [n, v('p1', 'p1', r('Person', null)), v('p2', 'p2', r('Person', null))],
    [{ ...name('S2'), unreachable: true }, ann, bob],
    'unreachable',
    {
      prediction: {
        id: 'alias-gc',
        question: 'After both references become null, what happens to A1?',
        options: [
          'It disappears immediately',
          'It becomes eligible for GC',
          'The Person becomes null'
        ],
        correct: 1,
        why: 'Null changes the reference cell. Collection can happen later; it is not immediate.'
      }
    }
  ),
  s(
    'a9',
    12,
    'Run GC: the simulated collector removes A1. String literals remain modeled roots.',
    [n, v('p1', 'p1', r('Person', null)), v('p2', 'p2', r('Person', null))],
    [ann, bob],
    'gc'
  ),
  s(
    'a10',
    13,
    'main returns. Its frame and primitive locals leave the stack.',
    [],
    [ann, bob],
    'return',
    { stack: [] }
  )
]
const alias = {
  id: 'aliasing',
  title: 'Two names. One object.',
  subtitle: 'References & aliasing',
  misconception: 'Assigning an object to another variable creates a second object.',
  mode: 'memory',
  evidence: 'curated',
  note: 'Curated teaching trace. GC is simulated; System.gc() is a request, never a guarantee. Pooled literals are kept as modeled roots in this example.',
  code: `public class Main {
  static class Person { String name; Person(String n) { name = n; } }
  public static void main(String[] args) {
    // Start here
    int n = 7;
    Person p1 = new Person("Ana");
    Person p2 = p1;
    p2.name = "Bo";
    System.out.println(p1.name);
    p1 = null;
    p2 = null;
    System.gc(); // request collection
  }
}`,
  steps
}
const boxed = (id, value, root = false) =>
  node(id, 'Integer', [v(id + '.value', 'value', p('int', value))], 'objects', { root })
const ca = v('a', 'a', r('Integer', 'I127')),
  cb = v('b', 'b', r('Integer', 'I127')),
  cc = v('c', 'c', r('Integer', 'I128a')),
  cd = v('d', 'd', r('Integer', 'I128b'))
const h = [boxed('I127', 127, true), boxed('I128a', 128), boxed('I128b', 128)]
const cache = {
  id: 'integer-cache',
  title: 'Equal values. Different identities.',
  subtitle: 'Integer cache · 127 / 128',
  misconception: 'Two Integer references with equal numbers always satisfy ==.',
  mode: 'memory',
  evidence: 'curated',
  note: 'Models the default HotSpot Integer cache. -128 through 127 are cached; a JVM may cache a wider range. Use equals for value comparison.',
  code: `public class Main {
  public static void main(String[] args) {
    Integer a = 127;
    Integer b = 127;
    Integer c = 128;
    Integer d = 128;
    System.out.println(a == b);
    System.out.println(c == d);
    System.out.println(c.equals(d));
  }
}`,
  steps: [
    s('i1', 2, 'main starts with an empty stack frame.', [], [], 'start'),
    s('i2', 3, 'Boxing 127 reuses a cached Integer instance.', [ca], [h[0]], 'allocate'),
    s('i3', 4, 'b points to the same cached Integer as a.', [ca, cb], [h[0]]),
    s(
      'i4',
      5,
      'With the default cache, boxing 128 creates another Integer.',
      [ca, cb, cc],
      h.slice(0, 2),
      'allocate'
    ),
    s(
      'i5',
      6,
      'Another 128 is boxed as a distinct instance in this trace.',
      [ca, cb, cc, cd],
      h,
      'allocate'
    ),
    s(
      'i6',
      7,
      'a == b is true because both references point to I127.',
      [ca, cb, cc, cd],
      h,
      'read',
      { output: 'true' }
    ),
    s(
      'i7',
      8,
      'c == d is false here: equal values, different object identities.',
      [ca, cb, cc, cd],
      h,
      'read',
      {
        output: 'true\nfalse',
        prediction: {
          id: 'integer-id',
          question: 'With the default cache, what does c == d print?',
          options: ['true', 'false', 'A compile error'],
          correct: 1,
          why: '== compares wrapper identity. The two 128 values are stored in different Integer objects here.'
        }
      }
    ),
    s(
      'i8',
      9,
      'c.equals(d) is true because equals compares the stored integer values.',
      [ca, cb, cc, cd],
      h,
      'read',
      { output: 'true\nfalse\ntrue' }
    )
  ]
}
function jmmSteps(volatile, alternative = false) {
  const mem = (data, ready) => [
    v('shared.data', 'data', p('int', data)),
    v('shared.ready', 'ready', p('boolean', ready))
  ]
  const ts = (data, ready, stale = [], writerData = 42, writerReady = true) => [
    {
      id: 'writer',
      name: 'Writer',
      line: 5,
      state: 'running',
      observations: mem(writerData, writerReady).map((x) => ({ ...x, id: 'w.' + x.name }))
    },
    {
      id: 'reader',
      name: 'Reader',
      line: 9,
      state: 'running',
      observations: mem(data, ready).map((x) => ({ ...x, id: 'r.' + x.name })),
      stale
    }
  ]
  const base = (i, line, text, event, shared, threads, extra = {}) =>
    s('v' + i, line, text, [], [], event, { stack: [], shared, threads, ...extra })
  return [
    base(
      1,
      3,
      'Two threads share data and ready. Their initial values are 0 and false.',
      'start',
      mem(0, false),
      ts(0, false, [], 0, false)
    ),
    base(
      2,
      5,
      'Writer stores data = 42. Reader has not observed that write yet.',
      'write',
      mem(42, false),
      ts(0, false, [], 42, false)
    ),
    base(
      3,
      6,
      volatile
        ? 'Writer publishes ready = true with a volatile write.'
        : 'Writer stores ready = true without a publication guarantee.',
      'write',
      mem(42, true),
      ts(0, false)
    ),
    base(
      4,
      8,
      volatile
        ? 'Reader observes the volatile write to ready. This establishes a happens-before edge.'
        : alternative
          ? 'This legal interleaving sees both writes, even without volatile.'
          : 'Reader sees ready = true, but may still read the old data value.',
      'read',
      mem(42, true),
      ts(volatile || alternative ? 42 : 0, true, volatile || alternative ? [] : ['r.data']),
      {
        event: volatile ? 'happens-before' : 'read',
        ...(volatile
          ? {
              happensBefore: {
                from: 'writer',
                to: 'reader',
                reason: 'volatile write → subsequent read'
              }
            }
          : {})
      }
    ),
    base(
      5,
      9,
      volatile
        ? 'Reading ready publishes the earlier data write. Reader must observe data = 42.'
        : alternative
          ? 'Reader prints 42 in this run. Another legal execution may observe a stale value.'
          : 'This allowed execution prints 0. Without happens-before, visibility is not guaranteed.',
      'read',
      mem(42, true),
      ts(volatile || alternative ? 42 : 0, true, volatile || alternative ? [] : ['r.data']),
      {
        output: volatile || alternative ? '42' : '0',
        prediction: {
          id: volatile ? 'volatile-data' : 'plain-data',
          question: volatile
            ? 'After observing ready == true, what must Reader print?'
            : 'Without synchronization, which outcome is allowed?',
          options: volatile
            ? ['Always 0', 'Always 42', 'Either 0 or 42']
            : ['Only 42', '0 or 42; it may skip printing', 'A compile error'],
          correct: 1,
          why: volatile
            ? 'The volatile read observes the write of true. The earlier data write happens-before the later read.'
            : 'There is a data race. Seeing ready does not guarantee seeing data; the conditional may also see false and skip printing.'
        }
      }
    )
  ]
}
const code = (vol) => `public class Main {
  static int data = 0;
  static ${vol ? 'volatile ' : ''}boolean ready = false;
  static void writer() {
    data = 42;
    ready = true;
  }
  static void reader() { // scheduled after writer in this trace
    if (ready) System.out.println(data);
  }
  public static void main(String[] args) throws Exception {
    Thread r = new Thread(Main::reader);
    Thread w = new Thread(Main::writer);
    r.start(); w.start();
    r.join(); w.join();
  }
}`
const volatile = {
  id: 'volatile-visibility',
  title: 'Make the write visible.',
  subtitle: 'Java Memory Model · publication',
  misconception: 'If one thread changes a shared variable, every other thread immediately sees it.',
  mode: 'jmm',
  evidence: 'curated',
  note: 'Illustrative allowed interleavings, not a scheduler or literal CPU cache simulation. Main Memory shows shared writes; lanes show read observations. Other schedules can skip the conditional print.',
  code: code(true),
  steps: jmmSteps(true),
  alternatives: [
    {
      label: 'Reader runs before publication',
      steps: [
        s(
          'early',
          8,
          'Reader runs first and sees ready = false, so it skips the print.',
          [],
          [],
          'read',
          {
            stack: [],
            shared: [
              v('shared.data', 'data', p('int', 0)),
              v('shared.ready', 'ready', p('boolean', false))
            ],
            threads: [
              {
                id: 'reader',
                name: 'Reader',
                line: 8,
                state: 'done',
                observations: [v('r.ready', 'ready', p('boolean', false))]
              }
            ]
          }
        ),
        ...jmmSteps(true)
          .slice(0, 3)
          .map((x, i) => ({
            ...x,
            id: 'early' + i,
            explanation:
              i === 2
                ? 'Writer publishes later. Reader already returned, so there is no output.'
                : x.explanation,
            threads: x.threads.filter((t) => t.id === 'writer')
          }))
      ]
    }
  ],
  compare: {
    title: 'Without volatile · allowed stale read',
    code: code(false),
    steps: jmmSteps(false),
    alternatives: undefined
  }
}
function diffs(steps) {
  const entity = (s) => {
    const m = new Map()
    if (!s) return m
    for (const f of s.stack) {
      m.set(f.id, { method: f.method, args: f.args })
      for (const v of f.locals) m.set(v.id, v)
    }
    for (const o of s.heap) {
      m.set(o.id, o)
      for (const f of o.fields) m.set(f.id, f)
    }
    for (const v of [...s.statics, ...(s.shared ?? [])]) m.set(v.id, v)
    for (const t of s.threads) {
      m.set(t.id, t)
      for (const v of t.observations) m.set(v.id, v)
    }
    return m
  }
  return steps.map((s, i) => {
    const a = entity(steps[i - 1]),
      b = entity(s)
    return {
      ...s,
      diff: {
        added: [...b.keys()].filter((k) => !a.has(k)),
        removed: [...a.keys()].filter((k) => !b.has(k)),
        changed: [...b.keys()].filter(
          (k) => a.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))
        )
      }
    }
  })
}
for (const trace of [alias, cache, volatile]) {
  trace.steps = diffs(trace.steps)
  if (trace.compare) trace.compare.steps = diffs(trace.compare.steps)
  if (trace.alternatives)
    trace.alternatives = trace.alternatives.map((x) => ({ ...x, steps: diffs(x.steps) }))
}
for (const trace of [alias, cache, volatile])
  writeFileSync(
    new URL('../src/learning/traces/' + trace.id + '.json', import.meta.url),
    JSON.stringify(trace, null, 2) + '\n'
  )
