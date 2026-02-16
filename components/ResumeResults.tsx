'use client';

import { useRef } from 'react';
import jsPDF from 'jspdf';

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
  const resumeRef = useRef<HTMLDivElement>(null);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Needs Improvement';
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
      <div className="no-print flex gap-4 justify-center flex-wrap">
        <button onClick={downloadPDF} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          📄 Download PDF
        </button>
        <button onClick={printResume} className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium">
          🖨️ Print Resume
        </button>
        <button onClick={onStartOver} className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
          🔄 Create New Resume
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: ATS Analytics */}
        <div className="lg:col-span-1 space-y-6 no-print">
          {/* ATS Score Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">ATS Score</h3>
            <div className="text-center">
              <div className={`text-6xl font-bold ${getScoreColor(atsScore)} mb-2`}>
                {atsScore}%
              </div>
              <div className={`text-lg font-semibold ${getScoreColor(atsScore)}`}>
                {getScoreLabel(atsScore)}
              </div>
            </div>
            <div className="mt-4 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full ${atsScore >= 85 ? 'bg-green-600' : atsScore >= 70 ? 'bg-yellow-600' : 'bg-red-600'
                  }`}
                style={{ width: `${atsScore}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-3 text-center">
              Based on keyword matching with job description
            </p>
          </div>

          {/* Matched Keywords */}
          {matchedKeywords.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                ✅ Matched Keywords ({matchedKeywords.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {matchedKeywords.slice(0, 15).map((keyword, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              {matchedKeywords.length > 15 && (
                <p className="text-sm text-gray-500 mt-2">
                  +{matchedKeywords.length - 15} more keywords matched
                </p>
              )}
            </div>
          )}

          {/* Missing Keywords */}
          {missingKeywords.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                ⚠️ Missing Keywords ({missingKeywords.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {missingKeywords.slice(0, 15).map((keyword, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              {missingKeywords.length > 15 && (
                <p className="text-sm text-gray-500 mt-2">
                  +{missingKeywords.length - 15} more keywords missing
                </p>
              )}
              <p className="text-sm text-gray-600 mt-3">
                Consider adding these if they're relevant to your experience
              </p>
            </div>
          )}

          {/* Improvement Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                💡 Improvement Suggestions
              </h3>
              <ul className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-blue-600 font-bold">{index + 1}.</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Resume Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-2xl border-2 border-gray-200">
            <div
              ref={resumeRef}
              className="p-12 font-serif"
              style={{
                minHeight: '11in',
                fontFamily: 'Georgia, Times New Roman, serif',
                fontSize: '11pt',
                lineHeight: '1.5',
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
