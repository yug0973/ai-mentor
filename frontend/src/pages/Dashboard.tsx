import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  api,
  LearnerProfile,
  InterviewSession,
  Roadmap,
  Milestone,
  MasteryScore,
  WeeklyReviewResponse,
  Topic,
} from "../lib/api";
import SessionLogModal from "../components/SessionLogModal";
import CheckpointQuiz from "../components/CheckpointQuiz";
import TopicStudyModal from "../components/TopicStudyModal";
import { RoadmapCard } from "../components/RoadmapCard";
import { ChatPanel } from "../components/ChatPanel";


export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const activeToken = token || "";

  // Dashboard Tab state
  const [activeTab, setActiveTab] = useState<"roadmap" | "nudges-reviews" | "profile-settings">("roadmap");

  // Core data states
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [interviewSession, setInterviewSession] = useState<InterviewSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Chat/Interview state
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [isChatSending, setIsChatSending] = useState(false);

  // Ongoing mentor chat panel (separate from the interview-only chat above —
  // available any time, not gated to interviewSession)
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);

  // Transition & Action states
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [selectedMilestoneForQuiz, setSelectedMilestoneForQuiz] = useState<Milestone | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [selectedTopicForStudy, setSelectedTopicForStudy] = useState<Topic | null>(null);
  const [preselectedTopicIdForLog, setPreselectedTopicIdForLog] = useState<string | null>(null);


  // Extra data states (Nudges / Reviews / Mastery)
  const [nudges, setNudges] = useState<any[]>([]);
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);
  const [nudgeAction, setNudgeAction] = useState<string | null>(null);
  const [isCheckingNudge, setIsCheckingNudge] = useState(false);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReviewResponse[]>([]);
  const [masteryScores, setMasteryScores] = useState<MasteryScore[]>([]);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);

  // Profile Edit fields
  const [editGoal, setEditGoal] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editLevel, setEditLevel] = useState("beginner");
  const [editHours, setEditHours] = useState(10);
  const [editTimeline, setEditTimeline] = useState(12);
  const [editStyle, setEditStyle] = useState("practical");
  const [editMotivation, setEditMotivation] = useState("career");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Toast / Status notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);


  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadDashboardData = async () => {
    if (!activeToken) return;
    try {
      setIsLoading(true);
      // Try to load user profile
      const profRes = await api.getProfile(activeToken);
      setProfile(profRes.profile);

      // Prepopulate edit inputs
      setEditGoal(profRes.profile.goal);
      setEditDomain(profRes.profile.domain);
      setEditLevel(profRes.profile.currentLevel);
      setEditHours(profRes.profile.hoursPerWeek);
      setEditTimeline(profRes.profile.timelineWeeks);
      setEditStyle(profRes.profile.preferredLearningStyle);
      setEditMotivation(profRes.profile.motivationType);

      // Load roadmaps
      const roadmapList = await api.listRoadmaps(activeToken);
      if (roadmapList.roadmaps.length > 0) {
        // Fetch detailed roadmap
        const detailedRoadmap = await api.getRoadmap(activeToken, roadmapList.roadmaps[0].id);
        setRoadmap(detailedRoadmap.roadmap);
      } else {
        setRoadmap(null);
      }
    } catch (err: any) {
      if (err.status === 404) {
        // No profile exists. Fetch in-progress interviews
        setProfile(null);
        setRoadmap(null);
        try {
          const interviewsList = await api.listInterviewSessions(activeToken);
          const activeSession = interviewsList.sessions.find((s) => s.status === "IN_PROGRESS");
          if (activeSession) {
            setInterviewSession(activeSession);
            setChatHistory(
              Array.isArray(activeSession.conversationHistory)
                ? (activeSession.conversationHistory as any)
                : []
            );
          } else {
            setInterviewSession(null);
          }
        } catch (innerErr) {
          console.error("Failed to load interview history", innerErr);
        }
      } else {
        showToast("Error loading profile: " + (err.message || "Unknown error"), "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [activeToken]);

  // Load reviews and mastery whenever the tab switches to nudges-reviews
  useEffect(() => {
    if (activeTab === "nudges-reviews" && user?.id) {
      loadReviewsAndMastery();
    }
  }, [activeTab, user?.id]);

  const loadReviewsAndMastery = async () => {
    if (!activeToken || !user?.id) return;
    try {
      // Mastery scores
      const masteryRes = await api.getMasteryScores(activeToken, user.id);
      setMasteryScores(masteryRes.scores || []);

      // Weekly reviews
      const reviewsRes = await api.listWeeklyReviews(activeToken, user.id);
      setWeeklyReviews(reviewsRes.reviews || []);

      // History nudges
      const nudgesRes = await api.listNudges(activeToken, user.id);
      setNudges(nudgesRes.logs || []);
    } catch (err) {
      console.error("Failed to load reviews or mastery scores", err);
    }
  };

  // Onboarding actions
  const startNewInterview = async () => {
    try {
      setIsLoading(true);
      const startRes = await api.startInterview(activeToken);
      setInterviewSession(startRes.session);
      setChatHistory([
        { role: "assistant", content: startRes.question },
      ]);
    } catch (err: any) {
      showToast("Failed to start onboarding: " + err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !interviewSession) return;

    const messageToSend = chatMessage.trim();
    setChatMessage("");
    setChatHistory((prev) => [...prev, { role: "user", content: messageToSend }]);
    setIsChatSending(true);

    try {
      const response = await api.respondInterview(activeToken, interviewSession.id, messageToSend);

      if (response.isComplete) {
        showToast("Onboarding interview complete! Your profile has been constructed.", "success");
        setProfile(response.learnerProfile);
        setInterviewSession(response.session);
        // Refresh full state
        await loadDashboardData();
      } else if (response.question) {
        setChatHistory((prev) => [...prev, { role: "assistant", content: response.question! }]);
      }
    } catch (err: any) {
      showToast("Error sending message: " + err.message, "error");
    } finally {
      setIsChatSending(false);
    }
  };

  const handleGenerateRoadmap = async () => {
    try {
      setIsGeneratingRoadmap(true);
      const res = await api.generateRoadmap(activeToken);
      setRoadmap(res.roadmap);
      showToast("Route plotted successfully! Welcome to your Roadmap.", "success");
      await loadDashboardData();
    } catch (err: any) {
      showToast("Failed to generate roadmap: " + err.message, "error");
    } finally {
      setIsGeneratingRoadmap(false);
    }
  };

  // Nudge Action Checks
  const handleCheckNudge = async () => {
    if (!user?.id) return;
    try {
      setIsCheckingNudge(true);
      setNudgeMessage(null);
      setNudgeAction(null);

      const checkRes = await api.checkNudge(activeToken, user.id);

      if (checkRes.nudge_triggered) {
        setNudgeMessage(checkRes.nudge_message || null);
        setNudgeAction(checkRes.suggested_action || null);
        showToast("Coach nudge triggered!", "info");

        // Log shown event to eval harness
        if (roadmap?.engineRoadmapId) {
          await api.logFeedbackEvent(activeToken, {
            eventType: "nudge_shown",
            referenceId: roadmap.engineRoadmapId,
            outcomeNote: checkRes.trigger_reason,
          });
        }
        await loadReviewsAndMastery();
      } else {
        showToast("You are on track! No coaching nudge triggered right now.", "info");
      }
    } catch (err: any) {
      showToast("Failed checking nudges: " + err.message, "error");
    } finally {
      setIsCheckingNudge(false);
    }
  };

  const handleFollowNudge = async () => {
    if (!roadmap?.engineRoadmapId) return;
    try {
      await api.logFeedbackEvent(activeToken, {
        eventType: "nudge_followed",
        referenceId: roadmap.engineRoadmapId,
        outcomeNote: nudgeAction || undefined,
      });
      showToast("Nudge marked as followed! Feedback sent to evaluation harness.", "success");
      setNudgeMessage(null);
      setNudgeAction(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleIgnoreNudge = async () => {
    if (!roadmap?.engineRoadmapId) return;
    try {
      await api.logFeedbackEvent(activeToken, {
        eventType: "nudge_ignored",
        referenceId: roadmap.engineRoadmapId,
      });
      showToast("Nudge dismissed.", "info");
      setNudgeMessage(null);
      setNudgeAction(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateWeeklyReview = async () => {
    if (!user?.id) return;
    try {
      setIsGeneratingReview(true);
      await api.generateWeeklyReview(activeToken, user.id);
      showToast("Weekly progress summary generated!", "success");
      await loadReviewsAndMastery();
    } catch (err: any) {
      showToast("Failed compiling weekly review: " + err.message, "error");
    } finally {
      setIsGeneratingReview(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      const res = await api.upsertProfile(activeToken, {
        goal: editGoal,
        domain: editDomain,
        currentLevel: editLevel,
        hoursPerWeek: editHours,
        timelineWeeks: editTimeline,
        preferredLearningStyle: editStyle,
        motivationType: editMotivation,
      });
      setProfile(res.profile);
      showToast("Profile settings saved successfully.", "success");
    } catch (err: any) {
      showToast("Failed saving profile: " + err.message, "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRegenerateRoadmap = async () => {
    if (!window.confirm("Are you sure you want to regenerate your roadmap? This will create a fresh plan based on your current settings and reset current progress.")) return;
    await handleGenerateRoadmap();
  };

  const handleAdaptationComplete = (summary: string, changed: boolean) => {
    if (changed) {
      showToast("Adaptive Engine rewritten your roadmap: " + summary, "info");
    } else {
      showToast("Checkpoint cleared! Keep climbing.", "success");
    }
    // Refresh roadmap
    loadDashboardData();
  };

  // Render Helpers
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blaze border-t-transparent"></div>
          <p className="font-mono-label text-xs uppercase tracking-widest text-fog animate-pulse">
            Consulting the Trail Guide…
          </p>
        </div>
      </div>
    );
  }

  // Toast component
  const toastColors = {
    success: "border-moss bg-moss/10 text-moss",
    info: "border-blaze bg-blaze/10 text-blaze",
    error: "border-red-500 bg-red-500/10 text-red-400",
  };

  return (
    <div className="min-h-screen bg-bg text-parchment flex flex-col">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded border p-4 shadow-lg transition-all animate-bounce">
          <div className={`rounded px-4 py-3 border text-xs font-mono-label flex items-start gap-2 ${toastColors[toast.type]}`}>
            <span className="font-bold">▲</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="border-b border-mist bg-panel px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl font-bold tracking-tight text-parchment">
            AI Mentor
          </span>
          <span className="font-mono-label text-[10px] uppercase tracking-wider bg-blaze/20 text-blaze border border-blaze/30 rounded-full px-2.5 py-0.5">
            Basecamp
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-fog font-mono-label hidden sm:inline">
            Hiker: <strong className="text-parchment font-semibold">{user?.name}</strong>
          </span>
          <button
            onClick={() => setIsChatPanelOpen(true)}
            className="rounded-full border border-blaze/50 bg-blaze/10 px-4 py-1.5 text-xs text-blaze font-semibold transition hover:bg-blaze/20"
          >
            Ask Mentor
          </button>
          <button
            onClick={logout}
            className="rounded-full border border-mist px-4 py-1.5 text-xs text-fog transition hover:border-blaze hover:text-parchment hover:bg-blaze/5"
          >
            Log Out
          </button>
        </div>
      </nav>

      {/* Subnav (only visible if onboarding is complete and roadmap generated) */}
      {profile && roadmap && (
        <div className="border-b border-mist/40 bg-panel/30 px-6 py-2 flex items-center gap-2 overflow-x-auto">
          {(["roadmap", "nudges-reviews", "profile-settings"] as const).map((tab) => {
            const labels = {
              roadmap: "🗺️ The Trail Map",
              "nudges-reviews": "💬 Coaching & Reviews",
              "profile-settings": "⚙️ Profile Settings",
            };
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-mono-label tracking-wide transition border shrink-0 ${
                  isActive
                    ? "bg-blaze text-bg border-blaze font-semibold"
                    : "border-transparent text-fog hover:text-parchment hover:border-mist"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow p-6 flex flex-col items-center">
        <div className="w-full max-w-5xl">
          {/* STATE 1: Onboarding interview in progress */}
          {!profile && (
            <div className="w-full max-w-2xl mx-auto flex flex-col min-h-[70vh] bg-panel rounded-lg border border-mist overflow-hidden shadow-xl">
              {/* Interview header */}
              <div className="bg-panel-raised border-b border-mist px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-mono-label text-xs uppercase tracking-widest text-blaze">
                    Phase 1: Goal Discovery
                  </p>
                  <h2 className="font-display text-2xl font-semibold text-parchment mt-1">
                    Onboarding Conversation
                  </h2>
                  <p className="text-xs text-fog">
                    Answer the mentor's questions. We'll discover your goal, skills, timeline, and layout your custom route.
                  </p>
                </div>
                {interviewSession && (
                  <button
                    onClick={startNewInterview}
                    className="rounded-full border border-blaze/50 hover:bg-blaze/10 px-3 py-1.5 text-xs text-blaze font-mono-label transition shrink-0"
                  >
                    Reset Chat
                  </button>
                )}
              </div>

              {/* Chat history */}
              <div className="flex-grow overflow-y-auto p-6 space-y-4 max-h-[50vh] min-h-[40vh] bg-bg/25">
                {interviewSession ? (
                  chatHistory.map((msg, i) => {
                    const isMentor = msg.role === "assistant";
                    return (
                      <div
                        key={i}
                        className={`flex ${isMentor ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-4 text-sm leading-relaxed border ${
                            isMentor
                              ? "bg-panel border-mist text-parchment"
                              : "bg-blaze/10 border-blaze/30 text-parchment font-medium"
                          }`}
                        >
                          <p className="font-mono-label text-[10px] uppercase tracking-wider text-moss mb-1">
                            {isMentor ? "▲ AI Mentor" : "● You"}
                          </p>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10 space-y-6">
                    <p className="text-sm text-fog max-w-md mx-auto">
                      Ready to build your study path? Let's take 15 minutes to talk about your background, available hours, and destination goal.
                    </p>
                    <div className="flex flex-col items-center gap-4">
                      <button
                        onClick={startNewInterview}
                        className="rounded-full bg-blaze px-8 py-3 text-sm font-semibold text-bg hover:bg-blaze-dim transition shadow-md"
                      >
                        Start Onboarding Interview
                      </button>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              {interviewSession && (
                <form
                  onSubmit={handleSendChatMessage}
                  className="border-t border-mist bg-panel-raised p-4 flex gap-2"
                >
                  <input
                    type="text"
                    required
                    disabled={isChatSending}
                    placeholder="Describe your goals, experience, or constraint hours..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    className="flex-grow rounded-md border border-mist bg-panel px-4 py-3 text-sm text-parchment outline-none focus:border-blaze disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isChatSending || !chatMessage.trim()}
                    className="rounded-md bg-blaze px-5 py-3 text-sm font-semibold text-bg hover:bg-blaze-dim transition disabled:opacity-50"
                  >
                    {isChatSending ? "Sending..." : "Send"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* STATE 2: Profile constructed, but Roadmap NOT generated */}
          {profile && !roadmap && (
            <div className="w-full max-w-xl mx-auto text-center bg-panel border border-mist rounded-lg p-8 space-y-6 shadow-xl">
              <div>
                <span className="inline-block marker-pulse h-3 w-3 rounded-full bg-blaze mb-2"></span>
                <p className="font-mono-label text-xs uppercase tracking-widest text-blaze">
                  Basecamp
                </p>
                <h2 className="font-display text-3xl font-semibold text-parchment mt-1">
                  Onboarding Complete
                </h2>
              </div>
              <p className="text-sm text-fog leading-relaxed">
                Your profile has been built from your interview conversation. We've compiled your constraints, hours per week ({profile.hoursPerWeek}h), and learning style preferences.
              </p>

              <div className="bg-bg/40 border border-mist rounded p-4 text-left space-y-2 text-xs text-fog">
                <p className="font-mono-label uppercase tracking-wider text-moss">Your Profile Summary</p>
                <p><strong className="text-parchment">Goal:</strong> {profile.goal}</p>
                <p><strong className="text-parchment">Focus Domain:</strong> {profile.domain}</p>
                <p><strong className="text-parchment">Estimated Timeline:</strong> {profile.timelineWeeks} Weeks</p>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleGenerateRoadmap}
                  disabled={isGeneratingRoadmap}
                  className="w-full sm:w-auto rounded-full bg-blaze px-8 py-3 text-sm font-semibold text-bg hover:bg-blaze-dim transition shadow-md disabled:opacity-60"
                >
                  {isGeneratingRoadmap ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent"></div>
                      <span>Plotting your Route...</span>
                    </div>
                  ) : (
                    "Generate Your Custom Roadmap"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: Profile AND Roadmap active */}
          {profile && roadmap && (
            <div className="space-y-6">
              {/* Nudge Coaching Banner */}
              {nudgeMessage && (
                <div className="border border-blaze/60 bg-blaze/10 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse">
                  <div className="space-y-1">
                    <p className="font-mono-label text-[10px] uppercase tracking-widest text-blaze font-bold">
                      ▲ COACHING NUDGE
                    </p>
                    <p className="text-sm text-parchment font-medium leading-relaxed">
                      {nudgeMessage}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleFollowNudge}
                      className="rounded-full bg-blaze px-4 py-1.5 text-xs font-semibold text-bg hover:bg-blaze-dim transition"
                    >
                      Follow Action
                    </button>
                    <button
                      onClick={handleIgnoreNudge}
                      className="rounded-full border border-mist px-4 py-1.5 text-xs text-fog hover:text-parchment transition"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 1: Roadmap view */}
              {activeTab === "roadmap" && (
                <div className="space-y-6">
                  {/* Goal and general progress details */}
                  <div className="bg-panel/40 backdrop-blur-md border border-mist/80 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <p className="font-mono-label text-xs uppercase tracking-widest text-moss">
                        Active Destination
                      </p>
                      <h2 className="font-display text-3xl font-semibold text-parchment mt-1">
                        {roadmap.goal}
                      </h2>
                    </div>
                    <div className="w-full md:w-64 space-y-1 shrink-0">
                      <div className="flex justify-between text-xs font-mono-label text-fog">
                        <span>Summit Progress</span>
                        <span className="text-blaze font-bold">{roadmap.progressPercent}%</span>
                      </div>
                      <div className="h-2 w-full bg-bg/50 rounded-full overflow-hidden border border-mist/60">
                        <div
                          className="h-full bg-blaze transition-all duration-500"
                          style={{ width: `${roadmap.progressPercent}%` }}
                        />
                      </div>
                      <div className="pt-2 text-right">
                        <button
                          onClick={() => setIsSessionModalOpen(true)}
                          className="rounded-full bg-moss/20 text-moss border border-moss/30 px-4 py-1.5 text-xs font-semibold hover:bg-moss hover:text-bg transition hover:scale-105 active:scale-95"
                        >
                          + Log Study Time
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Milestones and Topics layout */}
                  <div className="space-y-6">
                    <h3 className="font-display text-2xl font-bold border-b border-mist pb-2 text-parchment flex items-center justify-between">
                      <span>Stretches & Milestones</span>
                      <span className="font-mono-label text-xs text-fog">
                        {roadmap.milestones.length} Milestones
                      </span>
                    </h3>

                    <div className="grid gap-6 md:grid-cols-2">
                      {roadmap.milestones.map((milestone) => (
                        <RoadmapCard
                          key={milestone.milestone_id}
                          milestone={milestone}
                          onSelectTopic={setSelectedTopicForStudy}
                          onTakeQuiz={setSelectedMilestoneForQuiz}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Nudges, Mastery & Reviews view */}
              {activeTab === "nudges-reviews" && (
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Left columns: Reviews Feed */}
                  <div className="md:col-span-2 space-y-6">
                    {/* Trigger Coaching Nudge Check */}
                    <div className="bg-panel border border-mist rounded-lg p-6 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-display text-2xl font-semibold text-parchment">
                            Coach Check-in
                          </h3>
                          <p className="text-xs text-fog mt-1">
                            Run a manual review of your study patterns to pull direct feedback or coaching nudges from the AI.
                          </p>
                        </div>
                        <button
                          onClick={handleCheckNudge}
                          disabled={isCheckingNudge}
                          className="rounded-full bg-blaze px-5 py-2 text-xs font-semibold text-bg hover:bg-blaze-dim transition disabled:opacity-50 shrink-0"
                        >
                          {isCheckingNudge ? "Analyzing..." : "Trigger Check"}
                        </button>
                      </div>
                    </div>

                    {/* Weekly Reviews List */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-mist pb-2">
                        <h3 className="font-display text-2xl font-bold text-parchment">
                          Weekly Progress Reviews
                        </h3>
                        <button
                          onClick={handleGenerateWeeklyReview}
                          disabled={isGeneratingReview}
                          className="rounded-full border border-moss text-moss hover:bg-moss/10 px-4 py-1 text-xs transition disabled:opacity-50"
                        >
                          {isGeneratingReview ? "Compiling..." : "Compile Weekly Review"}
                        </button>
                      </div>

                      {weeklyReviews.length === 0 ? (
                        <div className="bg-panel/40 border border-mist/40 rounded-lg p-8 text-center text-fog text-xs">
                          No weekly reviews compiled yet. The weekly job runs automatically on Sunday evening, or you can trigger it manually above.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {weeklyReviews.map((rev) => (
                            <div key={rev.id} className="bg-panel border border-mist rounded-lg p-6 space-y-4">
                              <div className="flex items-center justify-between border-b border-mist/40 pb-2">
                                <span className="font-mono-label text-xs text-moss font-bold">
                                  ▲ WEEKLY SUMMATION
                                </span>
                                <span className="text-[10px] text-fog font-mono-label">
                                  {new Date(rev.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm text-parchment font-medium leading-relaxed">
                                {rev.summary}
                              </p>

                              <div className="grid gap-4 sm:grid-cols-2 text-xs pt-2">
                                <div className="bg-bg/40 border border-mist/60 rounded p-3 space-y-2">
                                  <p className="font-mono-label uppercase text-moss font-semibold">
                                    Next Week Focus
                                  </p>
                                  <p className="text-fog leading-relaxed">
                                    {rev.recommendations.next_week_focus}
                                  </p>
                                </div>
                                <div className="bg-bg/40 border border-mist/60 rounded p-3 space-y-2">
                                  <p className="font-mono-label uppercase text-blaze font-semibold">
                                    Motivation Nudge
                                  </p>
                                  <p className="text-fog leading-relaxed">
                                    {rev.recommendations.motivational_insight}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Past Coaching Nudges */}
                    <div className="space-y-4">
                      <h3 className="font-display text-2xl font-bold border-b border-mist pb-2 text-parchment">
                        Coaching Nudge History
                      </h3>
                      {nudges.length === 0 ? (
                        <div className="bg-panel/40 border border-mist/40 rounded-lg p-6 text-center text-fog text-xs">
                          No coaching nudges recorded yet. Nudges trigger when inactivity or pacing shifts are detected.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {nudges.map((nudge, index) => (
                            <div key={index} className="bg-panel border border-mist rounded-lg p-4 space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-mono-label text-fog">
                                <span className="text-blaze font-bold uppercase">NUDGE MESSAGE</span>
                                <span>{new Date(nudge.sentAt).toLocaleString()}</span>
                              </div>
                              <p className="text-sm text-parchment">{nudge.message}</p>
                              <div className="flex gap-4 text-xs text-fog pt-1 border-t border-mist/40">
                                <span><strong>Reason:</strong> {nudge.triggerReason}</span>
                                {nudge.suggestedAction && (
                                  <span><strong>Action:</strong> {nudge.suggestedAction}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right column: Topic Mastery Scores */}
                  <div className="space-y-4">
                    <h3 className="font-display text-2xl font-bold border-b border-mist pb-2 text-parchment">
                      Topic Mastery
                    </h3>
                    <div className="bg-panel border border-mist rounded-lg p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                      {masteryScores.length === 0 ? (
                        <p className="text-xs text-fog text-center py-6">
                          No topics have updated mastery yet. Log study sessions or complete checkpoints to establish scoring.
                        </p>
                      ) : (
                        masteryScores.map((score) => {
                          const percentage = Math.round(score.masteryScore * 100);
                          const progressColor =
                            percentage >= 80
                              ? "bg-moss"
                              : percentage >= 50
                              ? "bg-blaze"
                              : "bg-red-500";
                          return (
                            <div key={score.id} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-parchment truncate w-3/4">
                                  {score.topicId}
                                </span>
                                <span className="font-mono-label text-[10px] text-fog font-bold">
                                  {percentage}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-panel-raised rounded-full overflow-hidden border border-mist">
                                <div
                                  className={`h-full transition-all duration-300 ${progressColor}`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Profile Settings view */}
              {activeTab === "profile-settings" && (
                <div className="w-full max-w-xl mx-auto bg-panel border border-mist rounded-lg p-6">
                  <div className="border-b border-mist pb-3 mb-4">
                    <h3 className="font-display text-2xl font-semibold text-parchment">
                      Onboarding preferences
                    </h3>
                    <p className="text-xs text-fog">
                      Modify the core parameters of your profile. Regenerating your roadmap uses these settings.
                    </p>
                  </div>

                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div>
                      <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
                        Primary Career Goal
                      </label>
                      <input
                        type="text"
                        required
                        value={editGoal}
                        onChange={(e) => setEditGoal(e.target.value)}
                        className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
                      />
                    </div>

                    <div>
                      <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
                        Focus Area / Domain
                      </label>
                      <input
                        type="text"
                        required
                        value={editDomain}
                        onChange={(e) => setEditDomain(e.target.value)}
                        className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
                          Current Level
                        </label>
                        <select
                          value={editLevel}
                          onChange={(e) => setEditLevel(e.target.value)}
                          className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2.5 text-xs text-parchment outline-none focus:border-blaze"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
                          Weekly Allocation
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={editHours}
                          onChange={(e) => setEditHours(parseInt(e.target.value) || 0)}
                          className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
                          Timeline (Weeks)
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={editTimeline}
                          onChange={(e) => setEditTimeline(parseInt(e.target.value) || 0)}
                          className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
                        />
                      </div>
                      <div>
                        <label className="block font-mono-label text-xs uppercase tracking-wider text-fog mb-1">
                          Learning Style
                        </label>
                        <input
                          type="text"
                          required
                          value={editStyle}
                          onChange={(e) => setEditStyle(e.target.value)}
                          className="w-full rounded-md border border-mist bg-panel-raised px-3 py-2 text-sm text-parchment outline-none focus:border-blaze"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-mist/60 mt-6">
                      <button
                        type="button"
                        onClick={handleRegenerateRoadmap}
                        className="rounded-full border border-blaze/60 text-blaze hover:bg-blaze/10 px-5 py-2 text-xs font-semibold transition"
                      >
                        Regenerate Roadmap
                      </button>

                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="rounded-full bg-blaze px-6 py-2 text-xs font-semibold text-bg hover:bg-blaze-dim transition disabled:opacity-50"
                      >
                        {isSavingProfile ? "Saving..." : "Save Preferences"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Session Logger Modal */}
      {roadmap && (
        <SessionLogModal
          isOpen={isSessionModalOpen}
          onClose={() => {
            setIsSessionModalOpen(false);
            setPreselectedTopicIdForLog(null);
          }}
          token={activeToken}
          roadmapId={roadmap.id}
          availableTopics={roadmap.milestones.flatMap((m) => m.topics)}
          defaultTopicId={preselectedTopicIdForLog}
          onSuccess={() => {
            showToast("Study session logged!", "success");
            loadDashboardData();
            loadReviewsAndMastery();
          }}
        />
      )}

      {/* Checkpoint Quiz Modal */}
      {roadmap && selectedMilestoneForQuiz && (
        <CheckpointQuiz
          isOpen={selectedMilestoneForQuiz !== null}
          onClose={() => setSelectedMilestoneForQuiz(null)}
          token={activeToken}
          roadmapId={roadmap.id}
          milestone={selectedMilestoneForQuiz}
          onAdaptResult={handleAdaptationComplete}
        />
      )}

      {/* Topic Study Modal / Course Player */}
      {roadmap && selectedTopicForStudy && (
        <TopicStudyModal
          isOpen={selectedTopicForStudy !== null}
          onClose={() => setSelectedTopicForStudy(null)}
          token={activeToken}
          roadmapId={roadmap.id}
          topic={selectedTopicForStudy}
          allTopics={roadmap.milestones.flatMap((m) => m.topics)}
          onSuccess={(updatedRoadmap) => {
            setRoadmap(updatedRoadmap);
            showToast("Topic study complete! Keep going.", "success");
            loadDashboardData();
            loadReviewsAndMastery();
          }}
          onOpenLogSession={(topicId) => {
            setSelectedTopicForStudy(null);
            setPreselectedTopicIdForLog(topicId);
            setIsSessionModalOpen(true);
          }}
        />
      )}

      {/* Ongoing Mentor Chat — available any time, not gated to onboarding/roadmap state */}
      <ChatPanel
        token={activeToken}
        isOpen={isChatPanelOpen}
        onClose={() => setIsChatPanelOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-mist bg-panel px-6 py-4 mt-12 text-center text-xs text-fog font-mono-label">
        AI Mentor © 2026 • Designed around where you actually are.
      </footer>
    </div>
  );
}
