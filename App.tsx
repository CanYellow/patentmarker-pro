import React, { useRef } from 'react';
import Konva from 'konva';
import Toolbar from './components/Toolbar';
import PropertyBar from './components/PropertyBar';
import CanvasArea from './components/CanvasArea';
import { PatentProvider } from './store';

const AppLayout = () => {
  const stageRef = useRef<Konva.Stage>(null);

  return (
    <div className="flex h-screen w-screen bg-gray-100 font-sans text-gray-900">
      {/* Left Toolbar */}
      <Toolbar stageRef={stageRef} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Properties Bar */}
        <PropertyBar />

        {/* Main Canvas Area */}
        <CanvasArea stageRef={stageRef} />
      </div>
    </div>
  );
};

const App = () => {
  return (
    <PatentProvider>
      <AppLayout />
    </PatentProvider>
  );
};

export default App;
