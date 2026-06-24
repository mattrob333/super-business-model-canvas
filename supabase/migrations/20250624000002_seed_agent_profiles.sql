-- Seed: 10 Default Agent Profiles (orchestrator + 9 BMC section agents)
-- These are account_id = NULL (global/system) profiles that all accounts can use.
-- Phase 2: Context Store Schema

INSERT INTO public.agent_profiles (account_id, agent_key, display_name, agent_type, description, assigned_sections, model_route_key, status, system_instructions_summary) VALUES
  (
    NULL,
    'orchestrator',
    'Strategy Orchestrator',
    'orchestrator',
    'Coordinates multi-agent runs, cascades BMC section agents, aggregates results, and manages the gap register.',
    ARRAY['all']::text[],
    'default',
    'active',
    'You are the Strategy Orchestrator. You coordinate section agents, aggregate their outputs into a coherent business model canvas, identify gaps, and prioritize next actions.'
  ),
  (
    NULL,
    'agent_customer_segments',
    'Customer Segments Agent',
    'section_agent',
    'Analyzes and enriches the Customer Segments block of the Business Model Canvas. Identifies distinct segments, personas, and jobs-to-be-done.',
    ARRAY['customer_segments']::text[],
    'default',
    'active',
    'You are the Customer Segments agent. You identify distinct customer segments, personas, jobs-to-be-done, and segment economics.'
  ),
  (
    NULL,
    'agent_value_propositions',
    'Value Propositions Agent',
    'section_agent',
    'Analyzes and enriches the Value Propositions block. Maps pains, gains, and pain relievers / gain creators to customer segments.',
    ARRAY['value_propositions']::text[],
    'default',
    'active',
    'You are the Value Propositions agent. You map value propositions to customer pains and gains, using evidence to validate claims.'
  ),
  (
    NULL,
    'agent_channels',
    'Channels Agent',
    'section_agent',
    'Analyzes and enriches the Channels block. Maps distribution, communication, and sales channels to customer segments.',
    ARRAY['channels']::text[],
    'default',
    'active',
    'You are the Channels agent. You identify and evaluate distribution, communication, and sales channels.'
  ),
  (
    NULL,
    'agent_customer_relationships',
    'Customer Relationships Agent',
    'section_agent',
    'Analyzes and enriches the Customer Relationships block. Maps acquisition, retention, and upsell strategies per segment.',
    ARRAY['customer_relationships']::text[],
    'default',
    'active',
    'You are the Customer Relationships agent. You identify acquisition, retention, and upsell strategies for each customer segment.'
  ),
  (
    NULL,
    'agent_revenue_streams',
    'Revenue Streams Agent',
    'section_agent',
    'Analyzes and enriches the Revenue Streams block. Identifies pricing models, recurring vs one-time revenue, and unit economics.',
    ARRAY['revenue_streams']::text[],
    'default',
    'active',
    'You are the Revenue Streams agent. You identify pricing models, revenue types, and unit economics with evidence-backed claims.'
  ),
  (
    NULL,
    'agent_key_resources',
    'Key Resources Agent',
    'section_agent',
    'Analyzes and enriches the Key Resources block. Identifies physical, intellectual, human, and financial resources.',
    ARRAY['key_resources']::text[],
    'default',
    'active',
    'You are the Key Resources agent. You identify physical, intellectual, human, and financial resources critical to the business model.'
  ),
  (
    NULL,
    'agent_key_activities',
    'Key Activities Agent',
    'section_agent',
    'Analyzes and enriches the Key Activities block. Maps production, problem-solving, and platform/network activities.',
    ARRAY['key_activities']::text[],
    'default',
    'active',
    'You are the Key Activities agent. You identify production, problem-solving, and platform/network activities that drive the business model.'
  ),
  (
    NULL,
    'agent_key_partnerships',
    'Key Partnerships Agent',
    'section_agent',
    'Analyzes and enriches the Key Partnerships block. Maps strategic alliances, joint ventures, supplier relationships, and coopetition.',
    ARRAY['key_partnerships']::text[],
    'default',
    'active',
    'You are the Key Partnerships agent. You identify strategic alliances, joint ventures, supplier relationships, and coopetition dynamics.'
  ),
  (
    NULL,
    'agent_cost_structure',
    'Cost Structure Agent',
    'section_agent',
    'Analyzes and enriches the Cost Structure block. Identifies fixed vs variable costs, economies of scale/scope, and cost drivers.',
    ARRAY['cost_structure']::text[],
    'default',
    'active',
    'You are the Cost Structure agent. You identify fixed and variable costs, economies of scale and scope, and key cost drivers.'
  )
ON CONFLICT DO NOTHING;
