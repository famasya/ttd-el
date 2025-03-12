"use client";

import { Button } from '@/components/ui/button';
import { jsPDF } from 'jspdf';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
import React, { useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import SignatureCanvas from 'react-signature-canvas';

export default function PDFSignatureComponent() {
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const sigCanvases = useRef<{ [page: number]: SignatureCanvas | null }>({}); // Refs for each page's canvas
  const [signatures, setSignatures] = useState<{
    [page: number]: { data: string; x: number; y: number; width: number; height: number };
  }>({}); // Store signature data with position and size

  // Handle PDF file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(URL.createObjectURL(file));
    }
  };

  // When PDF is loaded successfully
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Clear signature for a specific page
  const clearSignature = (page: number) => {
    if (sigCanvases.current[page]) {
      sigCanvases.current[page]?.clear();
      setSignatures((prev) => {
        const newSignatures = { ...prev };
        delete newSignatures[page];
        return newSignatures;
      });
    }
  };

  // Save signature for a specific page with position
  const saveSignature = (page: number) => {
    const sigCanvas = sigCanvases.current[page];
    if (!sigCanvas) return;

    const trimmedCanvas = sigCanvas.getTrimmedCanvas();
    const sigData = trimmedCanvas.toDataURL('image/png');

    // Get the trimmed canvas dimensions and position relative to the full canvas
    const fullCanvas = sigCanvas.getCanvas();
    const context = fullCanvas.getContext('2d');
    const imageData = context?.getImageData(0, 0, fullCanvas.width, fullCanvas.height);
    if (!imageData) return;

    // Find the bounding box of the signature (non-transparent area)
    let minX = fullCanvas.width, minY = fullCanvas.height, maxX = 0, maxY = 0;
    for (let y = 0; y < fullCanvas.height; y++) {
      for (let x = 0; x < fullCanvas.width; x++) {
        const alpha = imageData.data[(y * fullCanvas.width + x) * 4 + 3];
        if (alpha > 0) { // Non-transparent pixel
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const sigWidth = maxX - minX + 1;
    const sigHeight = maxY - minY + 1;

    setSignatures((prev) => ({
      ...prev,
      [page]: { data: sigData, x: minX, y: minY, width: sigWidth, height: sigHeight },
    }));
  };

  // Save the entire PDF with signatures
  const savePDF = () => {
    if (!pdfFile || !numPages) return;

    const pdf = new jsPDF();
    const pageCanvases = document.querySelectorAll('.react-pdf__Page__canvas');

    pageCanvases.forEach((canvas, index) => {
      const pageNumber = index + 1;
      const pdfImg = (canvas as HTMLCanvasElement).toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = (canvas as HTMLCanvasElement).width;
      const canvasHeight = (canvas as HTMLCanvasElement).height;

      if (index > 0) pdf.addPage();
      pdf.addImage(pdfImg, 'PNG', 0, 0, pdfWidth, pdfHeight);

      if (signatures[pageNumber]) {
        const { data, x, y, width, height } = signatures[pageNumber];
        // Scale the position and size from canvas coordinates to PDF coordinates
        const scaleX = pdfWidth / canvasWidth * 2;
        const scaleY = pdfHeight / canvasHeight * 2;
        pdf.addImage(data, 'PNG', x * scaleX, y * scaleY, width * scaleX, height * scaleY);
      }
    });

    pdf.save('signed-document.pdf');
  };

  // Render all pages with signature canvases
  const renderPages = () => {
    if (!numPages) return null;
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(
        <div key={i} className="mb-4 relative" style={{ width: 'fit-content' }}>
          <h3>Page {i}</h3>
          <div className="relative">
            <Page
              pageNumber={i}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onRenderSuccess={(page) => {
                const width = page.width;
                const height = page.height;
                if (sigCanvases.current[i]) {
                  const canvas = sigCanvases.current[i]!.getCanvas();
                  canvas.width = width;
                  canvas.height = height;
                }
              }}
            />
            <SignatureCanvas
              ref={(el) => {
                sigCanvases.current[i] = el;
              }}
              penColor="black"
              canvasProps={{
                className: 'absolute top-0 left-0 pointer-events-auto',
                style: { background: 'transparent', zIndex: 10 },
              }}
            />
          </div>
          <div className="mt-2 space-x-2">
            <Button onClick={() => clearSignature(i)}>Clear</Button>
            <Button onClick={() => saveSignature(i)}>Save Signature</Button>
          </div>
        </div>
      );
    }
    return pages;
  };

  return (
    <div>
      {/* File Input */}
      <input type="file" accept=".pdf" onChange={handleFileChange} />

      {/* PDF Rendering */}
      {pdfFile && (
        <div>
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={console.error}
          >
            {renderPages()}
          </Document>
          <Button onClick={savePDF} className="mt-4">
            Save PDF
          </Button>
        </div>
      )}
    </div>
  );
}
