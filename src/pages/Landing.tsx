import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  Activity,
  ArrowRight,
  Blocks,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  Handshake,
  Radar,
  SearchCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const emailSchema = z.string().trim().email("Please enter a valid email address");

const leadErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

const agentTeam = [
  {
    callsign: "Atlas",
    role: "Chief Strategist",
    line: "Sees the whole board. Sets the agenda.",
    accent: "bg-indigo-500",
    ring: "ring-indigo-500/35",
  },
  {
    callsign: "Compass",
    role: "Market Intelligence",
    line: "Knows your customer better than they do.",
    accent: "bg-teal-500",
  },
  {
    callsign: "Forge",
    role: "Product Value",
    line: "Keeps your promise sharp and provable.",
    accent: "bg-orange-500",
  },
  {
    callsign: "Relay",
    role: "Distribution",
    line: "Finds the channels you're not using.",
    accent: "bg-sky-500",
  },
  {
    callsign: "Anchor",
    role: "Customer Success",
    line: "Hears churn coming before it lands.",
    accent: "bg-emerald-500",
  },
  {
    callsign: "Yield",
    role: "Monetization",
    line: "Watches every competitor price move.",
    accent: "bg-amber-500",
  },
  {
    callsign: "Vault",
    role: "Assets & Capabilities",
    line: "Flags the single points of failure.",
    accent: "bg-slate-500",
  },
  {
    callsign: "Tempo",
    role: "Operations",
    line: "Benchmarks how fast you really ship.",
    accent: "bg-violet-500",
  },
  {
    callsign: "Envoy",
    role: "Alliances",
    line: "Keeps a live pipeline of partners.",
    accent: "bg-rose-500",
  },
  {
    callsign: "Ledger",
    role: "Cost & Efficiency",
    line: "Drives cost down on a schedule.",
    accent: "bg-zinc-500",
  },
];

