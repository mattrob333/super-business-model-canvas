import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The one agent-reply markdown renderer, shared by every chat surface
 * (War Room dock, workspace rooms). Grown from the inline prose block that
 * used to live in AtlasChat/WorkspaceThread.
 *
 * Note: `@tailwindcss/typography` is installed but NOT registered in
 * tailwind.config.ts, so `prose` classes are inert here — every element is
 * styled explicitly below. All colors are the app's semantic tokens
 * (foreground/muted/border/primary), so light and dark themes both work
 * without a `dark:` fork; the legacy `prose … dark:prose-invert` stack is
 * kept as a harmless fallback should the plugin ever be enabled.
 */
const AGENT_PROSE_CLASS = [
  // Legacy prose stack (inert until the typography plugin is registered).
  "prose prose-sm prose-slate dark:prose-invert",
  // Base
  "min-w-0 max-w-none break-words text-sm text-foreground",
  "[&>*:first-child]:!mt-0 [&>*:last-child]:!mb-0",
  // Paragraphs — comfortable rhythm instead of a wall of text
  "[&_p]:my-3 [&_p]:leading-[1.65]",
  // Emphasis — bold clearly heavier than body
  "[&_strong]:font-bold [&_strong]:text-foreground",
  // Links
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  // Headings — a real hierarchy that still fits a chat column
  "[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-base [&_h1]:font-bold [&_h1]:leading-snug [&_h1]:text-foreground",
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:leading-snug [&_h2]:text-foreground",
  "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_h4]:mb-1 [&_h4]:mt-3.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground",
  "[&_h5]:mb-1 [&_h5]:mt-3 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:text-foreground",
  "[&_h6]:mb-1 [&_h6]:mt-3 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:text-muted-foreground",
  // Lists — real markers, breathing room, quiet nested lists
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-1.5 [&_li]:pl-1 [&_li]:leading-relaxed",
  "[&_li::marker]:text-muted-foreground",
  "[&_li_ol]:my-1.5 [&_li_ul]:my-1.5 [&_ul_ul]:list-[circle]",
  // GFM task lists — the checkbox is the marker
  "[&_.task-list-item]:list-none [&_.task-list-item]:pl-0 [&_li>input]:mr-1.5 [&_li>input]:align-middle",
  // Tables — bordered rows inside the overflow wrapper rendered below
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]",
  "[&_th]:border-b [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top",
  "[&_tr:last-child>td]:border-b-0",
  // Blockquotes — quiet slate asides
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  // Rules — a visible pause, not a cramped line
  "[&_hr]:my-5 [&_hr]:border-border",
  // Code — inline chips and wrapped blocks (chat columns never scroll sideways)
  "[&_code]:break-words",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.8125rem] [&_:not(pre)>code]:font-medium",
  "[&_pre]:my-3 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-relaxed",
].join(" ");

export function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className={AGENT_PROSE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Wide tables scroll inside their own bordered wrapper instead of
          // stretching (or overflowing) the chat column.
          table: ({ node: _node, ...props }) => (
            <div className="my-3 w-full overflow-x-auto rounded-md border border-border">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
