/**
 * mentorEngineClient.ts
 * -----------------------------------------------------------------------
 * HTTP client for calling `mentor_ai_engine` (the standalone FastAPI AI
 * service — all 8 phases) from the Node/Express backend.
 *
 * This is the only AI service this backend talks to — no voice/audio,
 * mentor-brain is not called from anywhere in this codebase.
 *
 * Schemas mirror app/models.py in mentor_ai_engine exactly (frozen per
 * API_CONTRACT.md) — don't rename fields without updating both sides.
 *
 * Zero external dependencies: uses Node's built-in `fetch` (Node 18+,
 * which Docker images built on recent node: tags already have). If your
 * project standardizes on axios instead, the shapes/types below still
 * apply — only `request()` at the bottom would need to change.
 * -----------------------------------------------------------------------
 */

import { env } from "../config/env";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ENGINE_BASE_URL = env.ENGINE_BASE_URL;

// Per-endpoint timeouts. Phase 2 (roadmap generation, two real LLM passes)
// and Phase 4 (adaptive rewrite) are meaningfully slower than the rest —
// don't use one blanket timeout for all 8 phases.
const TIMEOUTS_MS = {
  interviewStart: 15_000,
  interviewMessage: 20_000,
  interviewStatus: 5_000,
  roadmapGenerate: 45_000, // two-pass LLM generation — the slowest call in the service
  roadmapGet: 5_000,
  sessionLog: 5_000, // no LLM at all — should always be fast
  roadmapAdapt: 30_000, // targeted LLM rewrite
  intentClassify: 10_000,
  nudgeCheck: 15_000,
  weeklyReview: 20_000,
  feedbackEvent: 5_000, // no LLM at all
  feedbackSummary: 5_000, // no LLM at all
  quizGenerate: 25_000, // single batched LLM call covering all topics in a milestone
  lessonGenerate: 25_000, // single LLM call producing explanation + optional code + 3 questions
  chatRespond: 20_000, // single LLM call, grounded in profile/roadmap/mastery + recent history
} as const;

// ---------------------------------------------------------------------------
// Types — mirror app/models.py exactly
// ---------------------------------------------------------------------------

export interface LearnerProfile {
  goal: string;
  domain: string;
  current_level: "beginner" | "intermediate" | "advanced";
  timeline_weeks: number;
  hours_per_week: number;
  known_skills: string[];
  weak_areas: string[];
  preferred_learning_style?: string | null;
  motivation_type?: string | null;
  constraints: string[];
}

export interface StartInterviewResponse {
  session_id: string;
  mentor_message: string;
  status: "in_progress";
}

export interface InterviewMessageResponse {
  session_id: string;
  status: "in_progress" | "complete";
  mentor_message?: string | null; // present when status === "in_progress"
  learner_profile?: LearnerProfile | null; // present when status === "complete"
}

export interface RoadmapTopic {
  topic_id: string;
  title: string;
  description: string;
  estimated_hours: number;
  status: "locked" | "available" | "in_progress" | "completed";
  prerequisites: string[];
}

export interface RoadmapMilestone {
  milestone_id: string;
  title: string;
  topics: RoadmapTopic[];
  checkpoint_quiz_id?: string | null;
}

export interface Roadmap {
  roadmap_id: string;
  user_id: string;
  goal: string;
  milestones: RoadmapMilestone[];
  progress_percent: number;
  generated_from_profile_version: string;
}

export interface TopicMastery {
  topic_id: string;
  mastery_score: number; // 0.0 - 1.0
  last_updated: string; // ISO datetime string
}

export interface SessionLogResponse {
  logged: boolean;
  updated_mastery: TopicMastery[];
}

export interface AdaptRoadmapResponse {
  roadmap_id: string;
  changed: boolean;
  change_summary: string;
  updated_roadmap: Roadmap;
}

export type Intent =
  | "asking_question"
  | "reporting_progress"
  | "expressing_frustration"
  | "requesting_change"
  | "off_topic"
  | "quiz_response";