const canvasBlocks = [
  { label: "Key Partners", agent: "Envoy", accent: "bg-rose-500", className: "md:col-start-1 md:row-start-1 md:row-span-2" },
  { label: "Key Activities", agent: "Tempo", accent: "bg-violet-500", className: "md:col-start-2 md:row-start-1" },
  { label: "Key Resources", agent: "Vault", accent: "bg-slate-500", className: "md:col-start-2 md:row-start-2" },
  { label: "Value Propositions", agent: "Forge", accent: "bg-orange-500", className: "md:col-start-3 md:row-start-1 md:row-span-2" },
  { label: "Customer Relationships", agent: "Anchor", accent: "bg-emerald-500", className: "md:col-start-4 md:row-start-1" },
  { label: "Channels", agent: "Relay", accent: "bg-sky-500", className: "md:col-start-4 md:row-start-2" },
  { label: "Customer Segments", agent: "Compass", accent: "bg-teal-500", className: "md:col-start-5 md:row-start-1 md:row-span-2" },
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
  },
  {
    icon: Blocks,
    title: "Competitor canvases",
    body: "Run the same analysis on your rivals. See their business model side-by-side with yours, section by section, and borrow what works.",
  },
  {
    icon: Radar,
    title: "The War Room",
    body: "Your canvas as a live command map - health, freshness, and where competitors are outpacing you, at a glance.",
  },
  {
    icon: ClipboardList,
    title: "Strategy playbooks",
    body: "SWOT, Porter's Five Forces, Blue Ocean and more - populated from your live canvas instead of a blank template.",
  },
  {
    icon: Activity,
    title: "Always on cadence",
    body: "Agents run on schedules you control: re-verify claims monthly, watch competitor pricing weekly, refresh the market read daily.",
  },
  {
    icon: FileText,
    title: "Board-ready output",
    body: "One-click strategy briefs and exportable reports your leadership team can actually act on.",
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
    answer:
      "No. Super BMC works from public data - yours and your competitors'. Private-data integrations are on the roadmap.",
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

function MiniCanvas() {
  return (
    <div className="mx-auto w-full max-w-6xl rounded-lg border bg-card p-3 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Business Model Canvas</p>
          <p className="text-xs text-muted-foreground">Nine sections, ten strategists, live evidence graph</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success" />
          34 cited claims refreshed today
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5 md:grid-rows-2">
        {canvasBlocks.map((block) => (
          <div
            key={block.label}
            className={`${block.className} min-h-[130px] rounded-md border bg-background p-3 transition-colors hover:border-primary/35`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold leading-tight">{block.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{block.agent}</p>
              </div>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${block.accent}`} />
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-2 rounded-full bg-muted" />
              <div className="h-2 w-4/5 rounded-full bg-muted" />
              <div className="h-2 w-2/3 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="min-h-[118px] rounded-md border bg-background p-3 transition-colors hover:border-primary/35">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Cost Structure</h3>
              <p className="mt-1 text-xs text-muted-foreground">Ledger</p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="h-2 rounded-full bg-muted" />
            <div className="h-2 w-3/4 rounded-full bg-muted" />
          </div>
        </div>
        <div className="relative min-h-[118px] overflow-hidden rounded-md border border-primary/45 bg-primary/5 p-3 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]">
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-background px-2 py-1 text-[11px] font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Yield · analyzing
          </div>
          <div className="flex items-start justify-between gap-2 pr-28">
            <div>
              <h3 className="text-sm font-semibold">Revenue Streams</h3>
              <p className="mt-1 text-xs text-muted-foreground">Yield</p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="h-2 rounded-full bg-primary/20" />
            <div className="h-2 w-4/5 rounded-full bg-primary/20" />
          </div>
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
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          placeholder="work@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 bg-background text-base"
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
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
        <section className="relative overflow-hidden border-b">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.32] dark:opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 lg:py-24">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
              <Sparkles className="h-4 w-4" />
              AI-native strategy workspace
            </div>

            <h1 className="mx-auto mt-7 max-w-5xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Your business model, run by a team of AI strategists
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              Paste your company's URL. Super BMC builds your Business Model Canvas from public evidence in about 60
              seconds - then ten AI agents keep it alive: researching your market, watching your competitors, and
              telling you what to do next.
            </p>

            <div className="mt-8">
              <SignupForm />
              <div className="mt-4 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground sm:flex-row">
                <Link
                  to="/auth"
                  className="rounded-md font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  I already have an account
                </Link>
                <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/40 sm:block" />
                <span>Free to start · No credit card · Built on live public data, cited to the source</span>
              </div>
            </div>

            <div className="mt-14">
              <MiniCanvas />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              From public footprint to living strategy system.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {howItWorks.map((step, index) => (
              <div key={step.title} className="rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="agents" className="border-y bg-muted/35">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-primary">The agent team</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Ten strategists. One canvas. Zero standing meetings.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Every section of the Business Model Canvas is owned by a specialist agent that actually works the
                problem.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {agentTeam.map((agent) => (
                <div
                  key={agent.callsign}
                  className={`rounded-lg border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    agent.callsign === "Atlas" ? `ring-2 ${agent.ring}` : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${agent.accent}`} />
                    <div>
                      <h3 className="text-base font-semibold">{agent.callsign}</h3>
                      <p className="text-xs text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{agent.line}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">Workspace capabilities</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              The canvas becomes the operating system.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-primary">Who it's for</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Built for people accountable for the next move.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {audiences.map((audience) => (
                <div key={audience.title} className="rounded-lg border bg-background p-6">
                  <audience.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-5 text-lg font-semibold">{audience.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{audience.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-primary">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">What early users ask first.</h2>
          </div>
          <Accordion type="single" collapsible className="mt-10 rounded-lg border bg-card px-5">
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="border-y bg-muted/45">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
            <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              See your business the way your smartest competitor sees it.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Your first canvas takes about 60 seconds.</p>
            <div className="mt-8">
              <SignupForm compact />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              AI strategy workspace on a living Business Model Canvas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">© 2026 Super BMC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
