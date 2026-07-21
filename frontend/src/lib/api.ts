const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  details?: Record<string, string[] | undefined>;
  code?: string;

  constructor(
    message: string,
    status: number,
    details?: Record<string, string[] | undefined>,
    code?: string
  ) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, { method = "GET", body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message = data?.error ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, data?.details, data?.code);
  }

  return data as T;
}

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  createdAt: string;
};

export type AuthResponse = {
  user: PublicUser;
  token: string;
};

export type RegisterResponse = {
  email: string;
  message: string;
};

export type LearnerProfile = {
  id: string;
  userId: string;
  goal: string;
  domain: string;
  currentLevel: string;
  timelineWeeks: number;
  hoursPerWeek: number;
  knownSkills: string[];
  weakAreas: string[];
  preferredLearningStyle: string;
  motivationType: string;
  constraints?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewSession = {
  id: string;
  userId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  engineSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Topic = {
  topic_id: string;
  title: string;
  description: string;
  estimated_hours: number;
  status: "locked" | "available" | "in_progress" | "completed";
  prerequisites: string[];
};

// Resource link for a milestone
export type ResourceLink = {
  title: string;
  url: string;
  type: "article" | "video" | "book";
};

export type Milestone = {
  milestone_id: string;
  title: string;
  topics: Topic[];
  checkpoint_quiz_id: string;
  resources?: ResourceLink[];
};

export type QuizQuestion = {
  topic_id: string;
  question: string;
  options: string[]; // always length 4
  correct_index: number; // 0-3
};

export type Roadmap = {
  id: string;
  userId: string;
  goal: string;
  milestones: Milestone[];
  progressPercent: number;
  engineRoadmapId?: string | null;
  generatedFromProfileVersion?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionLog = {
  id: string;
  userId: string;
  duration: number;
  topics: string[];
  difficulty: "easy" | "medium" | "hard";
  notes?: string | null;
  date: string;
};

export type NudgeCheckResponse = {
  nudge_triggered: boolean;
  nudge_message?: string;
  suggested_action?: string;
  trigger_reason?: string;
};

export type WeeklyReviewResponse = {
  id: string;
  userId: string;
  summary: string;
  recommendations: {
    next_week_focus: string;
    motivational_insight: string;
    topics_improved: string[];
    topics_stagnant: string[];
  };
  masteryScoresSnapshot: Record<string, number>;
  createdAt: string;
};

export type MasteryScore = {
  id: string;
  userId: string;
  topicId: string;
  masteryScore: number;
  lastUpdated: string;
};

export type LessonCodeExample = {
  language: string;
  code: string;
};

export type LessonPracticeQuestion = {
  question: string;
  options: string[]; // always length 4
  correct_index: number; // 0-3
  hint: string;
};

export type LessonContent = {
  explanation: string[];
  has_code_example: boolean;
  code_example: LessonCodeExample | null;
  practice_questions: LessonPracticeQuestion[]; // always length 3
};

export const api = {
  register: (input: { name: string; email: string; password: string; phoneNumber?: string }) =>
    request<RegisterResponse>("/auth/register", { method: "POST", body: input }),

  verifyOtp: (input: { email: string; code: string }) =>
    request<AuthResponse>("/auth/verify-otp", { method: "POST", body: input }),

  resendOtp: (input: { email: string }) =>
    request<{ message: string }>("/auth/resend-otp", { method: "POST", body: input }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input }),

  me: (token: string) => request<{ user: PublicUser }>("/auth/me", { token }),

  logout: (token: string) => request<{ message: string }>("/auth/logout", { method: "POST", token }),

  // Profile
  getProfile: (token: string) =>
    request<{ profile: LearnerProfile }>("/profile", { token }),

  upsertProfile: (token: string, input: Partial<Omit<LearnerProfile, "id" | "userId" | "createdAt" | "updatedAt">>) =>
    request<{ profile: LearnerProfile }>("/profile", { method: "PUT", body: input, token }),

  // Interview
  startInterview: (token: string) =>
    request<{ session: InterviewSession; question: string }>("/interview", {
      method: "POST",
      token,
    }),

  listInterviewSessions: (token: string) =>
    request<{ sessions: InterviewSession[] }>("/interview", { token }),

  getInterviewSession: (token: string, sessionId: string) =>
    request<{ session: InterviewSession }>(`/interview/${sessionId}`, { token }),

  respondInterview: (token: string, sessionId: string, message: string) =>
    request<{
      session: InterviewSession;
      question: string | null;
      isComplete: boolean;
      learnerProfile: any;
    }>(`/interview/${sessionId}/respond`, { method: "POST", body: { message }, token }),

  // Roadmap
  generateRoadmap: (token: string) =>
    request<{ roadmap: Roadmap }>("/roadmap", { method: "POST", token }),

  listRoadmaps: (token: string) =>
    request<{ roadmaps: Roadmap[] }>("/roadmap", { token }),

  getRoadmap: (token: string, roadmapId: string) =>
    request<{ roadmap: Roadmap }>(`/roadmap/${roadmapId}`, { token }),

  updateRoadmapProgress: (token: string, roadmapId: string, progressPercent: number) =>
    request<{ roadmap: Roadmap }>(`/roadmap/${roadmapId}/progress`, { method: "PATCH", body: { progressPercent }, token }),

  adaptRoadmap: (
    token: string,
    roadmapId: string,
    input: {
      milestoneId: string;
      quizId: string;
      scorePercent: number;
      topicBreakdown?: Record<string, number>;
    }
  ) =>
    request<{
      roadmap: Roadmap;
      changed: boolean;
      changeSummary: string;
    }>(`/roadmap/${roadmapId}/adapt`, { method: "PATCH", body: input, token }),

  updateTopicStatus: (
    token: string,
    roadmapId: string,
    topicId: string,
    status: "locked" | "available" | "in_progress" | "completed"
  ) =>
    request<{ roadmap: Roadmap }>(`/roadmap/${roadmapId}/topics/${topicId}`, {
      method: "PATCH",
      body: { status },
      token,
    }),

  generateQuiz: (token: string, roadmapId: string, milestoneId: string) =>
    request<{ questions: QuizQuestion[] }>(
      `/roadmap/${roadmapId}/milestones/${milestoneId}/quiz`,
      { method: "POST", token }
    ),

  generateLesson: (token: string, roadmapId: string, topicId: string) =>
    request<{ lesson: LessonContent }>(
      `/roadmap/${roadmapId}/topics/${topicId}/lesson`,
      { method: "POST", token }
    ),


  // Sessions
  createSessionLog: (
    token: string,
    input: {
      duration: number;
      topics: string[];
      difficulty: "easy" | "medium" | "hard";
      notes?: string;
      roadmapId?: string;
    }
  ) =>
    request<{ log: SessionLog }>("/sessions", { method: "POST", body: input, token }),

  listSessionLogs: (token: string) =>
    request<{ logs: SessionLog[] }>("/sessions", { token }),

  // Nudges
  checkNudge: (token: string, userId: string) =>
    request<NudgeCheckResponse>(`/nudges/check/${userId}`, { token }),

  listNudges: (token: string, userId: string) =>
    request<{ logs: any[] }>(`/nudges/${userId}`, { token }),

  // Reviews
  generateWeeklyReview: (token: string, userId: string) =>
    request<{ review: any }>(`/reviews/weekly/${userId}`, { method: "POST", token }),

  listWeeklyReviews: (token: string, userId: string) =>
    request<{ reviews: WeeklyReviewResponse[] }>(`/reviews/weekly/${userId}`, { token }),

  getMasteryScores: (token: string, userId: string) =>
    request<{ scores: MasteryScore[] }>(`/reviews/mastery/${userId}`, { token }),

  // Feedback Event
  logFeedbackEvent: (
    token: string,
    input: {
      eventType: "nudge_shown" | "nudge_followed" | "nudge_ignored" | "roadmap_change_accepted" | "roadmap_change_reverted";
      referenceId: string;
      outcomeNote?: string;
    }
  ) =>
    request<{ logged: boolean }>("/feedback/event", { method: "POST", body: input, token }),

  getFeedbackSummary: (token: string) =>
    request<any>("/feedback/summary", { token }),
};