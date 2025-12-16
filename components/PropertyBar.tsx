import React from 'react';
import { usePatentStore } from '../store';
import { StartStyle } from '../types';

const PropertyBar: React.FC = () => {
  const { state, dispatch } = usePatentStore();
  const { globalSettings } = state;

  const selectedAnnotation = state.annotations.find(a => a.id === state.selectedId);
  const selectedLine = state.alignmentLines.find(l => l.id === state.selectedId);

  // --- Handlers for Selected Item ---

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedAnnotation) {
      dispatch({
        type: 'UPDATE_ANNOTATION',
        payload: { id: selectedAnnotation.id, text: e.target.value },
      });
    }
  };

  const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (selectedAnnotation) {
      dispatch({
        type: 'UPDATE_ANNOTATION',
        payload: { id: selectedAnnotation.id, startStyle: e.target.value as StartStyle },
      });
    }
  };

  // --- Handlers for Global Settings / Canvas ---

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>, dimension: 'widthMM' | 'heightMM') => {
      const val = parseInt(e.target.value);
      if(!isNaN(val)) {
          const payload = { ...state.config, [dimension]: val };
          dispatch({ type: 'SET_CANVAS_SIZE', payload: { widthMM: payload.widthMM, heightMM: payload.heightMM }});
      }
  }

  const handleGlobalSettingChange = (field: keyof typeof globalSettings, value: string) => {
      const numVal = field === 'fontSize' || field === 'strokeWidth' || field === 'labelStep' || field === 'labelStartValue' 
          ? parseInt(value) 
          : value;
      
      if (typeof numVal === 'number' && isNaN(numVal)) return;

      dispatch({ 
          type: 'UPDATE_GLOBAL_SETTINGS', 
          payload: { [field]: numVal } 
      });
  };

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shadow-sm overflow-x-auto whitespace-nowrap">
      
      {/* Canvas Size */}
      <div className="flex items-center gap-2 border-r pr-4">
        <span className="text-xs font-bold text-gray-500 uppercase">Size (mm)</span>
        <input 
            type="number" 
            value={state.config.widthMM} 
            onChange={(e) => handleSizeChange(e, 'widthMM')}
            className="w-14 border rounded px-1 py-1 text-sm"
        />
        <span className="text-gray-400">x</span>
        <input 
            type="number" 
            value={state.config.heightMM} 
            onChange={(e) => handleSizeChange(e, 'heightMM')}
            className="w-14 border rounded px-1 py-1 text-sm"
        />
      </div>

      {/* If nothing selected, show Global Defaults */}
      {!selectedAnnotation && !selectedLine && (
          <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Label Start</span>
                  <input
                      type="number"
                      value={globalSettings.labelStartValue}
                      onChange={(e) => handleGlobalSettingChange('labelStartValue', e.target.value)}
                      className="w-12 border rounded px-1 py-1 text-sm"
                  />
              </div>
              <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Step</span>
                  <input
                      type="number"
                      min="1"
                      value={globalSettings.labelStep}
                      onChange={(e) => handleGlobalSettingChange('labelStep', e.target.value)}
                      className="w-12 border rounded px-1 py-1 text-sm"
                  />
              </div>
              <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Font Size</span>
                  <input
                      type="number"
                      value={globalSettings.fontSize}
                      onChange={(e) => handleGlobalSettingChange('fontSize', e.target.value)}
                      className="w-12 border rounded px-1 py-1 text-sm"
                  />
              </div>
               <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Line Width</span>
                  <input
                      type="number"
                      value={globalSettings.strokeWidth}
                      onChange={(e) => handleGlobalSettingChange('strokeWidth', e.target.value)}
                      className="w-12 border rounded px-1 py-1 text-sm"
                  />
              </div>
          </div>
      )}

      {/* Selected Annotation Properties */}
      {selectedAnnotation && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Label</span>
            <input
              type="text"
              value={selectedAnnotation.text}
              onChange={handleTextChange}
              className="border rounded px-2 py-1 text-sm w-20"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Style</span>
            <select
              value={selectedAnnotation.startStyle}
              onChange={handleStyleChange}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value={StartStyle.NONE}>None</option>
              <option value={StartStyle.ARROW}>Arrow</option>
              <option value={StartStyle.DOT}>Dot</option>
            </select>
          </div>
          {/* We could add specific Font Size/Stroke Width overrides for the selected item here too */}
          <div className="flex items-center gap-2">
             <span className="text-xs font-bold text-gray-500 uppercase">Size</span>
             <input
                 type="number"
                 value={selectedAnnotation.fontSize || globalSettings.fontSize}
                 onChange={(e) => dispatch({ 
                     type: 'UPDATE_ANNOTATION', 
                     payload: { id: selectedAnnotation.id, fontSize: parseInt(e.target.value) } 
                 })}
                 className="w-12 border rounded px-1 py-1 text-sm"
             />
          </div>
        </div>
      )}

      {/* Selected Line Properties */}
      {selectedLine && (
         <div className="flex items-center gap-2">
             <span className="text-xs font-bold text-blue-500 uppercase">Alignment Line</span>
             <span className="text-xs text-gray-400">Drag blue line to move</span>
         </div>
      )}
    </div>
  );
};

export default PropertyBar;
