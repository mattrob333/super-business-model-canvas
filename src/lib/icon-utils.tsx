import { 
  TrendingUp, 
  Lightbulb, 
  Link, 
  PieChart, 
  Globe, 
  BarChart, 
  Building, 
  Layout, 
  Target,
  FileText,
  Users,
  Zap,
  Shield,
  type LucideIcon
} from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
  'TrendingUp': TrendingUp,
  'Lightbulb': Lightbulb,
  'Link': Link,
  'PieChart': PieChart,
  'Globe': Globe,
  'BarChart': BarChart,
  'Building': Building,
  'Layout': Layout,
  'Target': Target,
  'FileText': FileText,
  'Users': Users,
  'Zap': Zap,
  'Shield': Shield,
};

export const getIconComponent = (iconName: string | null | undefined): LucideIcon => {
  if (!iconName) return FileText;
  return iconMap[iconName] || FileText;
};
