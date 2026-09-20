export type Evidence = 'OBSERVED' | 'DERIVED' | 'SIMULATED'
export interface Value { kind: string; type: string; value: unknown; objectId?: string; evidence: Evidence }
export interface Variable { name: string; value: Value }
export interface StackFrame { className: string; methodName: string; line: number; locals: Variable[]; thisObjectId?: string }
export interface Field { name: string; declaringType: string; isStatic: boolean; value: Value }
export interface HeapObject { id: string; runtimeType: string; displayValue?: string; fields: Field[]; elements: Value[]; reachable: boolean; reachabilityEvidence: Evidence; simulatedGeneration: string; truncated: boolean }
export interface StaticState { className: string; fields: Field[] }
export interface BytecodeInstruction { offset: number; mnemonic: string; detail: string; sourceLine?: number }
export interface MemoryState { heapUsed: number; heapCommitted: number; heapMax: number; nonHeapUsed: number; metaspaceUsed: number; threadCount: number; loadedClasses: number; evidence: Evidence }
export interface TraceDiff { localsAdded: string[]; localsRemoved: string[]; localsChanged: string[]; objectsCreated: string[]; objectsChanged: string[]; referencesChanged: string[]; objectsBecameUnreachable: string[]; framesAdded: string[]; framesRemoved: string[]; stdoutAdded: string; stderrAdded: string; explanation: string }
export interface TraceStep { sequence: number; event: string; location: { className: string; methodName: string; file: string; line: number; bytecodeOffset: number }; thread: { id: number; name: string; state: string }; stackFrames: StackFrame[]; heap: HeapObject[]; staticFields: StaticState[]; bytecode: BytecodeInstruction[]; memory: MemoryState; gcEvents: unknown[]; stdout: string; stderr: string; diff: TraceDiff }
export interface Diagnostic { file: string; line: number; column: number; kind: string; message: string }
export interface Session { sessionId: string; complete: boolean; error?: string; autoPlay: boolean; trace: TraceStep[] }

