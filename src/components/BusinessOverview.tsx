import { Globe, Briefcase, Edit2, Save, X, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface KeyExecutive {
  name: string;
  role: string;
}

interface BusinessOverviewProps {
  data: {
    name: string;
    industry: string;
    description: string;
    productsServices: string[];
    keyExecutives: KeyExecutive[];
    website: string;
  };
  onUpdate?: (data: BusinessOverviewProps['data']) => void;
}

export const BusinessOverview = ({ data, onUpdate }: BusinessOverviewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(data);
  const handleSave = () => {
    if (onUpdate) {
      onUpdate(editedData);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedData(data);
    setIsEditing(false);
  };

  const addProductService = () => {
    setEditedData({
      ...editedData,
      productsServices: [...editedData.productsServices, ""]
    });
  };

  const removeProductService = (index: number) => {
    setEditedData({
      ...editedData,
      productsServices: editedData.productsServices.filter((_, i) => i !== index)
    });
  };

  const updateProductService = (index: number, value: string) => {
    const updated = [...editedData.productsServices];
    updated[index] = value;
    setEditedData({ ...editedData, productsServices: updated });
  };

  const addExecutive = () => {
    setEditedData({
      ...editedData,
      keyExecutives: [...editedData.keyExecutives, { name: "", role: "" }]
    });
  };

  const removeExecutive = (index: number) => {
    setEditedData({
      ...editedData,
      keyExecutives: editedData.keyExecutives.filter((_, i) => i !== index)
    });
  };

  const updateExecutive = (index: number, field: 'name' | 'role', value: string) => {
    const updated = [...editedData.keyExecutives];
    updated[index][field] = value;
    setEditedData({ ...editedData, keyExecutives: updated });
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <span className="label-tech text-muted-foreground">Business Overview</span>
            {isEditing ? (
              <Input
                value={editedData.name}
                onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                className="text-4xl font-semibold tracking-tight leading-tight h-auto py-2 bg-white/[0.05] border-white/[0.12]"
              />
            ) : (
              <h2 className="text-4xl font-semibold tracking-tight leading-tight">{data.name}</h2>
            )}
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button onClick={handleSave} size="sm" className="bg-primary text-primary-foreground">
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button onClick={handleCancel} size="sm" variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="card-mono">
          <div className="space-y-8">
            {/* Description */}
            <div>
              {isEditing ? (
                <Textarea
                  value={editedData.description}
                  onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                  className="text-lg leading-relaxed bg-white/[0.05] border-white/[0.12] min-h-[100px]"
                  placeholder="Company description..."
                />
              ) : (
                <p className="text-foreground/80 text-lg leading-relaxed">{data.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Key Facts */}
              <div className="space-y-4">
                <h3 className="label-tech text-muted-foreground">Key Facts</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Industry</div>
                      {isEditing ? (
                        <Input
                          value={editedData.industry}
                          onChange={(e) => setEditedData({ ...editedData, industry: e.target.value })}
                          className="mt-1 bg-white/[0.05] border-white/[0.12] h-8"
                        />
                      ) : (
                        <div className="text-foreground font-medium">{data.industry}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Website</div>
                      {isEditing ? (
                        <Input
                          value={editedData.website}
                          onChange={(e) => setEditedData({ ...editedData, website: e.target.value })}
                          className="mt-1 bg-white/[0.05] border-white/[0.12] h-8"
                          placeholder="https://..."
                        />
                      ) : (
                        <a 
                          href={data.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium"
                        >
                          {data.website}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Executives */}
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="label-tech text-muted-foreground">Key Leadership</h3>
                    {isEditing && (
                      <Button onClick={addExecutive} size="sm" variant="ghost" className="h-6 text-xs">
                        + Add
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(isEditing ? editedData.keyExecutives : data.keyExecutives).map((exec, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <User className="h-4 w-4 text-primary mt-1" />
                        <div className="flex-1">
                          {isEditing ? (
                            <div className="space-y-1">
                              <div className="flex gap-2">
                                <Input
                                  value={exec.name}
                                  onChange={(e) => updateExecutive(index, 'name', e.target.value)}
                                  className="flex-1 bg-white/[0.05] border-white/[0.12] h-7 text-sm"
                                  placeholder="Name"
                                />
                                <Button 
                                  onClick={() => removeExecutive(index)} 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-7 w-7 p-0"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                              <Input
                                value={exec.role}
                                onChange={(e) => updateExecutive(index, 'role', e.target.value)}
                                className="bg-white/[0.05] border-white/[0.12] h-7 text-sm"
                                placeholder="Role"
                              />
                            </div>
                          ) : (
                            <div>
                              <div className="text-foreground font-medium text-sm">{exec.name}</div>
                              <div className="text-xs text-muted-foreground">{exec.role}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {!isEditing && data.keyExecutives.length === 0 && (
                      <p className="text-sm text-muted-foreground">No executives listed</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Products & Services */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="label-tech text-muted-foreground">Products & Services</h3>
                  {isEditing && (
                    <Button onClick={addProductService} size="sm" variant="ghost" className="h-6 text-xs">
                      + Add
                    </Button>
                  )}
                </div>
                <ul className="space-y-2">
                  {(isEditing ? editedData.productsServices : data.productsServices).map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 bg-primary rounded-full mt-2" />
                      {isEditing ? (
                        <div className="flex-1 flex gap-2">
                          <Input
                            value={item}
                            onChange={(e) => updateProductService(index, e.target.value)}
                            className="flex-1 bg-white/[0.05] border-white/[0.12] h-8 text-sm"
                            placeholder="Product or service..."
                          />
                          <Button 
                            onClick={() => removeProductService(index)} 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-foreground/80">{item}</span>
                      )}
                    </li>
                  ))}
                  {!isEditing && data.productsServices.length === 0 && (
                    <p className="text-sm text-muted-foreground">No products or services listed</p>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
