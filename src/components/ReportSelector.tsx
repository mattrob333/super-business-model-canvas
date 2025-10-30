import { useState, useEffect } from "react";
import { FileText, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";

interface Report {
  id: string;
  framework_id: string;
  created_at: string;
  frameworks: {
    title: string;
    shortcut: string;
    category: string;
  };
}

interface ReportSelectorProps {
  availableReports: Report[];
  selectedReports: string[];
  onReportsChange: (reportIds: string[]) => void;
}

export const ReportSelector = ({
  availableReports,
  selectedReports,
  onReportsChange,
}: ReportSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleReport = (reportId: string, checked: boolean) => {
    if (checked) {
      onReportsChange([...selectedReports, reportId]);
    } else {
      onReportsChange(selectedReports.filter(id => id !== reportId));
    }
  };

  const selectAll = () => {
    onReportsChange(availableReports.map(r => r.id));
  };

  const clearAll = () => {
    onReportsChange([]);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          <span className="text-xs">
            Reports ({selectedReports.length})
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end">
        <div className="p-3 border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Framework Reports</h4>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={selectAll}
                className="h-7 px-2 text-xs"
              >
                All
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAll}
                className="h-7 px-2 text-xs"
              >
                Clear
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Select reports to include in chat context
          </p>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {availableReports.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No completed reports yet</p>
              <p className="text-xs mt-1">Run a framework to generate reports</p>
            </div>
          ) : (
            <div className="space-y-1">
              {availableReports.map((report) => {
                const isSelected = selectedReports.includes(report.id);
                return (
                  <div
                    key={report.id}
                    className={`flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer ${
                      isSelected ? 'bg-accent/50' : ''
                    }`}
                    onClick={() => toggleReport(report.id, !isSelected)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleReport(report.id, checked as boolean)}
                      className="mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-medium text-sm leading-tight">
                          {report.frameworks.title}
                        </p>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {report.frameworks.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedReports.length > 0 && (
          <div className="p-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {selectedReports.length} report{selectedReports.length > 1 ? 's' : ''} will be included in AI context
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
