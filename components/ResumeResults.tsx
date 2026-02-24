'use client';

import { useRef, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { useLanguage } from '@/components/LanguageProvider';
import { Download, Printer, RefreshCw, Eye } from 'lucide-react';



interface ResumeResultsProps {
  formattedResume: string;
  improvedResume?: string; // New prop
  atsScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  userName: string;
  onStartOver: () => void;
}

export default function ResumeResults({
  formattedResume,
  improvedResume,
  atsScore,
  matchedKeywords,
  missingKeywords,
  suggestions,
  userName,
  onStartOver,
}: ResumeResultsProps) {
  const { t } = useLanguage();
  const resumeRef = useRef<HTMLDivElement>(null);
  const [showWatermarkPreview, setShowWatermarkPreview] = useState(false);


  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return t.results.excellent;
    if (score >= 70) return t.results.good;
    if (score >= 50) return t.results.fair;
    return t.results.needsImprovement;
  };

  const downloadPDF = () => {
    if (!resumeRef.current) return;

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Format resume text for PDF
      const baseContent = (showWatermarkPreview && improvedResume) ? improvedResume : formattedResume;

      const contentToPrint = showWatermarkPreview
        ? baseContent + "\n\n--- SUGGESTIONS ---\n" + suggestions.map(s => `• ${s}`).join("\n")
        : baseContent;

      const lines = contentToPrint.split('\n');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 25.4; // 1 inch
      const lineHeight = 5;
      let y = margin;

      pdf.setFont('helvetica');

      // Watermark Logic
      if (showWatermarkPreview) {
        pdf.setTextColor(200, 200, 200);
        pdf.setFontSize(50);
        pdf.text("CVEngine PREVIEW", pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
        pdf.setTextColor(0, 0, 0); // Reset color
      }

      pdf.setFontSize(10); // Reset size

      lines.forEach((line) => {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;

          // Add watermark to new pages too
          if (showWatermarkPreview) {
            pdf.setTextColor(200, 200, 200);
            pdf.setFontSize(50);
            pdf.text("CVEngine PREVIEW", pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(10);
          }
        }

        // Check if line is a header (all caps or starts with specific patterns)
        const isHeader = line === line.toUpperCase() && line.trim().length > 0;
        const isBullet = line.trim().startsWith('•');

        if (isHeader) {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
        } else if (isBullet) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
        } else {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
        }

        const splitText = pdf.splitTextToSize(line, pageWidth - 2 * margin);
        pdf.text(splitText, margin, y);
        y += lineHeight * splitText.length;
      });

      const currentYear = new Date().getFullYear();
      const fileName = `${userName}, CV- ${currentYear}${showWatermarkPreview ? '-PREVIEW' : ''}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const printResume = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Action Buttons */}
      <div className="no-print flex gap-4 justify-center flex-wrap pb-6 border-b border-gray-200">
        <button onClick={() => setShowWatermarkPreview(!showWatermarkPreview)} className={`px-6 py-2.5 border rounded-sm font-medium text-sm transition-colors flex items-center gap-2 ${showWatermarkPreview ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
          <Eye className="w-4 h-4" />
          <span>
            {showWatermarkPreview
              ? "Show Original"
              : (improvedResume ? "Preview Optimized Version" : "Preview with Suggestions")
            }
          </span>
        </button>
        <button onClick={downloadPDF} className="px-6 py-2.5 bg-gray-900 text-white rounded-sm hover:bg-gray-800 font-medium text-sm transition-colors shadow-sm flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>{t.results.downloadPDF} {showWatermarkPreview && "(Preview)"}</span>
        </button>
        <button onClick={printResume} className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium text-sm transition-colors flex items-center gap-2">
          <Printer className="w-4 h-4" />
          <span>{t.results.print}</span>
        </button>
        <button onClick={onStartOver} className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium text-sm transition-colors flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          <span>{t.results.createNew}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: ATS Analytics */}
        <div className="lg:col-span-1 space-y-6 no-print">
          {/* ATS Score Card */}
          <div className="bg-white rounded-md shadow-sm p-6 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">{t.results.atsCompatibility}</h3>
            <div className="text-center py-4">
              <div className="text-5xl font-serif font-bold text-gray-900 mb-2">
                {atsScore}%
              </div>
              <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                {getScoreLabel(atsScore)}
              </div>
            </div>
            <div className="mt-4 bg-gray-100 rounded-full h-1 overflow-hidden">
              <div
                className={`h-full ${atsScore >= 85 ? 'bg-gray-800' : atsScore >= 70 ? 'bg-gray-600' : 'bg-gray-400'}`}
                style={{ width: `${atsScore}%` }}
              />
            </div>
          </div>

          {/* Matched Keywords */}
          {matchedKeywords.length > 0 && (
            <div className="bg-white rounded-md shadow-sm p-6 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">
                {t.results.matchedKeywords}
              </h3>
              <div className="flex flex-wrap gap-2">
                {matchedKeywords.slice(0, 15).map((keyword, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-gray-100 text-gray-700 rounded-sm text-xs font-medium border border-gray-200"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingKeywords.length > 0 && (
            <div className="bg-white rounded-md shadow-sm p-6 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">
                {t.results.missingKeywords}
              </h3>
              <div className="flex flex-wrap gap-2">
                {missingKeywords.slice(0, 15).map((keyword, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-white text-gray-600 rounded-sm text-xs border border-gray-300 border-dashed"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="bg-white rounded-md shadow-sm p-6 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">
                {t.results.suggestions}
              </h3>
              <ul className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-gray-700 flex gap-3 items-start">
                    <span className="text-gray-400 font-medium text-xs mt-0.5">{index + 1}.</span>
                    <span className="leading-relaxed">{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Resume Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-sm shadow-sm border border-gray-200 relative overflow-hidden print-content">

            {/* Watermark Overlay */}
            {showWatermarkPreview && (
              <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
                <div className="transform -rotate-45 text-gray-100 text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-bold whitespace-nowrap select-none opacity-50">
                  {improvedResume ? "OPTIMIZED PREVIEW" : "CVEngine PREVIEW"}
                </div>
              </div>
            )}

            <div
              ref={resumeRef}
              className="p-6 md:p-12 lg:p-16 font-serif bg-white relative z-0"
              style={{
                minHeight: '11in',
                fontFamily: 'Georgia, Times New Roman, serif',
                fontSize: '11pt',
                lineHeight: '1.4',
                color: '#000'
              }}
            >
              <div className="whitespace-pre-wrap">
                {(showWatermarkPreview && improvedResume) ? improvedResume : formattedResume}
              </div>

              {showWatermarkPreview && (
                <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-300">
                  <h3 className="font-bold text-lg mb-4 text-gray-500 uppercase tracking-widest">AI Improvements & Suggestions</h3>
                  <ul className="space-y-2">
                    {suggestions.map((s, i) => (
                      <li key={i} className="text-gray-600 text-sm flex gap-2">
                        <span className="text-blue-500 font-bold">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }

          body {
            background: white;
          }

          /* Hide everything by default */
          body * {
            visibility: hidden;
            height: 0; /* Collapse height to avoid empty pages */
            overflow: hidden; 
          }

          /* Explicitly hide header and footer from page.tsx */
          header, footer {
            display: none !important;
          }
          
          /* Hide the sidebar/analytics column */
          .lg\\:col-span-1 {
            display: none !important;
          }

          /* Show the resume container and its children */
          .print-content,
          .print-content * {
            visibility: visible !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Ensure no-print elements inside print-content are still hidden */
          .print-content .no-print {
            display: none !important;
          }

          /* Position the resume container */
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* Ensure text colors print correctly */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
