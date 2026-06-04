// Explicit re-exports so the `ParsedEvent` type can stay distinct in each
// module without colliding at the package barrel level.
export {
  createAccumulator,
  consume,
  summarise,
  parseStreamJsonl,
  type TranscriptAccumulator,
} from './transcript.js';
export { executeQuery, type ExecutorOptions } from './executor.js';
export {
  buildUserMessage,
  buildClaudePGraderPrompt,
  extractJsonObject,
  GRADER_SYSTEM_PROMPT,
  GRADER_TOOL,
  type GraderInputs,
} from './grader-prompt.js';
export { gradeExecution, type GradeOptions, type GraderMode } from './grader.js';
export { aggregateRuns, calculateStats, computeDelta } from './aggregate.js';
export { runOutputSet, type OutputRunSetOptions, type OutputProgressEvent } from './run-set.js';
