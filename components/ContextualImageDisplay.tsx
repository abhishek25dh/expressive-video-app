
import React, { useState, useEffect } from 'react';

interface ContextualImageDisplayProps {
  src: string | null;
}

export const ContextualImageDisplay: React.FC<ContextualImageDisplayProps> = ({ src }) => {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (src) {
      setCurrentSrc(src);
      setIsVisible(true);
    } else {
      setIsVisible(false);
      // Delay clearing the src to allow fade-out animation
      const timer = setTimeout(() => {
        setCurrentSrc(null);
      }, 300); // Match this duration with CSS transition
      return () => clearTimeout(timer);
    }
  }, [src]);

  if (!currentSrc && !isVisible) { // Don't render if no src and not even fading out
    return null;
  }

  return (
    <div 
      className={`
        w-full h-full flex items-center justify-center 
        transition-opacity duration-300 ease-in-out
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
      aria-live="polite" // Announce changes to assistive technologies
    >
      {currentSrc && (
        <img
          src={currentSrc}
          alt="Contextual content" // More generic alt as content is dynamic
          className="max-w-full max-h-full object-contain rounded-md shadow-lg bg-black bg-opacity-30 p-1"
        />
      )}
    </div>
  );
};
