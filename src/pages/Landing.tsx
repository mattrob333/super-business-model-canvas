import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  Activity,
  ArrowRight,
  Blocks,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  FileSearch,
  FileText,
  Handshake,
  Lock,
  Radar,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  LANDING_AGENT_ACCENTS,
  LANDING_CANVAS_AGENT_ORDER,
  type LandingAgentAccent,
  type LandingAgentCallsign,
} from "@/components/landing/agent-accents";
import { lightThemeVars } from "@/lib/light-theme";

const emailSchema = z.string().trim().email("Please enter a valid email address");

const leadErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

const atlas = LANDING_AGENT_ACCENTS.Atlas;
const sectionAgents = LANDING_CANVAS_AGENT_ORDER.map((callsign) => LANDING_AGENT_ACCENTS[callsign]);

const canvasBlocks = [
  { label: "Key Partners", agent: "Envoy" as const, className: "md:col-start-1 md:row-start-1 md:row-span-2" },
  { label: "Key Activities", agent: "Tempo" as const, className: "md:col-start-2 md:row-start-1" },
  { label: "Key Resources", agent: "Vault" as const, className: "md:col-start-2 md:row-start-2" },
  { label: "Value Propositions", agent: "Forge" as const, className: "md:col-start-3 md:row-start-1 md:row-span-2" },
  { label: "Customer Relationships", agent: "Anchor" as const, className: "md:col-start-4 md:row-start-1" },
  { label: "Channels", agent: "Relay" as const, className: "md:col-start-4 md:row-start-2" },
  { label: "Customer Segments", agent: "Compass" as const, className: "md:col-start-5 md:row-start-1 md:row-span-2" },
];

const bottomCanvasBlocks = [
  { label: "Cost Structure", agent: "Ledger" as const },
  { label: "Revenue Streams", agent: "Yield" as const, live: true },
];

const howItWorks = [
  {
    title: "Drop in a URL",
    body: "Our research engine scrapes your public footprint - site, pricing, reviews, news - and drafts all nine sections of your Business Model Canvas, every claim linked to its source.",
  },
  {
    title: "Meet your team",
    body: "Nine domain experts take ownership: one agent per section of your canvas, each with its own tools, benchmarks, and standing orders to keep its domain sharp.",
  },
  {
    title: "Get your next move",
    body: "Atlas, your chief strategist, reads everything they surface - and hands you a ranked agenda of what to do next, backed by evidence you can click.",
  },
];

const features = [
  {
    icon: SearchCheck,
    title: "Evidence or it doesn't ship",
    body: "Every canvas item links to a source with a date and excerpt. Claims without evidence are visibly marked speculative - no confident hallucinations.",
    tint: "bg-emerald-50",
    text: "text-emerald-700",
    wide: true,
  },
  {
    icon: Blocks,
    title: "Competitor canvases",
    body: "Run the same analysis on your rivals. See their business model side-by-side with yours, section by section, and borrow what works.",
    tint: "bg-sky-50",
    text: "text-sky-700",
  },
  {
    icon: Radar,
    title: "The War Room",
    body: "Your canvas as a live command map - health, freshness, and where competitors are outpacing you, at a glance.",
    tint: "bg-indigo-50",
    text: "text-indigo-700",
  },
  {
    icon: ClipboardList,
    title: "Strategy playbooks",
    body: "SWOT, Porter's Five Forces, Blue Ocean and more - populated from your live canvas instead of a blank template.",
    tint: "bg-orange-50",
    text: "text-orange-700",
  },
  {
    icon: Activity,
    title: "Always on cadence",
    body: "Agents run on schedules you control: re-verify claims, watch competitor pricing, and refresh the market read as conditions change.",
    tint: "bg-violet-50",
    text: "text-violet-700",
  },
  {
    icon: FileText,
    title: "Board-ready output",
    body: "One-click strategy briefs and exportable reports your leadership team can actually act on.",
    tint: "bg-amber-50",
    text: "text-amber-700",
  },
];

const audiences = [
  {
    icon: BriefcaseBusiness,
    title: "Investors & portfolio teams",
    body: "One living canvas per portfolio company, refreshed automatically. Walk into every board meeting already briefed.",
  },
  {
    icon: Target,
    title: "Founders & operators",
    body: "Know where you're falling behind and where to press - without hiring a strategy consultancy.",
  },
  {
    icon: Handshake,
    title: "Advisors & fractional executives",
    body: "Run deeper engagements for more clients, with receipts for every recommendation.",
  },
];