export interface ClassifyIntentResponse {
  intent: Intent;
  confidence: number; // 0.0 - 1.0
}

export interface NudgeCheckResponse {
  nudge_triggered: boolean;
  nudge_message?: string | null;
  suggested_action?: string | null;
  trigger_reason?: string | null;
}

export interface WeeklyReviewResponse {
  user_id: string;
  week_start: string; // YYYY-MM-DD
  week_end: string; // YYYY-MM-DD
  sessions_completed: number;
  total_hours: number;
  topics_improved: string[];
  topics_stagnant: string[];
  goal_progress_percent: number;
  next_week_focus: string;
  motivational_insight: string;
}

export type FeedbackEventType =
  | "nudge_shown"
  | "nudge_followed"
  | "nudge_ignored"
  | "roadmap_change_accepted"
  | "roadmap_change_reverted";

export interface FeedbackEventResponse {
  logged: boolean;
}

// GET /feedback/summary — NOT part of the frozen API_CONTRACT (internal ops
// endpoint, same carve-out as /metrics), but stable and useful — shape
// mirrors app/feedback/eval.py's summarize().
export interface FeedbackSummary {
  total_events: number;
  event_counts: Record<string, number>;
  nudge_follow_through_rate: number | null;
  roadmap_change_acceptance_rate: number | null;
  distinct_users: number;
}

export interface HealthResponse {
  status: string;
  phases: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Error types — so callers can distinguish timeout vs. HTTP error vs. network
// ---------------------------------------------------------------------------

export class EngineTimeoutError extends Error {
  constructor(public readonly path: string, public readonly timeoutMs: number) {
    super(`mentor_ai_engine request to ${path} timed out after ${timeoutMs}ms`);
    this.name = "EngineTimeoutError";
  }
}

export class EngineHttpError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`mentor_ai_engine request to ${path} failed with HTTP ${status}`);
    this.name = "EngineHttpError";
  }
}

export class EngineNetworkError extends Error {
  constructor(public readonly path: string, public readonly cause: unknown) {
    super(`mentor_ai_engine request to ${path} failed: network error`);
    this.name = "EngineNetworkError";
  }
}

// ---------------------------------------------------------------------------
// Internal request helper
// ---------------------------------------------------------------------------

