import type { Trace, Thread } from './schema'
import { local, primitive, snapshot, withDiffs } from './model'
const data = (id: string, n: number) => local(id, 'data', primitive('int', n))
const thread = (
  id: string,
  name: string,
  n: number,
  line: number,
  state: Thread['state'] = 'running'
): Thread => ({ id, name, line, state, observations: [data(id + '.data', n)] })
const step = (
  id: string,
  line: number,
  text: string,
  value: number,
  threads: Thread[],
  event: Trace['steps'][number]['event'] = 'assign',
  extra: Partial<Trace['steps'][number]> = {}
) =>
  snapshot(id, line, text, [], [], event, {
    shared: [data('shared.data', value)],
    threads,
    ...extra
  })
export const synchronizedTrace: Trace = {
  id: 'synchronized-publication',
  title: 'One monitor. A visible handoff.',
  subtitle: 'JMM · synchronized',
  mode: 'jmm',
  evidence: 'curated',
  misconception:
    'synchronized only prevents two threads from entering; it does not publish earlier writes.',
  note: 'Illustrative schedule: Writer releases the same monitor before Reader acquires it. A different order can print 0. Lane values are read observations.',
  code: `public class Main {
  static int data = 0;
  static final Object lock = new Object();
  static void writer() {
    synchronized (lock) { data = 42; }
  }
  static void reader() {
    synchronized (lock) { System.out.println(data); }
  }
  public static void main(String[] args) throws Exception {
    Thread w = new Thread(Main::writer), r = new Thread(Main::reader);
    w.start(); r.start(); w.join(); r.join();
  }
}`,
  steps: withDiffs([
    step(
      'sync1',
      2,
      'Both threads use the same monitor. Shared data starts at 0.',
      0,
      [thread('writer', 'Writer', 0, 4), thread('reader', 'Reader', 0, 7)],
      'start'
    ),
    step(
      'sync2',
      5,
      'Writer acquires the monitor, then writes data = 42.',
      42,
      [thread('writer', 'Writer', 42, 5), thread('reader', 'Reader', 0, 8, 'waiting')],
      'write'
    ),
    step('sync3', 5, 'Writer releases the monitor. Reader can now acquire it.', 42, [
      thread('writer', 'Writer', 42, 5, 'done'),
      thread('reader', 'Reader', 0, 8, 'waiting')
    ]),
    step(
      'sync4',
      8,
      'Reader acquires the same monitor after Writer’s release. Earlier writes become visible.',
      42,
      [thread('writer', 'Writer', 42, 5, 'done'), thread('reader', 'Reader', 42, 8)],
      'happens-before',
      {
        happensBefore: {
          from: 'writer',
          to: 'reader',
          reason: 'monitor unlock → subsequent lock of the same monitor'
        }
      }
    ),
    step(
      'sync5',
      8,
      'Reader prints 42 in this schedule because the monitor handoff publishes the write.',
      42,
      [thread('writer', 'Writer', 42, 5, 'done'), thread('reader', 'Reader', 42, 8, 'done')],
      'read',
      {
        output: '42',
        prediction: {
          id: 'monitor-result',
          question:
            'Reader acquires the same monitor after Writer releases it. What does it print?',
          options: ['0', '42', 'Either 0 or 42'],
          correct: 1,
          why: 'Unlock happens-before a subsequent lock on the same monitor. Writer’s earlier write is visible.'
        }
      }
    )
  ])
}
export const joinTrace: Trace = {
  id: 'join-publication',
  title: 'Wait for completion. See the writes.',
  subtitle: 'JMM · Thread.join()',
  mode: 'jmm',
  evidence: 'curated',
  misconception:
    'join only waits; the completed thread’s writes might still be invisible afterward.',
  note: 'join returns normally after Writer terminates. All Writer actions happen-before the actions following that return. No volatile field is needed for this pattern.',
  code: `public class Main {
  static int data = 0;
  public static void main(String[] args) throws Exception {
    Thread writer = new Thread(() -> { data = 42; });
    writer.start();
    writer.join();
    System.out.println(data);
  }
}`,
  steps: withDiffs([
    step(
      'join1',
      4,
      'Main prepares a worker. Shared data starts at 0.',
      0,
      [thread('writer', 'Writer', 0, 4, 'waiting'), thread('main', 'Main', 0, 4)],
      'start'
    ),
    step('join2', 5, 'Main starts Writer. They can now run concurrently.', 0, [
      thread('writer', 'Writer', 0, 4),
      thread('main', 'Main', 0, 5)
    ]),
    step(
      'join3',
      6,
      'Main waits in join while Writer stores data = 42.',
      42,
      [thread('writer', 'Writer', 42, 4), thread('main', 'Main', 0, 6, 'waiting')],
      'write'
    ),
    step(
      'join4',
      6,
      'Writer terminates. Main’s join returns, publishing Writer’s earlier actions.',
      42,
      [thread('writer', 'Writer', 42, 4, 'done'), thread('main', 'Main', 42, 6)],
      'happens-before',
      {
        happensBefore: {
          from: 'writer',
          to: 'main',
          reason: 'thread termination → successful join return'
        }
      }
    ),
    step(
      'join5',
      7,
      'After join returns, Main must see 42 from Writer.',
      42,
      [thread('writer', 'Writer', 42, 4, 'done'), thread('main', 'Main', 42, 7)],
      'read',
      {
        output: '42',
        prediction: {
          id: 'join-result',
          question: 'What does Main print after writer.join() returns normally?',
          options: ['0', '42', 'Any integer'],
          correct: 1,
          why: 'Every action in Writer happens-before Main continues after a successful join.'
        }
      }
    )
  ])
}
