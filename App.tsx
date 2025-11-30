import React, { useEffect } from 'react';
import { useProjectStore } from '@/features/project';
import { EditorProvider, EngineProvider, UsageProvider, ErrorBoundary } from '@/features/shared';
// import { AppBrainProvider } from '@/features/shared'; // Temporarily disabled
import { AnalysisProvider } from '@/features/analysis';
import { MainLayout } from '@/features/layout';

const App: React.FC = () => {
  const { init: initStore, isLoading: isStoreLoading } = useProjectStore();
  
  useEffect(() => { initStore(); }, [initStore]);

  if (isStoreLoading) return <div className="h-screen w-full flex items-center justify-center bg-gray-50 text-indigo-600"><p>Loading...</p></div>;

  return (
    <ErrorBoundary>
      <UsageProvider>
        <EditorProvider>
          <EngineProvider>
            <AnalysisProvider>
              {/* AppBrainProvider temporarily disabled for debugging */}
              {/* <AppBrainProvider> */}
                <MainLayout />
              {/* </AppBrainProvider> */}
            </AnalysisProvider>
          </EngineProvider>
        </EditorProvider>
      </UsageProvider>
    </ErrorBoundary>
  );
};

export default App;