async function request<TResponse>(
  method: "GET" | "POST",
  path: string,
  timeoutMs: number,
  body?: unknown,
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${ENGINE_BASE_URL}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      let parsedBody: unknown;
      try {
        parsedBody = await res.json();
      } catch {
        parsedBody = await res.text().catch(() => null);
      }
      throw new EngineHttpError(path, res.status, parsedBody);
    }

    return (await res.json()) as TResponse;
  } catch (err) {
    if (err instanceof EngineHttpError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new EngineTimeoutError(path, timeoutMs);
    }
    throw new EngineNetworkError(path, err);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — Goal Understanding (interview)
// ---------------------------------------------------------------------------

export function startInterview(): Promise<StartInterviewResponse> {
  return request("POST", "/interview/start", TIMEOUTS_MS.interviewStart);
}

export function sendInterviewMessage(
  sessionId: string,
  message: string,
): Promise<InterviewMessageResponse> {
  return request("POST", "/interview/message", TIMEOUTS_MS.interviewMessage, {
    session_id: sessionId,
    message,
  });
}

export function getInterviewStatus(sessionId: string): Promise<InterviewMessageResponse> {
  return request(
    "GET",
    `/interview/${encodeURIComponent(sessionId)}`,
    TIMEOUTS_MS.interviewStatus,
  );
}

// ---------------------------------------------------------------------------
// Phase 2 — Roadmap Generator
// ---------------------------------------------------------------------------

/**
 * NOT IDEMPOTENT — every call mints a fresh roadmap_id and (in real mode)
 * triggers a real, billed two-pass LLM generation. Do NOT blindly retry
 * this on a timeout from your HTTP client/proxy layer; if you need
 * retry-safety, dedupe on your side (e.g. check whether a roadmap for this
 * user_id + learner_profile was already created in your own DB before
 * calling again).
 */
export function generateRoadmap(
  userId: string,
  learnerProfile: LearnerProfile,
): Promise<Roadmap> {
  return request("POST", "/roadmap/generate", TIMEOUTS_MS.roadmapGenerate, {
    user_id: userId,
    learner_profile: learnerProfile,
  });
}

/**
 * Debug/convenience lookup against the engine's own in-memory roadmap
 * store — NOT your source of truth. Persist the Roadmap returned by
 * generateRoadmap()/adaptRoadmap() into your own database and read it back
 * from there; this in-memory copy is wiped on every engine restart and
 * won't exist at all if the engine is ever scaled to multiple replicas.
 */
export function getRoadmapDebug(roadmapId: string): Promise<Roadmap> {
  return request(
    "GET",
    `/roadmap/${encodeURIComponent(roadmapId)}`,
    TIMEOUTS_MS.roadmapGet,
  );
}

// ---------------------------------------------------------------------------
// Checkpoint Quiz Generation
// ---------------------------------------------------------------------------
// One real, topic-specific multiple-choice question per topic in a
// milestone — replaces the frontend's old client-side fake (one hardcoded
// generic question reused for every topic, always the same correct answer).

export interface QuizQuestion {
  topic_id: string;
  question: string;
  options: string[]; // always length 4
  correct_index: number; // 0-3
}

export function generateQuiz(
  milestoneId: string,
  currentLevel: string,
  topics: RoadmapTopic[],
): Promise<{ questions: QuizQuestion[] }> {
  return request("POST", "/quiz/generate", TIMEOUTS_MS.quizGenerate, {
    milestone_id: milestoneId,
    current_level: currentLevel,
    topics,
  });
}

// ---------------------------------------------------------------------------
// Per-Topic Lesson Content
// ---------------------------------------------------------------------------
// Real, domain-aware lesson content — replaces the frontend's old hardcoded
// fake explanation text, fake JS "sandbox" code block (shown for every
// topic regardless of subject), and 3 hardcoded quiz questions.

export interface LessonCodeExample {
  language: string;
  code: string;
}

export interface LessonPracticeQuestion {
  question: string;
  options: string[]; // always length 4
  correct_index: number; // 0-3
  hint: string;
}

export interface LessonContent {
  explanation: string[];
  has_code_example: boolean;
  code_example: LessonCodeExample | null;
  practice_questions: LessonPracticeQuestion[]; // always length 3
}

export function generateLesson(
  topic: RoadmapTopic,
  domain: string,
  currentLevel: string,
): Promise<{ lesson: LessonContent }> {
  return request("POST", "/lesson/generate", TIMEOUTS_MS.lessonGenerate, {
    topic,
    domain,
    current_level: currentLevel,
  });
}

// ---------------------------------------------------------------------------
// Phase 3 — Session Tracker (no LLM — always fast, always "real")
// ---------------------------------------------------------------------------

export interface LogSessionParams {
  userId: string;
  roadmapId: string;
  topicIdsCovered: string[];
  durationMinutes: number;
  selfRatedDifficulty?: "easy" | "medium" | "hard";
  notes?: string;
}

export function logSession(params: LogSessionParams): Promise<SessionLogResponse> {
  return request("POST", "/sessions/log", TIMEOUTS_MS.sessionLog, {
    user_id: params.userId,
    roadmap_id: params.roadmapId,
    topic_ids_covered: params.topicIdsCovered,
    duration_minutes: params.durationMinutes,
    self_rated_difficulty: params.selfRatedDifficulty ?? null,
    notes: params.notes ?? null,
  });
}

// ---------------------------------------------------------------------------
// Phase 4 — Adaptive Roadmap Engine
// ---------------------------------------------------------------------------

export interface AdaptRoadmapParams {
  userId: string;
  roadmapId: string;
  milestoneId: string;
  quizId: string;
  scorePercent: number; // 0-100
  topicBreakdown?: Record<string, number>; // topic_id -> score_percent
}

/**
 * roadmapId must be one this same engine process generated (see the
 * single-instance caveat in TEAM_OVERVIEW.md) — an unknown roadmap_id
 * degrades silently to mock output rather than erroring, so don't treat a
 * 200 response alone as proof the real roadmap was actually adapted; check
 * `changed` and `change_summary` too.
 */
export function adaptRoadmap(params: AdaptRoadmapParams): Promise<AdaptRoadmapResponse> {
  return request("POST", "/roadmap/adapt", TIMEOUTS_MS.roadmapAdapt, {
    user_id: params.userId,
    roadmap_id: params.roadmapId,
    milestone_id: params.milestoneId,
    quiz_id: params.quizId,
    score_percent: params.scorePercent,
    topic_breakdown: params.topicBreakdown ?? {},
  });
}

// ---------------------------------------------------------------------------
// Phase 5 — Intent Parser
// ---------------------------------------------------------------------------

export function classifyIntent(
  userId: string,
  message: string,
): Promise<ClassifyIntentResponse> {
  return request("POST", "/intent/classify", TIMEOUTS_MS.intentClassify, {
    user_id: userId,
    message,
  });
}

// ---------------------------------------------------------------------------
// Phase 6 — Motivation Detector / Nudges
// ---------------------------------------------------------------------------

export function checkNudge(userId: string): Promise<NudgeCheckResponse> {
  return request(
    "GET",
    `/nudges/check/${encodeURIComponent(userId)}`,
    TIMEOUTS_MS.nudgeCheck,
  );
}

// ---------------------------------------------------------------------------
// Phase 7 — Weekly Review Generator
// ---------------------------------------------------------------------------

export function generateWeeklyReview(userId: string): Promise<WeeklyReviewResponse> {
  return request(
    "POST",
    `/reviews/weekly/${encodeURIComponent(userId)}`,
    TIMEOUTS_MS.weeklyReview,
  );
}

// ---------------------------------------------------------------------------
// Phase 8 — Feedback Loop / Eval Harness (no LLM — always fast, always "real")
// ---------------------------------------------------------------------------

export interface LogFeedbackEventParams {
  userId: string;
  eventType: FeedbackEventType;
  referenceId: string; // e.g. a nudge_id or roadmap_id this feedback relates to
  outcomeNote?: string;
}

export function logFeedbackEvent(
  params: LogFeedbackEventParams,
): Promise<FeedbackEventResponse> {
  return request("POST", "/feedback/event", TIMEOUTS_MS.feedbackEvent, {
    user_id: params.userId,
    event_type: params.eventType,
    reference_id: params.referenceId,
    outcome_note: params.outcomeNote ?? null,
  });
}

/** NOT part of the frozen API_CONTRACT — internal ops/eval endpoint. */
export function getFeedbackSummary(userId?: string): Promise<FeedbackSummary> {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return request("GET", `/feedback/summary${qs}`, TIMEOUTS_MS.feedbackSummary);
}

// ---------------------------------------------------------------------------
// Ongoing Mentor Chat
// ---------------------------------------------------------------------------

export interface ChatMessageTurn {
  role: "user" | "mentor";
  content: string;
}

export interface ChatWithMentorParams {
  userId: string;
  message: string;
  learnerProfile: LearnerProfile;
  roadmap?: Roadmap | null;
  masteryScores?: TopicMastery[];
  conversationHistory?: ChatMessageTurn[];
}

export interface ChatResponse {
  reply: string;
  changed: boolean;
  change_summary: string | null;
  updated_roadmap: Roadmap | null;
}

export function chatWithMentor(params: ChatWithMentorParams): Promise<ChatResponse> {
  return request("POST", "/chat/respond", TIMEOUTS_MS.chatRespond, {
    user_id: params.userId,
    message: params.message,
    learner_profile: params.learnerProfile,
    roadmap: params.roadmap ?? null,
    mastery_scores: params.masteryScores ?? [],
    conversation_history: params.conversationHistory ?? [],
  });
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

export function checkEngineHealth(): Promise<HealthResponse> {
  return request("GET", "/health", 5_000);
}
