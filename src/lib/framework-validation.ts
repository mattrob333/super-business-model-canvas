import { FrameworkImportExport, FrameworkImportResult } from "@/types/framework-schema";

const VALID_AI_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano'
];

const VALID_CATEGORIES = [
  'Strategic Planning',
  'Market Analysis',
  'Financial Analysis',
  'Operational Excellence',
  'Innovation',
  'Risk Management'
];

export function validateFramework(
  framework: Partial<FrameworkImportExport>,
  existingShortcuts: string[] = []
): FrameworkImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!framework.title || framework.title.trim() === '') {
    errors.push('Title is required');
  }
  
  if (!framework.shortcut || framework.shortcut.trim() === '') {
    errors.push('Shortcut is required');
  } else if (existingShortcuts.includes(framework.shortcut.toLowerCase())) {
    errors.push(`Shortcut "${framework.shortcut}" already exists`);
  }
  
  if (!framework.description || framework.description.trim() === '') {
    errors.push('Description is required');
  }
  
  if (!framework.category || framework.category.trim() === '') {
    errors.push('Category is required');
  }
  
  if (!framework.analysis_prompt || framework.analysis_prompt.trim() === '') {
    errors.push('Analysis prompt is required');
  }
  
  if (!framework.output_template || framework.output_template.trim() === '') {
    errors.push('Output template is required');
  }

  // Validation warnings
  if (framework.ai_model && !VALID_AI_MODELS.includes(framework.ai_model)) {
    warnings.push(`AI model "${framework.ai_model}" is not in the recommended list. Valid models: ${VALID_AI_MODELS.join(', ')}`);
  }

  if (framework.category && !VALID_CATEGORIES.includes(framework.category)) {
    warnings.push(`Category "${framework.category}" is not standard. Consider using: ${VALID_CATEGORIES.join(', ')}`);
  }

  // HTML validation (basic)
  if (framework.output_template) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(framework.output_template, 'text/html');
      const parseErrors = doc.querySelector('parsererror');
      if (parseErrors) {
        errors.push('Output template contains invalid HTML');
      }
    } catch (e) {
      errors.push('Failed to parse output template HTML');
    }
  }

  // CSS validation (basic)
  if (framework.custom_css) {
    if (framework.custom_css.includes('<script') || framework.custom_css.includes('javascript:')) {
      errors.push('Custom CSS contains potentially unsafe content');
    }
  }

  // Numeric validations
  if (framework.max_tokens !== undefined && framework.max_tokens < 100) {
    warnings.push('Max tokens is very low (< 100)');
  }

  if (framework.temperature !== undefined && (framework.temperature < 0 || framework.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }

  if (framework.estimated_time !== undefined && framework.estimated_time < 1) {
    warnings.push('Estimated time should be at least 1 minute');
  }

  return {
    success: errors.length === 0,
    framework: errors.length === 0 ? (framework as FrameworkImportExport) : undefined,
    errors,
    warnings
  };
}

export function validateBulkImport(
  frameworks: Partial<FrameworkImportExport>[],
  existingShortcuts: string[] = []
): FrameworkImportResult[] {
  const allShortcuts = [...existingShortcuts];
  
  return frameworks.map((framework, index) => {
    const result = validateFramework(framework, allShortcuts);
    
    // Add shortcut to list for duplicate detection in subsequent frameworks
    if (result.success && framework.shortcut) {
      allShortcuts.push(framework.shortcut.toLowerCase());
    }
    
    return {
      ...result,
      errors: result.errors.map(err => `Framework ${index + 1}: ${err}`),
      warnings: result.warnings.map(warn => `Framework ${index + 1}: ${warn}`)
    };
  });
}
