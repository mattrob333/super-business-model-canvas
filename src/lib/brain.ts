import { supabase } from "@/integrations/supabase/client";

/**
 * The one authenticated write path into the business brain (plan AT-4).
 * Editing a VariableCard writes `user_override`; answering a GapPrompt writes
 * `user_stated`. Trust ordering lives server-side in the RPC — user values
 * always win and machine re-runs may contradict but never overwrite them.
 */

export type UserBrainSource = "user_stated" | "user_override";

export interface BrainVariableRow {
  id: string;
  account_id: string;
  path: string;
  value: unknown;
  confidence: "high" | "medium" | "low";
  source: string;
  updated_at: string;
}

export async function writeBrainVariable(
  accountId: string,
  path: string,
  value: unknown,
  source: UserBrainSource,
): Promise<BrainVariableRow> {
  const { data, error } = await supabase.rpc("write_brain_variable", {
    p_account_id: accountId,
    p_path: path,
    p_value: value as never,
    p_source: source,
  });
  if (error) throw new Error(error.message);
  return data as unknown as BrainVariableRow;
}

/**
 * The two runnable workflow cards (worker/workflows/*.yaml). A workflow
 * browser is deliberately out of scope (build plan DECISION-NEEDED #3/#5) —
 * this constant mirrors the registry until one exists.
 */
export const RUNNABLE_WORKFLOWS = [
  {
    id: "positioning-sprint",
    title: "Positioning Sprint",
    outcome: "Six research-backed steps to a positioning statement you can defend",
  },
  {
    id: "hormozi-brain-os",
    title: "Offer Builder (Hormozi)",
    outcome: "Market check, scored offers, hooks, proof, and a 30-day content plan",
  },
] as const;

export type RunnableWorkflowId = (typeof RUNNABLE_WORKFLOWS)[number]["id"];
