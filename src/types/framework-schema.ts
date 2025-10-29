export interface FrameworkImportExport {
  // Basic Info
  title: string;
  shortcut: string;
  description: string;
  category: string;
  tags?: string[];
  when_to_use?: string;
  icon?: string;
  
  // Strategic Context
  stages?: string[];
  departments?: string[];
  goal_alignment?: string[];
  
  // AI Configuration
  ai_model?: string;
  system_prompt?: string;
  analysis_prompt: string;
  response_schema?: object;
  
  // Output Configuration
  output_template: string;
  custom_css?: string;
  template_type?: string;
  layout_style?: string;
  
  // Settings
  estimated_time?: number;
  max_tokens?: number;
  temperature?: number;
  requires_business_context?: boolean;
  validate_json?: boolean;
  allow_manual_edit?: boolean;
  allow_pdf_export?: boolean;
  show_in_playbooks?: boolean;
  
  // Framework Dependencies
  upstream_frameworks?: string[];
  downstream_frameworks?: string[];
  required_upstream?: string[];
}

export interface FrameworkImportResult {
  success: boolean;
  framework?: FrameworkImportExport;
  errors: string[];
  warnings: string[];
}

export interface BulkFrameworkImport {
  frameworks: FrameworkImportExport[];
}
