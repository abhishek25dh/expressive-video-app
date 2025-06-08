
import React, { useRef } from 'react';
import {EXPRESSION_LABELS, Expression} from '../constants'; // Added for typing label if needed

interface FileUploadProps {
  label: string; // This will be the Expression string from EXPRESSION_LABELS
  onFileUpload: (file: File) => void;
  accept: string;
  currentFile: File | null;
  previewSrc?: string | null;
  isPotentiallyDefault?: boolean;
  isLoadingDefault?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  label, 
  onFileUpload, 
  accept, 
  currentFile, 
  previewSrc, 
  isPotentiallyDefault,
  isLoadingDefault 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onFileUpload(event.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    inputRef.current?.click();
  };

  const getShortLabel = () => {
    // Example: label is "Little Frustrated". If it matches an EXPRESSION_LABEL value, use it.
    // Otherwise, fallback to a generic term or the label itself.
    // This helps make "Custom [ShortLabel]" more concise.
    // For this app, `label` is already the short version like "Talking", "Angry".
    return label;
  };

  return (
    <div className="mb-3 bg-gray-700 p-3 rounded-md shadow">
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={triggerFileInput}
          className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          aria-label={`Select or change file for ${label}`}
        >
          {previewSrc ? 'Change Image' : 'Select File'}
        </button>
        <input
          type="file"
          ref={inputRef}
          onChange={handleFileChange}
          accept={accept}
          className="hidden"
          aria-hidden="true"
        />
        {previewSrc && (
          <span className="text-xs text-gray-400 truncate max-w-[150px] flex-shrink min-w-0">
            {isPotentiallyDefault ? `${getShortLabel()} (Default)` : `Custom ${getShortLabel()}`}
          </span>
        )}
      </div>
      {previewSrc && accept.startsWith('image/') && (
        <div className="mt-2">
          <img src={previewSrc} alt={`${label} preview`} className="h-16 w-16 object-cover rounded-md border border-gray-600" />
        </div>
      )}
       {!previewSrc && !isLoadingDefault && (
         <p className="text-xs text-yellow-400 mt-1">Required</p>
       )}
       {isLoadingDefault && (
        <p className="text-xs text-blue-400 mt-1 animate-pulse">Loading default...</p>
       )}
    </div>
  );
};
