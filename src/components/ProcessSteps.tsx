import { Search, Edit, Repeat } from "lucide-react";
import { ArrowRight } from "lucide-react";

export const ProcessSteps = () => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 mb-6 md:mb-8 px-4">
      <ProcessStep 
        icon={<Search className="w-6 h-6" />}
        label="AI Research"
        sublabel="60 seconds"
      />
      <ArrowRight className="hidden md:block w-6 h-6 text-muted-foreground self-start mt-4" />
      <div className="block md:hidden w-0.5 h-8 bg-border" />
      
      <ProcessStep 
        icon={<Edit className="w-6 h-6" />}
        label="You Refine"
        sublabel="5-10 minutes"
      />
      <ArrowRight className="hidden md:block w-6 h-6 text-muted-foreground self-start mt-4" />
      <div className="block md:hidden w-0.5 h-8 bg-border" />
      
      <ProcessStep 
        icon={<Repeat className="w-6 h-6" />}
        label="Reuse Forever"
        sublabel="Apply frameworks"
      />
    </div>
  );
};

interface ProcessStepProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
}

const ProcessStep = ({ icon, label, sublabel }: ProcessStepProps) => {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <div className="font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
};
