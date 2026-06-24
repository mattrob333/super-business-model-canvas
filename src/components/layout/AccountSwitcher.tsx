import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccountSwitcher() {
  return (
    <Button variant="ghost" className="w-full justify-start gap-2 px-2 h-10">
      <Building2 className="h-4 w-4 shrink-0" />
      <span className="truncate text-sm">Default Workspace</span>
      <ChevronDown className="h-3 w-3 ml-auto shrink-0 opacity-50" />
    </Button>
  );
}
