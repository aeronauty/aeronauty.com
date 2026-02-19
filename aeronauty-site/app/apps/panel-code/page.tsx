'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function PanelCodeApp() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 bg-white flex flex-col">
      {/* Minimal header with back button */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all font-medium"
          >
            <ArrowLeft size={20} />
            <span>Back to Projects</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">2D Panel Method – Airfoil Flow Visualization</h1>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>
      </div>

      {/* LiftExplainer iframe */}
      <div className="flex-1 relative">
        <iframe 
          src="/lift-explainer/index.html"
          className="absolute inset-0 w-full h-full border-0"
          title="Lift Explainer - Panel Method Visualization"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
          allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone"
        />
      </div>
    </div>
  );
}

