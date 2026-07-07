import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { ArtifactDocument, type ArtifactRecord, type ArtifactSource } from "@/components/skills/ArtifactDocument";
import type { ArtifactBrandInfo } from "@/lib/artifact-brand";

interface SharedArtifactResponse {
  artifact: {
    title: string;
    body_md: string;
    payload: Json;
    created_at: string;
  };
  brand: ArtifactBrandInfo;
  sources?: unknown;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

/**
 * The edge function response crosses a trust boundary — validate each source's
 * shape and drop anything malformed rather than letting it reach the document.
 */
function parseSources(value: unknown): ArtifactSource[] {
  if (!Array.isArray(value)) return [];
  const sources: ArtifactSource[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { id, title, excerpt, source_url, source_name } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof title !== "string") continue;
    if (!isOptionalString(excerpt) || !isOptionalString(source_url) || !isOptionalString(source_name)) continue;
    sources.push({
      id,
      title,
      excerpt: excerpt ?? null,
      source_url: source_url ?? null,
      source_name: source_name ?? null,
    });
  }
  return sources;
}

export default function SharedArtifactPage() {
  const { token } = useParams();
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [brand, setBrand] = useState<ArtifactBrandInfo>({ brandColor: null, logoUrl: null });
  const [sources, setSources] = useState<ArtifactSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke<SharedArtifactResponse>("shared-artifact", {
        body: { token },
      });
      if (cancelled) return;
      if (error || !data?.artifact) {
        setNotFound(true);
      } else {
        setArtifact({
          skill_key: "shared",
          title: data.artifact.title,
          body_md: data.artifact.body_md,
          payload: data.artifact.payload,
          evidence_ids: [],
          created_at: data.artifact.created_at,
        });
        setBrand(data.brand ?? { brandColor: null, logoUrl: null });
        setSources(parseSources(data.sources));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !artifact) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="text-xl font-semibold">Shared document not found</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This link may have been revoked, or the token may be incorrect.
        </p>
      </div>
    );
  }

  return (
    <div className="artifact-print-root min-h-screen bg-grid-subtle px-4 py-6 sm:px-6">
      <div className="artifact-print-actions mx-auto mb-4 flex max-w-[900px] justify-end">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print / PDF
        </Button>
      </div>
      <main className="mx-auto max-w-[900px]">
        <ArtifactDocument artifact={artifact} brand={brand} sources={sources} publicFooter />
      </main>
    </div>
  );
}
