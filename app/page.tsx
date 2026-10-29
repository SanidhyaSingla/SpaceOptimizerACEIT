'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

// Dynamically import TruckViewer with SSR disabled for Three.js
const TruckViewer = dynamic(() => import('@/components/ui/TruckViewer'), {
  ssr: false,
});

export default function Home() {
  const [truckDim, setTruckDim] = useState({ length: 400, width: 200, height: 200 });
  
  // Chat & Gemma States with professional messaging
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'Welcome. Please upload your cargo inventory sheet (Excel or CSV) and specify your operational requirements. Gemma 4 will compute the optimal container configuration and render the 3D spatial layout.' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFileContent, setUploadedFileContent] = useState<string | null>(null);

  // Placed items for 3D viewer
  const [placedItems, setPlacedItems] = useState([
    { id: '1', name: 'Box A', x: 20, y: 0, z: 20, dx: 100, dy: 80, dz: 60, color: '#3b82f6' },
    { id: '2', name: 'Box B', x: 130, y: 0, z: 20, dx: 80, dy: 80, dz: 60, color: '#10b981' },
    { id: '3', name: 'Box C', x: 20, y: 80, z: 20, dx: 100, dy: 60, dz: 60, color: '#f59e0b' },
  ]);
  const [stepIndex, setStepIndex] = useState(placedItems.length - 1);

  // Handle Excel / Text File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const jsonContent = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          const stringified = JSON.stringify(jsonContent, null, 2);

          setUploadedFileContent(stringified);
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: `[Uploaded Spreadsheet: ${file.name}]` },
            { role: 'assistant', content: `Spreadsheet "${file.name}" successfully parsed. Data buffered and ready for Gemma 4 analysis.` }
          ]);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: `[Uploaded Spreadsheet: ${file.name}]` },
            { role: 'assistant', content: 'Error parsing spreadsheet. Please verify file integrity and formatting.' }
          ]);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setUploadedFileContent(content);
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: `[Uploaded File: ${file.name}]` },
          { role: 'assistant', content: `File "${file.name}" received. Ready for processing.` }
        ]);
      };
      reader.readAsText(file);
    }
  };

  // Send message and file data to Gemma API endpoint
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() && !uploadedFileContent) return;

    const displayPrompt = inputMessage || "Analyze the uploaded dataset, determine appropriate container specifications, and calculate 3D coordinate placement for cargo items.";
    const userPayload = uploadedFileContent 
      ? `${displayPrompt}\n\nDataset:\n${uploadedFileContent}` 
      : inputMessage;

    const newMessages = [...messages, { role: 'user', content: displayPrompt }];
    setMessages(newMessages);
    setInputMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/gemma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPayload }),
      });
      const data = await res.json();

      if (data.recommendedTruck) {
        setTruckDim(data.recommendedTruck);
      }
      if (data.placedItems && Array.isArray(data.placedItems)) {
        setPlacedItems(data.placedItems);
        setStepIndex(data.placedItems.length - 1);
      }

      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', content: data.reply || data.output || 'Spatial configuration computed successfully.' }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', content: 'Error: Failed to establish communication with the inference server.' }
      ]);
    } finally {
      setLoading(false);
      setUploadedFileContent(null);
    }
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans text-base">
      {/* Top Bar */}
      <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg tracking-tight">TruckViewer &bull; Gemma 4 Enterprise Workspace</h1>
        </div>
        <div className="text-sm text-slate-400">
          Active Container: {truckDim.length} &times; {truckDim.width} &times; {truckDim.height} cm
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Left Side: Chat & File Input Panel (4 Cols) */}
        <div className="lg:col-span-4 border-r border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-4 border-b border-slate-800 font-semibold text-sm text-slate-300 flex justify-between items-center">
            <span>AI Processing Terminal</span>
            <label className="cursor-pointer text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition font-medium shadow-sm">
              Upload Dataset
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx,.xls,.csv,.json,.txt" />
            </label>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] rounded-lg p-3 text-sm leading-relaxed shadow-sm whitespace-pre-line ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-slate-400 animate-pulse px-1">Processing dataset through Gemma 4...</div>}
          </div>

          {/* Chat Input Form */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
            <input 
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={uploadedFileContent ? "Enter optimization directives..." : "Enter prompt or upload manifest..."}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium">Execute</Button>
          </form>
        </div>

        {/* Right Side: 3D Visualization Canvas (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col bg-slate-950 p-4 relative">
          <div className="flex-1 rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative">
            <TruckViewer truckDim={truckDim} items={placedItems} stepIndex={stepIndex} />
          </div>

          {/* Step Navigation Bar */}
          <div className="h-16 mt-3 bg-slate-900/60 border border-slate-800 rounded-xl px-6 flex items-center justify-between">
            <span className="text-sm text-slate-400">
              Loading Sequence: Step <strong className="text-slate-100">{stepIndex + 1}</strong> of {placedItems.length}
            </span>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium" 
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))} 
                disabled={stepIndex <= 0}
              >
                Previous
              </Button>
              <Button 
                size="sm" 
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium" 
                onClick={() => setStepIndex((prev) => Math.min(placedItems.length - 1, prev + 1))} 
                disabled={stepIndex >= placedItems.length - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}