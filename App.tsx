import React, { useEffect } from 'react';
import { useProjectStore } from '@/features/project';
import { EditorProvider, EngineProvider, UsageProvider, ErrorBoundary } from '@/features/shared';
import { AppBrainProvider } from '@/features/core';
import { AnalysisProvider } from '@/features/analysis';
import { MainLayout } from '@/features/layout';

const App: React.FC = () => {
  const { init: initStore, isLoading: isStoreLoading, flushPendingWrites } = useProjectStore();
  
  useEffect(() => { initStore(); }, [initStore]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingWrites();
      }
    };

    const handleBeforeUnload = () => {
      flushPendingWrites();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushPendingWrites]);

  if (isStoreLoading) return <div className="h-screen w-full flex items-center justify-center bg-gray-50 text-indigo-600"><p>Loading...</p></div>;

  return (
    <ErrorBoundary>
      <UsageProvider>
        <EditorProvider>
          <EngineProvider>
            <AnalysisProvider>
              <AppBrainProvider>
                <MainLayout />
              </AppBrainProvider>
            </AnalysisProvider>
          </EngineProvider>
        </EditorProvider>
      </UsageProvider>
    </ErrorBoundary>
  );
};

export default App;
