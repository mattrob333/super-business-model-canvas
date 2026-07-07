import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Printer, Share2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAccountId } from "@/hooks/useAccountId";
import { ArtifactDocument, type ArtifactRecord, type ArtifactSource } from "@/components/skills/ArtifactDocument";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { generateShareToken, loadArtifactBrand, type ArtifactBrandInfo } from "@/lib/artifact-brand";

interface ArtifactRow extends ArtifactRecord {
  id: string;
  account_id: string;
}

interface ArtifactShareRow {
  id: string;
  account_id: string;
  artifact_id: string;
  token: string;
  revoked: boolean;
  created_at: string;
}

export default function ArtifactPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { accountId, loading: accountLoading } = useAccountId();
  const { toast } = useToast();
  const [artifact, setArtifact] = useState<ArtifactRow | null>(null);
  const [sources, setSources] = useState<ArtifactSource[]>([]);
  const [share, setShare] = useState<ArtifactShareRow | null>(null);
  const [brand, setBrand] = useState<ArtifactBrandInfo>({ brandColor: null, logoUrl: null });
  const [loading, setLoading] = useState(true);
  const [savingShare, setSavingShare] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const shareUrl = useMemo(() => {
    if (!share || typeof window === "undefined") return null;
    return `${window.location.origin}/share/${share.token}`;
  }, [share]);

  const loadArtifact = useCallback(async () => {
    if (!id || !accountId) return;
    setLoading(true);
    setNotFound(false);
    const { data, error } = await supabaseUntyped
      .from<ArtifactRow>("skill_artifacts")
      .select("id, account_id, skill_key, title, body_md, payload, evidence_ids, created_at")
      .eq("id", id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (error || !data) {
      setArtifact(null);
      setShare(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const [{ data: shareData }, brandData, { data: sourceData }] = await Promise.all([
      supabaseUntyped
        .from<ArtifactShareRow>("artifact_shares")
        .select("id, account_id, artifact_id, token, revoked, created_at")
        .eq("artifact_id", data.id)
        .eq("account_id", accountId)
        .eq("revoked", false)
        .maybeSingle(),
      loadArtifactBrand(accountId),
      // The document's grounding: the evidence items its claims stand on,
      // rendered as numbered source cards under the body.
      data.evidence_ids.length > 0
        ? supabaseUntyped
            .from<ArtifactSource>("evidence_items")
            .select("id, title, excerpt, source_url, source_name")
            .eq("account_id", accountId)
            .in("id", data.evidence_ids)
        : Promise.resolve({ data: [] as ArtifactSource[] }),
    ]);

    setArtifact(data);
    setShare(shareData ?? null);
    setBrand(brandData);
    // Preserve the artifact's evidence order — it is citation order.
    const byId = new Map((sourceData ?? []).map((source) => [source.id, source]));
    setSources(data.evidence_ids.flatMap((sourceId) => byId.get(sourceId) ?? []));
    setLoading(false);
  }, [accountId, id]);

  useEffect(() => {
    if (!accountLoading) void loadArtifact();
  }, [accountLoading, loadArtifact]);

  const createShare = useCallback(async () => {
    if (!artifact || !accountId) return;
    setSavingShare(true);
    try {
      const { data, error } = await supabaseUntyped
        .from<ArtifactShareRow>("artifact_shares")
        .insert({
          account_id: accountId,
          artifact_id: artifact.id,
          token: generateShareToken(),
          created_by: user?.id ?? null,
        })
        .select("id, account_id, artifact_id, token, revoked, created_at")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Share insert matched zero rows.");
      setShare(data);
      toast({ title: "Share link created", description: "This document can now be opened by link." });
    } catch (error) {
      toast({
        title: "Share link was not created",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingShare(false);
    }
  }, [accountId, artifact, toast, user]);

  const revokeShare = useCallback(async () => {
    if (!share || !accountId) return;
    setSavingShare(true);
    try {
      const { data, error } = await supabaseUntyped
        .from<ArtifactShareRow>("artifact_shares")
        .update({ revoked: true })
        .eq("id", share.id)
        .eq("account_id", accountId)
        .select("id, account_id, artifact_id, token, revoked, created_at")
        .single();
      if (error || !data?.revoked) throw new Error(error?.message ?? "Share revoke matched zero rows.");
      setShare(null);
      toast({ title: "Share link revoked", description: "The public link no longer opens this document." });
    } catch (error) {
      toast({
        title: "Share link was not revoked",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingShare(false);
    }
  }, [accountId, share, toast]);

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Copied", description: "Share link copied to clipboard." });
  }, [shareUrl, toast]);

  if (loading || accountLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !artifact) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold">Artifact not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This document may not exist, or it may belong to a different workspace.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="artifact-print-root min-h-full bg-grid-subtle px-4 py-6 sm:px-6">
      <div className="artifact-print-actions mx-auto mb-4 flex max-w-[900px] flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {shareUrl ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyShareUrl()}>
                <ExternalLink className="h-4 w-4" />
                Copy share link
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void revokeShare()} disabled={savingShare}>
                {savingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Revoke
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void createShare()} disabled={savingShare}>
              {savingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Share
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </div>
      <main className="mx-auto max-w-[900px]">
        <ArtifactDocument artifact={artifact} brand={brand} sources={sources} />
      </main>
    </div>
  );
}
