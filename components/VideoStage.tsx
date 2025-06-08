
import React, { useRef, useEffect, useState } from 'react';
import { CharacterDisplay } from './CharacterDisplay';
import { ContextualImageDisplay } from './ContextualImageDisplay'; // Import new component

interface VideoStageProps {
  backgroundVideoSrc: string | null;
  characterImageSrc: string | null;
  contextualImageSrc: string | null; 
  isPlaying: boolean;
  isShakingCharacter?: boolean;
}

export const VideoStage: React.FC<VideoStageProps> = ({ 
  backgroundVideoSrc, 
  characterImageSrc, 
  contextualImageSrc, 
  isPlaying,
  isShakingCharacter 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying && backgroundVideoSrc) {
        videoRef.current.play().catch(error => console.error("Error playing background video:", error));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, backgroundVideoSrc]);

  useEffect(() => {
    const clearZoomTimeout = () => {
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
      zoomTimeoutRef.current = null;
    };

    const manageZoomCycle = () => {
      clearZoomTimeout();
      if (!isPlaying) {
        setIsZoomed(false); return;
      }
      const delay = isZoomed ? (Math.random() * 1000 + 2000) : (Math.random() * 2000 + 4000);
      zoomTimeoutRef.current = window.setTimeout(() => setIsZoomed(prev => !prev), delay);
    };

    if (isPlaying) manageZoomCycle();
    else { clearZoomTimeout(); setIsZoomed(false); }
    return clearZoomTimeout;
  }, [isPlaying, isZoomed]);

  return (
    <div 
      className={`
        w-full max-w-sm md:max-w-md aspect-[9/16] bg-black 
        rounded-xl shadow-2xl overflow-hidden relative 
        border-4 border-purple-500 
        transition-transform duration-500 ease-in-out
        ${isZoomed ? 'scale-105' : 'scale-100'} 
      `}
      style={{ transformOrigin: 'center center' }}
    >
      {backgroundVideoSrc && (
        <video
          ref={videoRef}
          src={backgroundVideoSrc}
          loop
          muted
          playsInline 
          className="absolute top-0 left-0 w-full h-full object-cover"
        />
      )}
      {!backgroundVideoSrc && (
        <div className="w-full h-full flex items-center justify-center bg-gray-700">
            <p className="text-gray-400">Upload Background Video</p>
        </div>
      )}
      
      {/* Contextual Image Display Area - Positioned above character, further increased size */}
      <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[75%] h-[35%] z-10 pointer-events-none">
        <ContextualImageDisplay src={contextualImageSrc} key={contextualImageSrc} /> 
      </div>

      {/* Character Display Area - Positioned in the middle/lower-middle */}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        {/* Adjusted character area to be slightly lower to make space for contextual image */}
        <div className="w-[70%] h-[45%] relative top-[15%]"> {/* Pushed character slightly more down */}
          { (isPlaying || characterImageSrc) && 
            <CharacterDisplay 
              imageSrc={characterImageSrc} 
              isShaking={isShakingCharacter && isPlaying} 
            /> 
          }
           { !characterImageSrc && isPlaying && (
             <div className="w-full h-full flex items-center justify-center">
                <p className="text-white bg-black bg-opacity-50 p-2 rounded">Load character images</p>
             </div>
           )}
        </div>
      </div>

      {!isPlaying && backgroundVideoSrc && (
         <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-white opacity-70" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
         </div>
      )}
    </div>
  );
};
