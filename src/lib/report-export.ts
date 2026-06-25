// Lazy-load html2pdf.js only when a user actually exports a PDF.
// This keeps the 775KB library out of the initial bundle.
let html2pdfModule: Promise<typeof import('html2pdf.js')> | null = null;

const getHtml2pdf = (): Promise<typeof import('html2pdf.js')> => {
  if (!html2pdfModule) {
    html2pdfModule = import('html2pdf.js');
  }
  return html2pdfModule;
};

export const copyHtmlToClipboard = async (html: string): Promise<void> => {
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });
    await navigator.clipboard.write([clipboardItem]);
  } catch (error) {
    // Fallback for browsers that don't support ClipboardItem
    const textArea = document.createElement('textarea');
    textArea.value = html;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
};

export const exportReportToPdf = async (html: string, filename: string): Promise<void> => {
  const { default: html2pdf } = await getHtml2pdf();
  const element = document.createElement('div');
  element.innerHTML = html;
  
  html2pdf()
    .set({
      margin: 1,
      filename: filename,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    })
    .from(element)
    .save();
};
