
import React from 'react';

interface CharacterDisplayProps {
  imageSrc: string | null;
  isShaking?: boolean;
}

export const CharacterDisplay: React.FC<CharacterDisplayProps> = ({ imageSrc, isShaking }) => {
  if (!imageSrc) {
    return <div className="w-full h-full bg-transparent" aria-hidden="true" />;
  }
  
  const shakeClass = isShaking ? 'shake-effect' : '';

  return (
    <img
      src={imageSrc}
      alt="Character expression"
      className={`object-contain w-full h-full ${shakeClass}`} // Removed pop transition and state classes
      // style for CSS custom properties for shake can be kept if the shake animation itself uses them
      // For now, the shake keyframes handle their own scaling.
    />
  );
};
