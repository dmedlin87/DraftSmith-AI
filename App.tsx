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
    const flushAndReport = async (reason: 'visibilitychange' | 'beforeunload') => {
      try {
        const { pendingCount, errors } = (await flushPendingWrites({ reason, keepAlive: true })) ?? {
          pendingCount: 0,
          errors: [],
        };

        if (pendingCount > 0) {
          const summary = `[App] ${errors.length > 0 ? 'Failed to flush' : 'Flushed'} ${pendingCount} pending writes during ${reason}`;

          if (errors.length > 0) {
            console.error(summary, errors);
          } else {
            console.info(summary);
          }
        }
      } catch (error) {
        console.error(`[App] Unexpected error while flushing pending writes during ${reason}`, error);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        await flushAndReport('visibilitychange');
      }
    };

    const handleBeforeUnload = async () => {
      await flushAndReport('beforeunload');
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
