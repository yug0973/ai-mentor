import { Link } from "react-router-dom";
import TrailMap from "../components/TrailMap";
import ScrollReveal from "../components/ScrollReveal";

const route = [
  {
    marker: "Trailhead",
    title: "The interview",
    copy: "Fifteen minutes of real questions — your goal, your hours, what you already know. Not a dropdown form.",
  },
  {
    marker: "Basecamp",
    title: "Your roadmap",
    copy: "Milestones and topics built from your answers, with prerequisites that actually lock and unlock as you go.",
  },
  {
    marker: "Switchbacks",
    title: "Adaptive practice",
    copy: "Fail a checkpoint and the route bends back to cover it. Clear it fast and the next stretch skips ahead.",
  },
  {
    marker: "Summit",
    title: "Job-ready",
    copy: "A defined endpoint you can point to in an interview — not an open-ended \"keep learning forever\" feed.",
  },
];

const strip = [
  {
    title: "Nudges that know your pace",
    copy: "A check-in when you've gone quiet — timed against the hours you said you had, not a fixed daily blast.",
  },
  {
    title: "A weekly review, not a streak count",
    copy: "What you actually covered this week, and what the roadmap adjusted because of it.",
  },
  {
    title: "Your route, not a course catalog",
    copy: "The same interview answers shape every milestone after it. Two learners rarely get the same map.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen text-parchment">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-semibold tracking-tight">
          AI Mentor
        </span>
        <div className="flex items-center gap-6">
          <Link to="/login" className="text-sm text-fog hover:text-parchment">
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-full border border-blaze/60 px-4 py-2 text-sm text-blaze transition hover:bg-blaze hover:text-bg"
          >
            Start your route
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto max-w-6xl px-6 pb-4 pt-10 sm:pt-16">
        <ScrollReveal animation="slide-up">
          <p className="font-mono-label text-xs uppercase tracking-[0.2em] text-blaze">
            Not another course
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
            A route built around where you actually are.
          </h1>
          <p className="mt-5 max-w-xl text-base text-fog sm:text-lg">
            One honest conversation in, and AI Mentor plots the milestones,
            checkpoints, and practice between here and job-ready — then
            re-routes every time you check something off.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/signup"
              className="rounded-full bg-blaze px-6 py-3 text-sm font-medium text-bg transition hover:bg-blaze-dim"
            >
              Start your interview
            </Link>
            <Link
              to="/login"
              className="text-sm text-fog underline decoration-mist underline-offset-4 hover:text-parchment"
            >
              I already have a route
            </Link>
          </div>
        </ScrollReveal>
      </header>

      {/* Trail map hero visual */}
      <div className="mx-auto max-w-6xl px-6 pb-4 pt-6 sm:pt-10">
        <ScrollReveal animation="fade" delay={300}>
          <TrailMap />
        </ScrollReveal>
      </div>

      {/* How it works — the route */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <ScrollReveal>
          <p className="font-mono-label text-xs uppercase tracking-[0.2em] text-blaze">
            The route
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold sm:text-4xl">
            Four stretches. Every learner walks them in a different order of difficulty.
          </h2>
        </ScrollReveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {route.map((stop, i) => (
            <ScrollReveal key={stop.marker} animation="slide-up" delay={i * 80}>
              <div className="border border-mist/80 hover:border-blaze/40 transition-colors duration-300 p-6 rounded-xl h-full">
                <p className="font-mono-label text-xs text-fog">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-3 font-mono-label text-xs uppercase tracking-wider text-blaze">
                  {stop.marker}
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold">
                  {stop.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fog">
                  {stop.copy}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-t border-mist/60 bg-panel-raised/20">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <ScrollReveal>
            <h2 className="max-w-xl font-display text-3xl font-semibold sm:text-4xl">
              The route doesn't sit still once it's drawn.
            </h2>
          </ScrollReveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {strip.map((f, i) => (
              <ScrollReveal key={f.title} animation="slide-up" delay={i * 100}>
                <div className="border-t border-blaze/50 pt-4 h-full">
                  <p className="font-mono-label text-xs text-fog">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 font-display text-lg font-semibold">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-fog">
                    {f.copy}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
        <ScrollReveal>
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Fifteen minutes in. A summit in view.
          </h2>
          <Link
            to="/signup"
            className="mt-8 inline-block rounded-full bg-blaze px-8 py-3 text-sm font-medium text-bg hover:bg-blaze-dim transition-colors"
          >
            Start your interview
          </Link>
        </ScrollReveal>
      </section>

      <footer className="border-t border-mist px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-fog sm:flex-row">
          <span className="font-mono-label">AI Mentor</span>
          <span>Built one honest conversation at a time.</span>
        </div>
      </footer>
    </div>
  );
}
