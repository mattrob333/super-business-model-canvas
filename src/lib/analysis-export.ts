import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const exportAnalysisPackage = async (
  companyName: string,
  businessContext: any,
  reports: Array<{ title: string; content: string; framework: string }>
) => {
  const zip = new JSZip();
  
  // Add business context JSON
  const contextFilename = `${companyName.replace(/[^a-z0-9]/gi, '-')}-business-context.json`;
  zip.file(contextFilename, JSON.stringify(businessContext, null, 2));
  
  // Add each report as HTML
  reports.forEach((report, index) => {
    const safeCompanyName = companyName.replace(/[^a-z0-9]/gi, '-');
    const safeFramework = report.framework.replace(/[^a-z0-9]/gi, '-');
    const filename = `${index + 1}-${safeFramework}-${safeCompanyName}.html`;
    zip.file(filename, report.content);
  });
  
  // Generate and download ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `${companyName.replace(/[^a-z0-9]/gi, '-')}-analysis-package.zip`;
  saveAs(blob, zipFilename);
};
