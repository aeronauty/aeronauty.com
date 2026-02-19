'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';

const SpecificRangeExplorer = dynamic(
  () => import('@/components/SpecificRangeExplorer'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        minHeight: '100vh', background: '#0a0e17', color: '#e8e8e8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      }}>
        Loading…
      </div>
    ),
  }
);

export default function SpecificRangeApp() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 bg-[#0a0e17] flex flex-col">
      <div className="bg-[#0a0e17]/95 backdrop-blur-sm border-b border-white/10 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all font-medium"
          >
            <ArrowLeft size={20} />
            <span>Back to Projects</span>
          </button>
          <h1 className="text-lg font-semibold text-white">Specific Range Explorer</h1>
          <div className="w-32" />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <SpecificRangeExplorer />
      </div>
    </div>
  );
}
