import { Building2, MapPin, Users, DollarSign, Calendar } from "lucide-react";

interface BusinessOverviewProps {
  data: {
    name: string;
    description: string;
    productsServices: string[];
    founded: string;
    headquarters: string;
    employees: string;
    revenue: string;
  };
}

export const BusinessOverview = ({ data }: BusinessOverviewProps) => {
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="space-y-4">
        <div className="space-y-1">
          <span className="label-tech text-muted-foreground">Business Overview</span>
          <h2 className="text-4xl font-semibold tracking-tight leading-tight">{data.name}</h2>
        </div>

        <div className="card-mono">
          <div className="space-y-8">
            <div>
              <p className="text-foreground/80 text-lg leading-relaxed">{data.description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="label-tech text-muted-foreground">Key Facts</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Founded</div>
                      <div className="text-foreground font-medium">{data.founded}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Headquarters</div>
                      <div className="text-foreground font-medium">{data.headquarters}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Employees</div>
                      <div className="text-foreground font-medium">{data.employees}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <DollarSign className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Revenue</div>
                      <div className="text-foreground font-medium">{data.revenue}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="label-tech text-muted-foreground">Products & Services</h3>
                <ul className="space-y-2">
                  {data.productsServices.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 bg-primary rounded-full mt-2" />
                      <span className="text-foreground/80">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
