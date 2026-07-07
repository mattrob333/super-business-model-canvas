import type { Json } from "@/integrations/supabase/types";
import {
  asMessageMarketFitPayload,
  asMonetizationGapsPayload,
  asPartnerOutreachPayload,
  asWateringHolesPayload,
  asWtpSignalsPayload,
} from "@/components/skills/goal-payloads-market";
import {
  MessageMarketFitExhibit,
  MonetizationGapsExhibit,
  PartnerOutreachExhibit,
  WateringHolesExhibit,
  WtpSignalsExhibit,
} from "@/components/skills/GoalExhibitsMarket";
import {
  asAdvocacyEngineScanPayload,
  asChurnSignalAuditPayload,
  asEcosystemWatchPayload,
  asOperationalBenchmarkPayload,
  asVelocityWatchPayload,
} from "@/components/skills/goal-payloads-competition";
import {
  AdvocacyEngineScanExhibit,
  ChurnSignalAuditExhibit,
  EcosystemWatchExhibit,
  OperationalBenchmarkExhibit,
  VelocityWatchExhibit,
} from "@/components/skills/GoalExhibitsCompetition";
import {
  asCostBenchmarkPayload,
  asEfficiencyScanPayload,
  asSinglePointScanPayload,
  asTalentRadarPayload,
} from "@/components/skills/goal-payloads-resilience";
import {
  CostBenchmarkExhibit,
  EfficiencyScanExhibit,
  SinglePointScanExhibit,
  TalentRadarExhibit,
} from "@/components/skills/GoalExhibitsResilience";

/**
 * One dispatch point for the 14 Goal-Phase-1 artifact exhibits, so
 * ArtifactDocument stays a renderer, not a switchboard. Unknown skill keys
 * and payloads that fail their contract render nothing — the markdown body
 * always carries the content.
 */
export function GoalExhibitDispatch({ skillKey, payload }: { skillKey: string; payload: Json }) {
  switch (skillKey) {
    case "yield.monetization_gaps": {
      const parsed = asMonetizationGapsPayload(payload);
      return parsed ? <MonetizationGapsExhibit gaps={parsed} /> : null;
    }
    case "yield.wtp_signals": {
      const parsed = asWtpSignalsPayload(payload);
      return parsed ? <WtpSignalsExhibit signals={parsed} /> : null;
    }
    case "relay.watering_holes": {
      const parsed = asWateringHolesPayload(payload);
      return parsed ? <WateringHolesExhibit holes={parsed} /> : null;
    }
    case "compass.message_market_fit": {
      const parsed = asMessageMarketFitPayload(payload);
      return parsed ? <MessageMarketFitExhibit fit={parsed} /> : null;
    }
    case "envoy.partner_outreach": {
      const parsed = asPartnerOutreachPayload(payload);
      return parsed ? <PartnerOutreachExhibit outreach={parsed} /> : null;
    }
    case "anchor.churn_signal_audit": {
      const parsed = asChurnSignalAuditPayload(payload);
      return parsed ? <ChurnSignalAuditExhibit audit={parsed} /> : null;
    }
    case "anchor.advocacy_engine_scan": {
      const parsed = asAdvocacyEngineScanPayload(payload);
      return parsed ? <AdvocacyEngineScanExhibit scan={parsed} /> : null;
    }
    case "envoy.ecosystem_watch": {
      const parsed = asEcosystemWatchPayload(payload);
      return parsed ? <EcosystemWatchExhibit watch={parsed} /> : null;
    }
    case "tempo.operational_benchmark": {
      const parsed = asOperationalBenchmarkPayload(payload);
      return parsed ? <OperationalBenchmarkExhibit benchmark={parsed} /> : null;
    }
    case "tempo.velocity_watch": {
      const parsed = asVelocityWatchPayload(payload);
      return parsed ? <VelocityWatchExhibit velocity={parsed} /> : null;
    }
    case "vault.single_point_scan": {
      const parsed = asSinglePointScanPayload(payload);
      return parsed ? <SinglePointScanExhibit scan={parsed} /> : null;
    }
    case "vault.talent_radar": {
      const parsed = asTalentRadarPayload(payload);
      return parsed ? <TalentRadarExhibit radar={parsed} /> : null;
    }
    case "ledger.cost_benchmark": {
      const parsed = asCostBenchmarkPayload(payload);
      return parsed ? <CostBenchmarkExhibit benchmark={parsed} /> : null;
    }
    case "ledger.efficiency_scan": {
      const parsed = asEfficiencyScanPayload(payload);
      return parsed ? <EfficiencyScanExhibit scan={parsed} /> : null;
    }
    default:
      return null;
  }
}