const faqs = [
  {
    question: "Where does the data come from?",
    answer:
      "Public sources only: your website, pricing pages, review platforms, news, filings, and social. Every claim is cited - you can click any item on your canvas and see exactly where it came from.",
  },
  {
    question: "How is this different from asking ChatGPT?",
    answer:
      "A chat answer is a one-time guess. Super BMC is a system: specialized agents with real research tools, a shared canvas they keep current, verification that rejects unsupported claims, and a strategist that watches your market on a schedule.",
  },
  {
    question: "Do I need to connect my internal data?",
    answer: "No. Super BMC works from public data - yours and your competitors'. Private-data integrations are on the roadmap.",
  },
  {
    question: "What does it cost?",
    answer:
      "Free while in early access. Paid plans arrive with the full agent workspace - early-access accounts get preferred pricing.",
  },
  {
    question: "Can I try it on a competitor first?",
    answer:
      "Yes - analyze any company with a public web presence. Most people start with their own, then immediately run their loudest rival.",
  },
];

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#agents", label: "Agents" },
  { href: "#faq", label: "FAQ" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">{children}</p>;
}

function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-sm font-semibold tracking-wide text-primary-foreground">
        SUPER
      </span>
      <span className="text-sm font-medium tracking-wide text-foreground sm:text-base">Business Model Canvas</span>
    </Link>
  );
}

function SectionPill({ agent }: { agent: LandingAgentAccent }) {
  return (
    <span
      data-agent-section-pill={agent.callsign}
      className={`rounded-md px-2 py-1 text-[11px] font-medium ${agent.tint} ${agent.text}`}
    >
      {agent.section}
    </span>
  );
}

function CanvasBlock({
  label,
  agent,
  className = "",
  live = false,
}: {
  label: string;
  agent: LandingAgentCallsign;
  className?: string;
  live?: boolean;
}) {
  const rosterAgent = LANDING_AGENT_ACCENTS[agent];

  return (
    <div
      className={`${className} relative min-h-[132px] rounded-lg border border-border/60 bg-white p-3 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md md:min-h-full`}
    >
      <span className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${rosterAgent.dot}`} />
      {live ? (
        <div className="absolute right-3 top-7 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Yield - analyzing
        </div>
      ) : null}
      <div className={`${live ? "pr-28" : "pr-5"}`}>
        <div className="flex min-h-10 items-start">
          <h3 className="line-clamp-2 text-left text-xs font-semibold leading-5 text-foreground">{label}</h3>
        </div>
        <p
          data-canvas-agent-chip={agent}
          className="mt-1 flex items-center gap-1.5 text-left text-[10px] leading-none text-muted-foreground"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${rosterAgent.dot}`} />
          {agent}
        </p>
      </div>
      <div className="mt-5 space-y-2">
        <div className={`h-2 rounded-full ${live ? "bg-primary/20" : "bg-muted"}`} />
        <div className={`h-2 w-5/6 rounded-full ${live ? "bg-primary/20" : "bg-muted"}`} />
        <div className={`h-2 w-2/3 rounded-full ${live ? "bg-primary/20" : "bg-muted"}`} />
      </div>
    </div>
  );
}

