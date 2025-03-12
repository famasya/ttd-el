"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { jsPDF } from "jspdf";
import { Download, Eraser, Info, Save } from "lucide-react";
import Link from "next/link";
import "pdfjs-dist/build/pdf.worker.min.mjs";
import React, { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";

export default function PDFSignatureComponent() {
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const sigCanvases = useRef<{ [page: number]: SignatureCanvas | null }>({}); // Refs for each page's canvas
  const [signatures, setSignatures] = useState<{
    [page: number]: { data: string; x: number; y: number; width: number; height: number };
  }>({}); // Store signature data with position and size
  const pageRefs = useRef<{ [page: number]: HTMLDivElement | null }>({}); // Refs for page containers

  // Handle PDF file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
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

    let trimmedCanvas;
    try {
      trimmedCanvas = sigCanvas.getTrimmedCanvas();
    } catch (error) {
      console.error("Error with getTrimmedCanvas:", error);
      trimmedCanvas = sigCanvas.getCanvas(); // Fallback to full canvas
    }
    const sigData = trimmedCanvas.toDataURL("image/png");

    const fullCanvas = sigCanvas.getCanvas();
    const context = fullCanvas.getContext("2d", { willReadFrequently: true });
    const imageData = context?.getImageData(0, 0, fullCanvas.width, fullCanvas.height);
    if (!imageData) return;

    let minX = fullCanvas.width, minY = fullCanvas.height, maxX = 0, maxY = 0;
    for (let y = 0; y < fullCanvas.height; y++) {
      for (let x = 0; x < fullCanvas.width; x++) {
        const alpha = imageData.data[(y * fullCanvas.width + x) * 4 + 3];
        if (alpha > 0) {
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
    const pageCanvases = document.querySelectorAll(".react-pdf__Page__canvas");

    pageCanvases.forEach((canvas, index) => {
      const pageNumber = index + 1;
      const pdfImg = (canvas as HTMLCanvasElement).toDataURL("image/png");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = (canvas as HTMLCanvasElement).width;
      const canvasHeight = (canvas as HTMLCanvasElement).height;

      if (index > 0) pdf.addPage();
      pdf.addImage(pdfImg, "PNG", 0, 0, pdfWidth, pdfHeight);

      if (signatures[pageNumber]) {
        const { data, x, y, width, height } = signatures[pageNumber];
        const scaleX = (pdfWidth / canvasWidth) * window.devicePixelRatio;
        const scaleY = (pdfHeight / canvasHeight) * window.devicePixelRatio;
        pdf.addImage(data, "PNG", x * scaleX, y * scaleY, width * scaleX, height * scaleY);
      }
    });

    pdf.save("signed-document.pdf");
  };

  // Resize canvases on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!numPages) return;
      for (let i = 1; i <= numPages; i++) {
        const pageContainer = pageRefs.current[i];
        const sigCanvas = sigCanvases.current[i];
        if (pageContainer && sigCanvas) {
          const width = pageContainer.clientWidth;
          const canvas = sigCanvas.getCanvas();
          const aspectRatio = canvas.height / canvas.width;
          canvas.width = width;
          canvas.height = width * aspectRatio;
        }
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial resize
    return () => window.removeEventListener("resize", handleResize);
  }, [numPages]);

  // Render all pages with signature canvases
  const renderPages = () => {
    if (!numPages) return null;
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(
        <div
          key={i}
          ref={(el) => {
            pageRefs.current[i] = el
          }}
          className="mb-2 relative mt-4 border-[1px] border-gray-300 rounded shadow-sm mx-auto max-w-full w-full"
        >
          <h3 className="text-lg font-bold mb-2 mx-4 mt-2">Page {i}</h3>
          <div className="relative overflow-hidden">
            <Page
              pageNumber={i}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              width={Math.min(800, window.innerWidth - 40)} // Cap width and account for padding
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
                className: "absolute top-0 left-0 pointer-events-auto",
                style: { background: "transparent", zIndex: 10 },
              }}
            />
          </div>
          <div className="mb-4 mx-4 space-x-2 flex justify-end">
            <Button onClick={() => clearSignature(i)}>
              <Eraser className="mr-2 h-4 w-4" /> Clear
            </Button>
            <Button onClick={() => {
              saveSignature(i)
              toast.success("Signature saved successfully!")
            }}>
              <Save className="mr-2 h-4 w-4" /> Save Signature
            </Button>
          </div>
        </div>
      );
    }
    return pages;
  };

  return (
    <div className="py-8 max-w-full px-4 sm:px-8 mx-auto min-h-screen">
      {/* File Input */}
      <div className="max-w-xl">
        <div className="flex flex-row gap-2 items-center justify-between">
          <h1 className="text-2xl font-bold">TTD ELEKTRONIK</h1>
          <Link href="https://github.com/famasya/ttd-el" target="_blank">
            <span className="font-mono font-medium text-sm underline">Source Code</span>
          </Link>
        </div>
        <div className="mb-4 bg-gray-300 text-gray-800 px-4 py-1 rounded flex items-center gap-2">
          <Info className="h-4 w-4" /> File tidak disimpan di server
        </div>
        <Input type="file" accept=".pdf" onChange={handleFileChange} />
      </div>

      {/* PDF Rendering */}
      {pdfFile ? (
        <div className="mb-16">
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={console.error}
          >
            {renderPages()}
          </Document>
          <Button onClick={savePDF} className="mt-4">
            <Download className="mr-2 h-4 w-4" />
            Save PDF
          </Button>
        </div>
      ) : <div className="mt-8">
        <strong>Petunjuk:</strong>
        <ol className="list-decimal ml-4 space-y-2">
          <li>Upload PDF file</li>
          <li>Beri tanda tangan</li>
          <li>Klik <span className="font-mono font-medium text-sm bg-gray-800 text-white px-1 py-0.5 rounded">Save Signature</span> untuk menyimpan tanda tangan</li>
          <li>Klik <span className="font-mono font-medium text-sm bg-gray-800 text-white px-1 py-0.5 rounded">Save PDF</span> untuk menyimpan file</li>
        </ol>
      </div>}
    </div>
  );
}
