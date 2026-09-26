export type Evidence = 'OBSERVED' | 'DERIVED' | 'SIMULATED'
export type SessionStatus = 'COMPILING' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'STOPPED'

export interface Value { kind: string; type: string; value: unknown; objectId?: string; evidence: Evidence }
export interface Variable { name: string; value: Value }
export interface StackFrame { className: string; methodName: string; line: number; locals: Variable[]; thisObjectId?: string }
export interface ThreadState { id: number; name: string; state: string }
export interface ThreadSnapshot { thread: ThreadState; stackFrames: StackFrame[]; eventThread: boolean }
export interface Field { name: string; declaringType: string; isStatic: boolean; value: Value }
export interface HeapObject { id: string; runtimeType: string; displayValue?: string; fields: Field[]; elements: Value[]; reachable: boolean; reachabilityEvidence: Evidence; simulatedGeneration: string; truncated: boolean }
export interface StaticState { className: string; fields: Field[] }
export interface BytecodeInstruction { methodName?: string; offset: number; mnemonic: string; detail: string; sourceLine?: number }
export interface MemoryState { heapUsed: number; heapCommitted: number; heapMax: number; nonHeapUsed: number; metaspaceUsed: number; threadCount: number; loadedClasses: number; evidence: Evidence }
export interface JmmEvent { type: string; threadId: number; threadName: string; variable: string; detail: string; evidence: Evidence }
export interface TraceDiff { localsAdded: string[]; localsRemoved: string[]; localsChanged: string[]; objectsCreated: string[]; objectsChanged: string[]; referencesChanged: string[]; objectsBecameUnreachable: string[]; framesAdded: string[]; framesRemoved: string[]; stdoutAdded: string; stderrAdded: string; explanation: string }
export interface TraceStep { sequence: number; event: string; location: { className: string; methodName: string; file: string; line: number; bytecodeOffset: number }; thread: ThreadState; stackFrames: StackFrame[]; threads?: ThreadSnapshot[]; heap: HeapObject[]; staticFields: StaticState[]; bytecode: BytecodeInstruction[]; memory: MemoryState; gcEvents: unknown[]; jmmEvents?: JmmEvent[]; stdout: string; stderr: string; diff: TraceDiff }
export interface Diagnostic { file: string; line: number; column: number; kind: string; message: string }
export interface Session { sessionId: string; status: SessionStatus; complete: boolean; error?: string; autoPlay: boolean; historyStartSequence: number; latestSequence: number; reset: boolean; trace: TraceStep[] }
export interface StartResponse { sessionId: string; compiled: boolean; status: SessionStatus; diagnostics: Diagnostic[]; error?: string }

export interface ReferenceEdge {
  id: string
  sourceLabel: string
  targetId: string
  kind: 'stack' | 'field' | 'static'
}