function MiniCanvas() {
  return (
    <div className="mx-auto w-full max-w-5xl rounded-lg border border-border/60 bg-white shadow-xl shadow-slate-900/10">
      <div className="flex h-11 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </div>
        <p className="hidden text-xs font-medium text-muted-foreground sm:block">Super BMC - Acme Corp</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success" />
          Evidence-linked
        </div>
      </div>

      <div className="p-3 sm:p-5">
        <div className="grid gap-2 md:grid-cols-5 md:grid-rows-[132px_132px]">
          {canvasBlocks.map((block) => (
            <CanvasBlock key={block.label} {...block} />
          ))}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {bottomCanvasBlocks.map((block) => (
            <CanvasBlock key={block.label} {...block} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SignupForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);

    if (!parsed.success) {
      toast({
        title: "Invalid email",
        description: parsed.error.errors[0]?.message ?? "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("leads").insert([{ email: parsed.data }]);

      if (error && leadErrorCode(error) !== "23505") {
        throw error;
      }

      if (error && leadErrorCode(error) === "23505") {
        toast({
          title: "Welcome back",
          description: "That email is already on the early-access list. Continue by creating your account.",
        });
      }

      navigate(`/auth?mode=signup&email=${encodeURIComponent(parsed.data)}`);
    } catch (error) {
      console.error("Error submitting email:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? "mx-auto w-full max-w-xl" : "mx-auto w-full max-w-2xl"}>
      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-white p-1.5 shadow-sm sm:flex-row">
        <Input
          type="email"
          placeholder="work@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={isSubmitting}
          aria-label="Email address"
        />
        <Button type="submit" size="lg" className="h-12 shrink-0 gap-2 px-6" disabled={isSubmitting}>
          {isSubmitting ? "Starting..." : "Start free analysis"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

const Landing = () => {
  const { user, loading } = useAuth();
  const signedInDestination = useMemo(() => (user ? "/canvas" : "/auth"), [user]);

  useEffect(() => {
    document.title = "Super BMC - AI strategy workspace on a living Business Model Canvas";

    const description =
      "Paste your company's URL. Super BMC builds your Business Model Canvas from public evidence in about 60 seconds - then ten AI agents keep it alive: researching your market, watching your competitors, and telling you what to do next.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

  return (
    <div className="light min-h-screen bg-background text-foreground" style={lightThemeVars}>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to={signedInDestination}>{user && !loading ? "Open dashboard" : "Sign in"}</Link>
            </Button>
            <Button asChild className="hidden gap-2 sm:inline-flex">
              <Link to="/auth?mode=signup">
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="bg-grid-subtle border-b border-border/60">
          <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 lg:py-28">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1 text-sm font-medium text-primary shadow-sm">
              <Sparkles className="h-4 w-4" />
              AI-native strategy workspace
            </div>

            <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
              Your business model, run by AI strategists
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
              Paste your company's URL. Super BMC builds your Business Model Canvas from public evidence in about 60
              seconds - then ten AI agents keep it alive: researching your market, watching your competitors, and
              telling you what to do next.
            </p>

            <div className="mt-9">
              <SignupForm />
              <div className="mx-auto mt-4 flex max-w-2xl flex-col items-start justify-center gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
                {["Free to start", "No credit card", "Every claim cited to source"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  to="/auth"
                  className="rounded-md font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Sign in
                </Link>
              </p>
            </div>

            <div className="mt-16">
              <MiniCanvas />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-28">
            <div className="max-w-2xl">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                From public footprint to living strategy system.
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
                The workflow stays simple while the agents do the heavy lifting.
              </p>
            </div>
            <div className="relative mt-12 grid gap-5 md:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-[25px] hidden border-t border-border md:block" />
              {howItWorks.map((step, index) => (
                <div
                  key={step.title}
                  className="relative rounded-lg border border-border/60 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
                    {index + 1}
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="agents" className="border-y border-border/60 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-28">
            <div className="max-w-3xl">
              <Eyebrow>The agent team</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Ten strategists. One canvas. Zero standing meetings.
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
                Every section of the Business Model Canvas is owned by a specialist agent that actually works the
                problem.
              </p>
            </div>

            <div className={`mt-12 rounded-lg border border-l-4 ${atlas.border} bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg ${atlas.tint} text-2xl font-semibold ${atlas.text}`}>
                  {atlas.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xl font-semibold">{atlas.callsign}</p>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">{atlas.role}</p>
                    </div>
                    <SectionPill agent={atlas} />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{atlas.line}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {sectionAgents.map((agent) => (
                <div
                  key={agent.callsign}
                  className="rounded-lg border border-border/60 bg-white p-5 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${agent.tint} text-sm font-semibold ${agent.text}`}>
                        {agent.initial}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold">{agent.callsign}</h3>
                        <p className="text-xs text-muted-foreground">{agent.role}</p>
                      </div>
                    </div>
                    <SectionPill agent={agent} />
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{agent.line}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-28">
            <div className="max-w-3xl">
              <Eyebrow>Workspace capabilities</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                The canvas becomes the operating system.
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
                Evidence, competitors, playbooks, and agent cadence stay connected in one place.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className={`rounded-lg border border-border/60 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md ${
                    feature.wide ? "lg:col-span-2" : ""
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.tint} ${feature.text}`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-white">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-3">
            {[
              { icon: ShieldCheck, text: "Propose-before-execute - agents draft, you approve" },
              { icon: FileSearch, text: "Every claim traceable to a dated source" },
              { icon: Lock, text: "Your workspace data is never shared" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <item.icon className="h-5 w-5 shrink-0 text-primary" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-28">
            <div className="max-w-3xl">
              <Eyebrow>Who it's for</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Built for people accountable for the next move.
              </h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {audiences.map((audience) => (
                <div key={audience.title} className="rounded-lg border border-border/60 bg-background p-6 shadow-sm">
                  <audience.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-5 text-lg font-semibold">{audience.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{audience.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-muted/40">
          <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:py-28">
            <div>
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">What early users ask first.</h2>
            </div>
            <Accordion type="single" collapsible className="mt-10 rounded-lg border border-border/60 bg-white px-5 shadow-sm">
              {faqs.map((faq) => (
                <AccordionItem key={faq.question} value={faq.question}>
                  <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="border-y border-border/60 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
              See your business the way your smartest competitor sees it.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">Your first canvas takes about 60 seconds.</p>
            <div className="mt-8">
              <SignupForm compact />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              AI strategy workspace on a living Business Model Canvas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/auth"
              className="rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">2026 Super BMC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
