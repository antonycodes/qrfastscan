import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { History, X, Copy, RefreshCw, Trash2, Camera, Download, ExternalLink } from 'lucide-react';

interface ScanHistoryItem {
  data: string;
  time: string;
  id: number;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isScanning, setIsScanning] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [resultText, setResultText] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const requestRef = useRef<number>(0);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('qr_history') || '[]');
    setScanHistory(history);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // @ts-ignore - focusMode is not in the standard TS definitions yet
          advanced: [{ focusMode: "continuous" }]
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        requestRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Lỗi truy cập Camera");
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && isScanning) {
      // Optimize: Scale down the image for much faster processing
      const MAX_WIDTH = 400;
      const scale = Math.min(MAX_WIDTH / video.videoWidth, 1);
      const width = Math.floor(video.videoWidth * scale);
      const height = Math.floor(video.videoHeight * scale);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });

        if (code) {
          handleQRCodeFound(code.data);
          return; // Stop ticking if found
        }
      }
    }
    
    if (isScanning) {
      requestRef.current = requestAnimationFrame(tick);
    }
  }, [isScanning]);

  useEffect(() => {
    if (isScanning) {
      requestRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isScanning, tick]);

  const handleQRCodeFound = (data: string) => {
    setIsScanning(false);
    setResultText(data);
    setModalOpen(true);
    addToHistory(data);
    
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  };

  const addToHistory = (data: string) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const item = { data, time: timeStr, id: Date.now() };
    setScanHistory(prev => {
      const newHistory = [item, ...prev].slice(0, 50);
      localStorage.setItem('qr_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const resumeScanning = () => {
    setModalOpen(false);
    setCopied(false);
    setTimeout(() => {
      setIsScanning(true);
    }, 500);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Fallback
      const tempInput = document.createElement("input");
      tempInput.value = resultText;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand("copy");
      document.body.removeChild(tempInput);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const clearHistory = () => {
    if (window.confirm('Xóa toàn bộ lịch sử quét?')) {
      setScanHistory([]);
      localStorage.setItem('qr_history', JSON.stringify([]));
    }
  };

  const exportToCSV = () => {
    if (scanHistory.length === 0) {
      alert('Không có dữ liệu để xuất!');
      return;
    }
    
    const headers = ['Thời gian', 'Nội dung'];
    const rows = scanHistory.map(item => [
      item.time,
      `"${item.data.replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `qr_history_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const isValidUrl = (text: string) => {
    try {
      new URL(text);
      return true;
    } catch (_) {
      return false;
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900">
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header */}
        <header className="text-center py-4">
          <h1 className="text-2xl font-bold text-blue-600">QR Fast Scanner</h1>
          <p className="text-slate-500 text-sm">Quét liên tục - Dò kết quả nhanh</p>
        </header>

        {/* Camera Section */}
        <div className="relative overflow-hidden rounded-2xl shadow-lg bg-black aspect-square flex items-center justify-center">
          <video 
            ref={videoRef} 
            className="w-full h-full object-cover" 
            playsInline 
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] border-2 border-blue-500 rounded-2xl pointer-events-none scan-region-shadow overflow-hidden">
            <div className="absolute w-full h-[2px] bg-blue-500 top-0 animate-scan shadow-[0_0_8px_2px_rgba(59,130,246,0.5)]"></div>
          </div>

          {/* Status Indicator */}
          <div className="absolute bottom-4 left-0 right-0 text-center">
            {cameraError ? (
              <span className="bg-red-500 text-white px-4 py-1.5 rounded-full text-xs font-medium shadow-md">
                {cameraError}
              </span>
            ) : (
              <span className="bg-black/60 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-xs font-medium shadow-md">
                {isScanning ? 'Đang tìm mã QR...' : 'Đã dừng quét'}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button 
            onClick={toggleCamera}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl font-medium shadow-sm active:bg-slate-100 transition hover:bg-slate-50 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Đổi Camera
          </button>
          <button 
            onClick={exportToCSV}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl text-green-600 font-medium shadow-sm active:bg-green-50 transition hover:bg-green-50 text-sm"
          >
            <Download className="w-4 h-4" />
            Xuất CSV
          </button>
          <button 
            onClick={clearHistory}
            className="px-4 flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl text-red-500 font-medium shadow-sm active:bg-red-50 transition hover:bg-red-50 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Xóa
          </button>
        </div>

        {/* History Section */}
        <div className="space-y-3 pb-8">
          <h2 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
            <History className="w-5 h-5 text-slate-400" />
            Lịch sử quét gần đây
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {scanHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-400 italic text-sm border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                Chưa có mã nào được quét
              </div>
            ) : (
              scanHistory.map(item => (
                <div key={item.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1.5 hover:border-blue-200 transition-colors">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> Mã QR</span>
                    <span>{item.time}</span>
                  </div>
                  <p className="text-sm text-slate-700 break-all font-medium leading-snug">{item.data}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Result Modal Popup */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100 opacity-100">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-800">Kết quả quét</h3>
                <button 
                  onClick={resumeScanning}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl mb-6 break-words border border-slate-200 max-h-48 overflow-y-auto">
                <p className="text-slate-700 font-mono text-sm leading-relaxed">{resultText}</p>
              </div>

              {isValidUrl(resultText) && (
                <button 
                  onClick={() => window.open(resultText, '_blank')}
                  className="w-full mb-3 flex items-center justify-center gap-2 bg-blue-50 text-blue-600 font-semibold py-3 rounded-xl hover:bg-blue-100 transition active:scale-[0.98]"
                >
                  <ExternalLink className="w-5 h-5" />
                  Truy cập liên kết
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-200 transition active:scale-[0.98]"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Đã sao chép!' : 'Sao chép'}
                </button>
                <button 
                  onClick={resumeScanning}
                  className="bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition active:scale-[0.98]"
                >
                  Tiếp tục quét
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
