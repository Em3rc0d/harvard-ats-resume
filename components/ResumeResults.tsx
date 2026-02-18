'use client';

import { useRef } from 'react';
import jsPDF from 'jspdf';
import { useLanguage } from '@/components/LanguageProvider';
import { Download, Printer, RefreshCw } from 'lucide-react';

interface ResumeResultsProps {
  formattedResume: string;
  atsScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  userName: string;
  onStartOver: () => void;
}

export default function ResumeResults({
  formattedResume,
  atsScore,
  matchedKeywords,
  missingKeywords,
  suggestions,
  userName,
  onStartOver,
}: ResumeResultsProps) {
  const { t } = useLanguage();
  const resumeRef = useRef<HTMLDivElement>(null);

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
      const lines = formattedResume.split('\n');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 25.4; // 1 inch
      const lineHeight = 5;
      let y = margin;

      pdf.setFont('helvetica');

      lines.forEach((line) => {
        if (y > pdf.internal.pageSize.getHeight() - margin) {
          pdf.addPage();
          y = margin;
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
      const fileName = `${userName}, CV- ${currentYear}.pdf`;
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
        <button onClick={downloadPDF} className="px-6 py-2.5 bg-gray-900 text-white rounded-sm hover:bg-gray-800 font-medium text-sm transition-colors shadow-sm flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>{t.results.downloadPDF}</span>
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
          <div className="bg-white rounded-sm shadow-sm border border-gray-200">
            <div
              ref={resumeRef}
              className="p-16 font-serif bg-white"
              style={{
                minHeight: '11in',
                fontFamily: 'Georgia, Times New Roman, serif',
                fontSize: '11pt',
                lineHeight: '1.4',
                color: '#000'
              }}
            >
              <div className="whitespace-pre-wrap">{formattedResume}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          .no-print {
            display: none !important;
          }

          @page {
            size: A4;
            margin: 1in;
          }
        }
      `}</style>
    </div>
  );
}
