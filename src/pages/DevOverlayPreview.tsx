import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompanyProfileDrawer } from "@/components/CompanyProfileDrawer";
import { BMCSectionEditor } from "@/components/BMCSectionEditor";

/**
 * DEV-ONLY visual harness for the FocusDrawer system (spec 09).
 * Registered in App.tsx only when import.meta.env.DEV — never ships.
 * Lets Playwright open each drawer with fixture data and screenshot it.
 */

const FIXTURE_COMPANY = {
  name: "Acme Analytics",
  industry: "B2B SaaS / Revenue Analytics",
  description:
    "Acme Analytics builds revenue intelligence dashboards for mid-market sales teams. " +
    "The platform unifies CRM, billing, and product usage data into a single forecasting " +
    "surface, with anomaly alerts and board-ready reporting used by finance and RevOps.",
  productsServices: [
    "Forecast Studio: pipeline forecasting with scenario modeling",
    "Signals: anomaly detection across CRM and billing events",
    "Boardroom: automated monthly reporting packs",
  ],
  keyExecutives: [
    { name: "Dana Whitfield", role: "CEO and Co-Founder" },
    { name: "Marcus Lee", role: "CTO" },
  ],
  website: "https://acme.example",
  notes: "Fixture data for overlay preview.",
};

const FIXTURE_SECTION = {
  title: "Key Partners",
  items: [
    "Cloud infrastructure providers for hosting and data pipelines",
    "CRM platform integration partners",
    "Regional reseller network in DACH and Nordics",
  ],
  notes: "Deepen the CRM partnership tier by Q3.",
};

export default function DevOverlayPreview() {
  const [sectionOpen, setSectionOpen] = useState(false);

  return (
    <div className="bg-grid-subtle min-h-screen space-y-4 p-10">
      <h1 className="text-xl font-semibold">Overlay preview (DEV only)</h1>
      <div className="flex gap-3">
        <CompanyProfileDrawer data={FIXTURE_COMPANY} onUpdate={() => undefined} />
        <Button data-testid="open-section-editor" variant="outline" onClick={() => setSectionOpen(true)}>
          Open section editor
        </Button>
      </div>
      <BMCSectionEditor
        open={sectionOpen}
        onOpenChange={setSectionOpen}
        section={FIXTURE_SECTION}
        companyName={FIXTURE_COMPANY.name}
        onSave={() => undefined}
      />
    </div>
  );
}
