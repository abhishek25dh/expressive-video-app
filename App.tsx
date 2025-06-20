
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { FileUpload } from './components/FileUpload';
import { VideoStage } from './components/VideoStage';
import { Expression, ALL_EXPRESSIONS, EXPRESSION_LABELS, DEFAULT_CHARACTER_IMAGE_URLS } from './constants';
import type { CharacterImages, ContextualImageItem } from './types';
import { useExpressionSynthesizer } from './hooks/useExpressionSynthesizer';

interface AssemblyAIWord {
  text: string;
  start: number; // in ms
  end: number; // in ms
  confidence?: number;
}

interface ScriptSegment {
  text: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  words: AssemblyAIWord[]; // Original words with ms timestamps from AssemblyAI
  visualQueryForPixabay?: string | null;
  pixabayFetchStatus?: 'loading' | 'fetched' | 'failed' | 'no_suggestion';
}

// ContextualImagesState key will be the index of the scriptSegment
type ContextualImagesState = Record<number, ContextualImageItem | null>;

const PIXABAY_API_KEY = "50577453-acd15cf6b8242af889a9c7b1d";
const ASSEMBLYAI_API_KEY = "98dd4c7e12d745bc97722b54671ebeff"; // Your AssemblyAI API Key
const ASSEMBLYAI_UPLOAD_URL = "https://api.assemblyai.com/v2/upload";
const ASSEMBLYAI_TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";

const App: React.FC = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  const [backgroundVideoFile, setBackgroundVideoFile] = useState<File | null>(null);
  const [backgroundVideoSrc, setBackgroundVideoSrc] = useState<string | null>(null);
  const [characterImages, setCharacterImages] = useState<CharacterImages>(
    ALL_EXPRESSIONS.reduce((acc, exp) => ({ ...acc, [exp]: null }), {} as CharacterImages)
  );
  const [defaultImagesLoading, setDefaultImagesLoading] = useState(true);
  const defaultLoadedExpressions = useRef<Set<Expression>>(new Set());

  const audioRef = useRef<HTMLAudioElement>(null);
  const characterImagesRef = useRef(characterImages);
  const pollingTimeoutRef = useRef<number | null>(null);

  const [isShaking, setIsShaking] = useState(false);

  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("Idle. Upload audio to start.");

  const [assemblyAiStatus, setAssemblyAiStatus] = useState<'idle' | 'uploading' | 'queued' | 'processing' | 'transcribing' | 'completed' | 'error'>('idle');
  const [assemblyAiTranscriptId, setAssemblyAiTranscriptId] = useState<string | null>(null);

  const [apiKeyExists, setApiKeyExists] = useState(false); // For Gemini
  const aiRef = useRef<GoogleGenAI | null>(null); // For Gemini

  const [contextualImages, setContextualImages] = useState<ContextualImagesState>({});
  const [activeContextualImageSrc, setActiveContextualImageSrc] = useState<string | null>(null);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  const [editingUrlForSegmentKey, setEditingUrlForSegmentKey] = useState<number | null>(null); // segment index
  const [currentUserInputUrl, setCurrentUserInputUrl] = useState<string>("");

  const [currentWordStartTime, setCurrentWordStartTime] = useState<number | undefined>();


  useEffect(() => {
    if (process.env.API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
      setApiKeyExists(true);
    } else {
      setApiKeyExists(false);
      setTranscriptionStatus(prev => prev.startsWith("Idle") ? "Error: Gemini API_KEY not set. Visual suggestions disabled." : prev);
      console.error("Gemini API_KEY environment variable not set.");
    }
  }, []);

  useEffect(() => {
    characterImagesRef.current = characterImages;
  }, [characterImages]);

  const allCharacterImagesUploaded = ALL_EXPRESSIONS.every(exp => !!characterImages[exp]);
  const allContextualDataProcessed = assemblyAiStatus === 'completed' && !isProcessingAI && scriptSegments.length > 0;


  const canStartProcessing = !!audioFile && !isProcessingAI && !!ASSEMBLYAI_API_KEY;
  const canStartPlayback = !!audioSrc && !!backgroundVideoSrc && allCharacterImagesUploaded && !defaultImagesLoading && allContextualDataProcessed;


  const triggerShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  }, []);

  const activeSegmentText = (activeSegmentIndex >= 0 && activeSegmentIndex < scriptSegments.length)
    ? scriptSegments[activeSegmentIndex].text
    : undefined;

  const { currentExpression } = useExpressionSynthesizer(
    isPlaying && canStartPlayback,
    activeSegmentText,
    currentWordStartTime,
    triggerShake
  );

  // Effect for AssemblyAI polling
  useEffect(() => {
    if (!assemblyAiTranscriptId || assemblyAiStatus === 'completed' || assemblyAiStatus === 'error' || assemblyAiStatus === 'idle') {
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      return;
    }

    const pollAssemblyAI = async () => {
      if (!assemblyAiTranscriptId) return;
      setTranscriptionStatus(`AssemblyAI: Checking status (ID: ${assemblyAiTranscriptId.substring(0,8)}...)`);
      try {
        const response = await fetch(`${ASSEMBLYAI_TRANSCRIPT_URL}/${assemblyAiTranscriptId}`, {
          headers: { authorization: ASSEMBLYAI_API_KEY }
        });
        if (!response.ok) {
          throw new Error(`AssemblyAI polling failed: ${response.status}`);
        }
        const data = await response.json();
        setAssemblyAiStatus(data.status as typeof assemblyAiStatus); // 'queued', 'processing', 'completed', 'error'

        if (data.status === 'completed') {
          setTranscriptionStatus('AssemblyAI: Transcription complete. Processing words...');
          if (data.words && data.words.length > 0) {
            const sentences = segmentTranscriptToSentences(data.words);
            setScriptSegments(sentences);
            // Now, trigger Gemini & Pixabay processing for these sentences
            processSentencesForVisuals(sentences);
          } else {
            setTranscriptionStatus('AssemblyAI: Transcription complete but no words found.');
            setIsProcessingAI(false);
          }
        } else if (data.status === 'error') {
          setTranscriptionStatus(`AssemblyAI Error: ${data.error || 'Unknown transcription error'}`);
          setIsProcessingAI(false);
        } else { // Still queued or processing
          setTranscriptionStatus(`AssemblyAI: Status - ${data.status}. Will check again...`);
          pollingTimeoutRef.current = window.setTimeout(pollAssemblyAI, 7000); // Poll every 7 seconds
        }
      } catch (error: any) {
        console.error("AssemblyAI polling error:", error);
        setTranscriptionStatus(`AssemblyAI polling error: ${error.message}`);
        setAssemblyAiStatus('error');
        setIsProcessingAI(false);
      }
    };

    if (assemblyAiStatus === 'queued' || assemblyAiStatus === 'processing' || assemblyAiStatus === 'transcribing') {
        pollingTimeoutRef.current = window.setTimeout(pollAssemblyAI, 1000); // Initial quick poll or if status just changed
    }
    
    return () => {
        if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    };
  }, [assemblyAiTranscriptId, assemblyAiStatus]);


  useEffect(() => {
    if (!isPlaying || activeSegmentIndex < 0 || activeSegmentIndex >= scriptSegments.length) {
      if (!isPlaying) setActiveContextualImageSrc(null);
      return;
    }
    const imageInfo = contextualImages[activeSegmentIndex]; // Keyed by segment index
    if (imageInfo && imageInfo.displayUrl) {
      if (activeContextualImageSrc !== imageInfo.displayUrl) {
        setActiveContextualImageSrc(imageInfo.displayUrl);
      }
    } else if (activeContextualImageSrc !== null && (!imageInfo || !imageInfo.displayUrl)) {
      // Keep current image if new segment has no specific image
    }
  }, [isPlaying, activeSegmentIndex, scriptSegments, contextualImages, activeContextualImageSrc]);


  useEffect(() => {
    const loadDefaultImages = async () => {
      if (!Object.keys(DEFAULT_CHARACTER_IMAGE_URLS).length) {
        setDefaultImagesLoading(false); return;
      }
      setDefaultImagesLoading(true);
      const fetchedImageSources: Partial<CharacterImages> = {};
      const successfullyLoadedDefaults = new Set<Expression>();

      const promises = ALL_EXPRESSIONS.map(async (exp) => {
        const url = DEFAULT_CHARACTER_IMAGE_URLS[exp];
        if (url && !characterImages[exp]) {
          try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`Failed to fetch ${EXPRESSION_LABELS[exp]}`);
            const blob = await response.blob();
            fetchedImageSources[exp] = URL.createObjectURL(blob);
            successfullyLoadedDefaults.add(exp);
          } catch (error) { console.error(`Error default img ${EXPRESSION_LABELS[exp]}:`, error); }
        }
      });
      await Promise.all(promises);
      setCharacterImages(current => ({ ...current, ...fetchedImageSources }));
      defaultLoadedExpressions.current = new Set([...defaultLoadedExpressions.current, ...successfullyLoadedDefaults]);
      setDefaultImagesLoading(false);
    };
    loadDefaultImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAudioUpload = (file: File) => {
    setAudioFile(file);
    if (audioSrc) URL.revokeObjectURL(audioSrc);
    setAudioSrc(URL.createObjectURL(file));
    resetAIStates();
  };

  const resetAIStates = () => {
    setScriptSegments([]);
    setContextualImages({});
    setActiveContextualImageSrc(null);
    setTranscriptionStatus(ASSEMBLYAI_API_KEY ? "Ready to process audio." : "Error: AssemblyAI API Key missing.");
    setIsProcessingAI(false);
    setActiveSegmentIndex(-1);
    setCurrentWordStartTime(undefined);
    setEditingUrlForSegmentKey(null);
    setCurrentUserInputUrl("");
    setAssemblyAiStatus('idle');
    setAssemblyAiTranscriptId(null);
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
  };

  const handleBackgroundVideoUpload = (file: File) => {
    setBackgroundVideoFile(file);
    if (backgroundVideoSrc) URL.revokeObjectURL(backgroundVideoSrc);
    setBackgroundVideoSrc(URL.createObjectURL(file));
  };

  const handleCharacterImageUpload = (expression: Expression, file: File) => {
    defaultLoadedExpressions.current.delete(expression);
    setCharacterImages(prev => {
      const newImages = { ...prev };
      if (prev[expression]) URL.revokeObjectURL(prev[expression]!);
      newImages[expression] = URL.createObjectURL(file);
      return newImages;
    });
  };

  const handleStartEditUserUrl = (segmentIndex: number) => {
    setEditingUrlForSegmentKey(segmentIndex);
    const currentImageInfo = contextualImages[segmentIndex];
    setCurrentUserInputUrl(currentImageInfo?.userOverriddenUrl || currentImageInfo?.pixabayUrl || "");
  };

  const handleSaveUserUrl = (segmentIndex: number) => {
    setContextualImages(prev => {
      const updated = { ...prev };
      const existingItem = prev[segmentIndex];
      updated[segmentIndex] = {
        pixabayUrl: existingItem?.pixabayUrl || null,
        userOverriddenUrl: currentUserInputUrl.trim() || null,
        displayUrl: currentUserInputUrl.trim() || existingItem?.pixabayUrl || null,
      };
      return updated;
    });
    setEditingUrlForSegmentKey(null);
    setCurrentUserInputUrl("");
  };

  const handleCancelEditUserUrl = () => {
    setEditingUrlForSegmentKey(null);
    setCurrentUserInputUrl("");
  };

   const getVisualSuggestionForSentence = async (sentence: string, ai: GoogleGenAI): Promise<string | null> => {
    if (!sentence.trim() || !apiKeyExists || !ai) return null;
    try {
      // --- IMPROVED PROMPT ---
      const prompt = `You are an expert stock photo curator. For the given sentence, suggest a general, searchable keyword or short phrase (1-3 words) that would find a relevant background image on a site like Pixabay.
- Prioritize common, concrete subjects (e.g., "city street", "mountain", "typing on keyboard").
- Avoid overly specific, niche, or abstract ideas.
- Think about what a photographer would tag their image with.
- If no good visual concept exists, return null.

Example:
Sentence: "Getting stuck behind someone walking incredibly slowly isn't just an annoyance."
Good Suggestion: "people walking" or "crowded street"
Bad Suggestion: "slow walker" or "annoyance"

Sentence to analyze: '${sentence}'

Respond ONLY with a JSON object containing a single key "suggestion", whose value is the string you suggest or null.`;
      // --- END OF IMPROVED PROMPT ---

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash-latest', // Using latest flash model is often a good practice
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      });

      // The Gemini API with JSON output mode often returns the raw JSON string directly.
      const jsonStr = response.response.text();
      const parsedData = JSON.parse(jsonStr);

      return parsedData.suggestion || null;
    } catch (error) {
      console.error(`Gemini suggestion error:`, error);
      return null;
    }
  };
    const fetchImageFromPixabay = async (query: string, apiKey: string): Promise<string | null> => {
    if (!query || !apiKey) return null;

    const performSearch = async (searchTerm: string) => {
      const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&image_type=photo&safesearch=true&per_page=5&orientation=horizontal`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Pixabay API error for term "${searchTerm}": ${response.status}`);
          return null;
        }
        const data = await response.json();
        return (data.hits && data.hits.length > 0) ? data.hits[0].webformatURL : null;
      } catch (error) {
        console.error(`Pixabay fetch error for term "${searchTerm}":`, error);
        return null;
      }
    };

    // 1. Try the full query first
    let imageUrl = await performSearch(query);
    if (imageUrl) return imageUrl;

    // 2. If it fails, try the LAST word of the query (often the main noun)
    const wordsInQuery = query.trim().split(/\s+/);
    if (wordsInQuery.length > 1) {
      console.log(`Pixabay: Full query "${query}" failed. Trying last word: "${wordsInQuery[wordsInQuery.length - 1]}"`);
      imageUrl = await performSearch(wordsInQuery[wordsInQuery.length - 1]);
      if (imageUrl) return imageUrl;
    }

    // 3. If all else fails, return null
    return null;
  };
  
  const segmentTranscriptToSentences = (assemblyWords: AssemblyAIWord[]): ScriptSegment[] => {
    const segments: ScriptSegment[] = [];
    if (!assemblyWords || assemblyWords.length === 0) return segments;

    let currentSentenceText = "";
    let currentSentenceWords: AssemblyAIWord[] = [];
    let sentenceStartTime = assemblyWords[0].start / 1000;

    for (let i = 0; i < assemblyWords.length; i++) {
        const word = assemblyWords[i];
        currentSentenceText += word.text + " ";
        currentSentenceWords.push(word);

        const isLastWord = i === assemblyWords.length - 1;
        const endsWithPunctuation = /[.!?]$/.test(word.text);
        // Optional: Check for long pause if timestamps are very reliable
        // const nextWord = assemblyWords[i+1];
        // const pauseDuration = nextWord ? (nextWord.start - word.end) : 0;
        // const isLongPause = pauseDuration > 700; // Example: 700ms pause

        if (endsWithPunctuation || isLastWord /*|| isLongPause*/) {
            segments.push({
                text: currentSentenceText.trim(),
                startTime: sentenceStartTime,
                endTime: word.end / 1000,
                words: [...currentSentenceWords],
                pixabayFetchStatus: 'no_suggestion'
            });
            currentSentenceText = "";
            currentSentenceWords = [];
            if (assemblyWords[i+1]) {
                sentenceStartTime = assemblyWords[i+1].start / 1000;
            }
        }
    }
    return segments;
};

  const processSentencesForVisuals = async (processedSegments: ScriptSegment[]) => {
    if (!aiRef.current && apiKeyExists) {
         setTranscriptionStatus("Error: Gemini AI not ready for visual suggestions.");
         // Continue without visual suggestions or mark segments as such
         const segmentsWithoutVisuals = processedSegments.map(seg => ({...seg, pixabayFetchStatus: 'no_suggestion' as const, visualQueryForPixabay: null}));
         setScriptSegments(segmentsWithoutVisuals);
         setContextualImages({}); // Clear any previous attempts
         setIsProcessingAI(false); // Mark AI processing complete
         return;
    }
    if (!apiKeyExists) { // No Gemini API key
        const segmentsWithoutVisuals = processedSegments.map(seg => ({...seg, pixabayFetchStatus: 'no_suggestion' as const, visualQueryForPixabay: null}));
        setScriptSegments(segmentsWithoutVisuals);
        setContextualImages({});
        setTranscriptionStatus("Visual suggestions skipped (Gemini API Key missing).");
        setIsProcessingAI(false);
        return;
    }

    setTranscriptionStatus(`Processing ${processedSegments.length} sentences for visuals...`);
    const finalNewContextualImages: ContextualImagesState = {};
    const updatedSegments: ScriptSegment[] = [];

    for (let i = 0; i < processedSegments.length; i++) {
        let segment = { ...processedSegments[i] };
        setTranscriptionStatus(`Sentence ${i + 1}/${processedSegments.length}: Getting suggestion...`);
        const suggestion = await getVisualSuggestionForSentence(segment.text, aiRef.current!);
        segment.visualQueryForPixabay = suggestion;

        const existingUserOverrideUrl = (contextualImages[i] as ContextualImageItem | null)?.userOverriddenUrl || null;

        if (suggestion) {
            setTranscriptionStatus(`Sentence ${i + 1}: Suggestion "${suggestion}". Fetching from Pixabay...`);
            segment.pixabayFetchStatus = 'loading';
            const pixabayUrl = await fetchImageFromPixabay(suggestion, PIXABAY_API_KEY);
            finalNewContextualImages[i] = {
                pixabayUrl: pixabayUrl, userOverriddenUrl: existingUserOverrideUrl,
                displayUrl: existingUserOverrideUrl || pixabayUrl,
            };
            segment.pixabayFetchStatus = pixabayUrl ? 'fetched' : 'failed';
        } else {
            finalNewContextualImages[i] = {
                pixabayUrl: null, userOverriddenUrl: existingUserOverrideUrl,
                displayUrl: existingUserOverrideUrl,
            };
            segment.pixabayFetchStatus = 'no_suggestion';
        }
        updatedSegments.push(segment);
        setScriptSegments([...updatedSegments]); // Update incrementally for UI feedback
        setContextualImages(prev => ({...prev, ...finalNewContextualImages}));
    }
    setTranscriptionStatus("Visual processing complete.");
    setIsProcessingAI(false); // Overall AI processing is done
  };


  const handleTranscribeAndProcessSentences = async () => {
    if (!audioFile || !ASSEMBLYAI_API_KEY) {
      setTranscriptionStatus("Error: Audio file or AssemblyAI API Key missing.");
      setIsProcessingAI(false);
      return;
    }

    setIsProcessingAI(true);
    resetAIStates(); // Resets assemblyAiStatus to 'idle' among other things
    setTranscriptionStatus("AssemblyAI: Uploading audio...");
    setAssemblyAiStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);

      const uploadResponse = await fetch(ASSEMBLYAI_UPLOAD_URL, {
        method: 'POST',
        headers: { authorization: ASSEMBLYAI_API_KEY },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(`AssemblyAI Upload Error: ${uploadResponse.status} ${errorData.error || 'Failed to upload audio'}`);
      }
      const uploadData = await uploadResponse.json();
      const audio_url = uploadData.upload_url;

      setTranscriptionStatus("AssemblyAI: Submitting for transcription...");
      const transcriptResponse = await fetch(ASSEMBLYAI_TRANSCRIPT_URL, {
        method: 'POST',
        headers: { authorization: ASSEMBLYAI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: audio_url /*, word_boosts: [] */ }),
      });

      if (!transcriptResponse.ok) {
         const errorData = await transcriptResponse.json().catch(() => ({}));
        throw new Error(`AssemblyAI Transcription Submit Error: ${transcriptResponse.status} ${errorData.error || 'Failed to submit'}`);
      }
      const transcriptData = await transcriptResponse.json();
      setAssemblyAiTranscriptId(transcriptData.id);
      setAssemblyAiStatus(transcriptData.status as typeof assemblyAiStatus); // e.g., 'queued' or 'processing'
      setTranscriptionStatus(`AssemblyAI: Transcription ${transcriptData.status}. Polling for results...`);
      // Polling will be handled by the useEffect hook listening to assemblyAiTranscriptId and assemblyAiStatus

    } catch (error: any) {
      console.error("AssemblyAI initial processing error:", error);
      setTranscriptionStatus(`AssemblyAI Error: ${error.message || 'Unknown error'}`);
      setAssemblyAiStatus('error');
      setIsProcessingAI(false);
    }
  };

  useEffect(() => {
    const currentAudio = audioSrc;
    return () => { if (currentAudio) URL.revokeObjectURL(currentAudio); };
  }, [audioSrc]);

  useEffect(() => {
    const currentVideo = backgroundVideoSrc;
    return () => { if (currentVideo) URL.revokeObjectURL(currentVideo); };
  }, [backgroundVideoSrc]);

  useEffect(() => {
    const imagesToClean = characterImagesRef.current;
    return () => { Object.values(imagesToClean).forEach(src => { if (src) URL.revokeObjectURL(src); }); };
  }, []);

  const togglePlay = () => {
    if (!canStartPlayback && !(isPlaying && audioRef.current && audioRef.current.paused)) {
        let alertMessage = "Please complete all steps: ";
        if (!audioSrc) alertMessage += "Upload audio. ";
        if (assemblyAiStatus !== 'completed' && !isProcessingAI) alertMessage += "Process audio. ";
        if (isProcessingAI) alertMessage += "AI is still processing. Please wait. ";
        if (!allCharacterImagesUploaded) alertMessage += "Upload character expressions. ";
        if (!backgroundVideoSrc) alertMessage += "Upload background video.";
        alert(alertMessage); return;
    }
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else {
        if (audioRef.current.ended || audioRef.current.currentTime === 0 && scriptSegments.length > 0) {
             audioRef.current.currentTime = 0;
             setActiveSegmentIndex(-1);
             setCurrentWordStartTime(undefined);
        }
        audioRef.current.play().catch(err => console.error("Error playing audio:", err));
      }
    }
  };

  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => {
          setIsPlaying(false);
          setCurrentWordStartTime(undefined);
        };
        const handleEnded = () => {
          setIsPlaying(false);
          setActiveSegmentIndex(-1);
          setActiveContextualImageSrc(null);
          setCurrentWordStartTime(undefined);
        };

        const handleTimeUpdate = () => {
          if (isPlaying && scriptSegments.length > 0) {
            const currentTime = audioElement.currentTime;
            let foundSegment = -1;
            for (let i = 0; i < scriptSegments.length; i++) {
                if (currentTime >= scriptSegments[i].startTime && currentTime < scriptSegments[i].endTime) {
                    foundSegment = i;
                    break;
                }
            }
            if (foundSegment === -1 && scriptSegments.length > 0 && currentTime >= scriptSegments[scriptSegments.length - 1].endTime) {
                foundSegment = scriptSegments.length -1;
            }

            if (activeSegmentIndex !== foundSegment && foundSegment !== -1) {
                 setActiveSegmentIndex(foundSegment);
            } else if (foundSegment === -1 && activeSegmentIndex !== -1 && scriptSegments.length > 0 && currentTime < scriptSegments[0].startTime) {
                 setActiveSegmentIndex(-1);
            }

            let newCurrentWordStartTime: number | undefined = undefined;
            if (foundSegment !== -1 && scriptSegments[foundSegment].words) {
                const segmentWords = scriptSegments[foundSegment].words;
                for (const word of segmentWords) {
                    if (currentTime * 1000 >= word.start && currentTime * 1000 < word.end) {
                        newCurrentWordStartTime = word.start;
                        break;
                    }
                }
            }
            if (currentWordStartTime !== newCurrentWordStartTime) {
                setCurrentWordStartTime(newCurrentWordStartTime);
            }
          } else if (!isPlaying && currentWordStartTime !== undefined) {
             setCurrentWordStartTime(undefined); // Clear if not playing (e.g. paused right after a word)
          }
        };
        audioElement.addEventListener('play', handlePlay);
        audioElement.addEventListener('pause', handlePause);
        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        return () => {
            audioElement.removeEventListener('play', handlePlay);
            audioElement.removeEventListener('pause', handlePause);
            audioElement.removeEventListener('ended', handleEnded);
            audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }
  }, [audioRef, audioSrc, isPlaying, scriptSegments, activeSegmentIndex, currentWordStartTime]);

  const displayedCharacterImageSrc = characterImages[currentExpression] || characterImages[Expression.Talking] || null;

  const resetAll = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setIsPlaying(false); setIsShaking(false);
    if (audioSrc) URL.revokeObjectURL(audioSrc);
    setAudioFile(null); setAudioSrc(null);
    if (backgroundVideoSrc) URL.revokeObjectURL(backgroundVideoSrc);
    setBackgroundVideoFile(null); setBackgroundVideoSrc(null);
    Object.values(characterImagesRef.current).forEach(src => { if (src) URL.revokeObjectURL(src); });
    setCharacterImages(ALL_EXPRESSIONS.reduce((acc, exp) => ({ ...acc, [exp]: null }), {} as CharacterImages));
    defaultLoadedExpressions.current.clear();
    resetAIStates(); // This will also call setCurrentWordStartTime(undefined)
    if (Object.keys(DEFAULT_CHARACTER_IMAGE_URLS).length > 0) {
      setDefaultImagesLoading(true);
      const loadDefaultImagesOnReset = async () => { 
        setDefaultImagesLoading(true);
        const fetched: Partial<CharacterImages> = {}; const loaded = new Set<Expression>();
        await Promise.all(ALL_EXPRESSIONS.map(async exp => {
            const url = DEFAULT_CHARACTER_IMAGE_URLS[exp]; if (url) try {
            const r = await fetch(url,{mode:'cors'}); if(!r.ok) throw new Error(`Failed default fetch ${exp}`);
            const b = await r.blob(); fetched[exp] = URL.createObjectURL(b); loaded.add(exp);
            // eslint-disable-next-line no-empty
            } catch(e){ console.error("Error loading default image on reset:", e); }
        }));
        setCharacterImages(ALL_EXPRESSIONS.reduce((acc, exp) => ({...acc, [exp]: fetched[exp] || null}), {} as CharacterImages));
        defaultLoadedExpressions.current = loaded; setDefaultImagesLoading(false);
      };
      loadDefaultImagesOnReset();
    } else setDefaultImagesLoading(false);
  }, [audioSrc, backgroundVideoSrc]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
          Expressive Character Video Simulator
        </h1>
        <p className="text-gray-400 mt-2">Accurate timing via AssemblyAI. Visuals by Gemini & Pixabay.</p>
      </header>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6 bg-gray-800 p-6 rounded-lg shadow-xl overflow-y-auto max-h-[calc(100vh-150px)]">
          <div>
            <h2 className="text-xl font-semibold mb-3 text-purple-300 border-b border-gray-700 pb-2">Assets & Controls</h2>
            <FileUpload label="1. Audio (MP3, WAV, OGG)" onFileUpload={handleAudioUpload} accept=".mp3,.wav,.ogg,audio/*" currentFile={audioFile}/>
            <div className="my-4">
              {(!ASSEMBLYAI_API_KEY || !apiKeyExists) && (
                 <p className="text-xs text-red-400 mt-1 mb-2 text-center" role="alert">
                    { !ASSEMBLYAI_API_KEY && "AssemblyAI API Key missing. " }
                    { !apiKeyExists && "Gemini API Key missing. "}
                    AI features may be limited.
                 </p>
              )}
              <button onClick={handleTranscribeAndProcessSentences} disabled={!canStartProcessing}
                className={`w-full py-2 px-3 rounded-md font-semibold transition-colors duration-150 ease-in-out text-sm
                            ${canStartProcessing ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 cursor-not-allowed text-gray-400'}
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500`}>
                {isProcessingAI ? `AI: ${assemblyAiStatus}...` : '2. Process Audio & Visuals'}
              </button>
               <p className="text-xs text-gray-400 mt-2 text-center h-10 leading-tight" aria-live="assertive">{transcriptionStatus}</p>
            </div>
            <FileUpload label="3. Background Video" onFileUpload={handleBackgroundVideoUpload} accept="video/mp4,video/webm" currentFile={backgroundVideoFile}/>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2 text-purple-300">4. Character Expressions</h3>
            {defaultImagesLoading && <p className="text-sm text-blue-300 animate-pulse">Loading defaults...</p>}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {ALL_EXPRESSIONS.map(exp => (
                <FileUpload key={exp} label={EXPRESSION_LABELS[exp]} onFileUpload={(file) => handleCharacterImageUpload(exp, file)}
                  accept="image/png,image/jpeg" currentFile={characterImages[exp] ? new File([], "") : null} previewSrc={characterImages[exp]}
                  isPotentiallyDefault={defaultLoadedExpressions.current.has(exp) && !!characterImages[exp]}
                  isLoadingDefault={defaultImagesLoading && !characterImages[exp] && !!DEFAULT_CHARACTER_IMAGE_URLS[exp]}/>
              ))}
            </div>
          </div>

          {scriptSegments.length > 0 && assemblyAiStatus === 'completed' && (
            <div>
              <h3 className="text-lg font-semibold my-2 text-purple-300">5. Contextual Images (Auto-fetched)</h3>
              {scriptSegments.map((segment, index) => {
                  const imageInfo = contextualImages[index]; // Keyed by segment index
                  const isEditingThisSegment = editingUrlForSegmentKey === index;
                  return (
                    <div key={index} className="mb-3 bg-gray-700 p-3 rounded-md shadow">
                      <p className="text-xs text-gray-400 italic mb-1">Sentence {index+1}: "{segment.text}"</p>
                      {segment.visualQueryForPixabay && (<p className="text-xs text-gray-300 mb-1">AI Suggestion: "{segment.visualQueryForPixabay}"</p>)}
                      {imageInfo?.displayUrl && !isEditingThisSegment && (<img src={imageInfo.displayUrl} alt={segment.visualQueryForPixabay || 'Contextual'} className="mt-2 h-24 w-auto object-contain rounded-md border border-gray-500"/> )}
                      {!imageInfo?.displayUrl && segment.visualQueryForPixabay && segment.pixabayFetchStatus !== 'loading' && !isEditingThisSegment && (<p className="text-xs text-yellow-400 mt-1">Pixabay: No image found for "{segment.visualQueryForPixabay}".</p>)}
                      {!segment.visualQueryForPixabay && segment.pixabayFetchStatus === 'no_suggestion' && !isEditingThisSegment && (<p className="text-xs text-gray-500 mt-1">No visual suggestion from AI.</p>)}
                      {segment.pixabayFetchStatus === 'loading' && !isEditingThisSegment && (<p className="text-xs text-blue-400 mt-1 animate-pulse">Fetching image...</p>)}
                      {isEditingThisSegment ? (
                        <div className="mt-2 space-y-2">
                          <input type="url" value={currentUserInputUrl} onChange={(e) => setCurrentUserInputUrl(e.target.value)} placeholder="Enter image URL" className="w-full p-1.5 text-xs bg-gray-800 border border-gray-600 rounded-md"/>
                          <div className="flex space-x-2">
                            <button onClick={() => handleSaveUserUrl(index)} className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded-md">Save URL</button>
                            <button onClick={handleCancelEditUserUrl} className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 rounded-md">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => handleStartEditUserUrl(index)} className="mt-2 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded-md">
                          {imageInfo?.userOverriddenUrl ? 'Change Custom URL' : (imageInfo?.pixabayUrl ? 'Override Pixabay Image' : 'Add Custom URL')}
                        </button>
                      )}
                    </div>);
              })}
            </div>
          )}
          <div className="mt-6 pt-6 border-t border-gray-700 space-y-3">
             <button onClick={resetAll} className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold">Reset All</button>
            <button onClick={togglePlay} disabled={!canStartPlayback && !isPlaying}
              className={`w-full py-2.5 px-4 rounded-md font-bold text-lg transition-colors
                          ${(canStartPlayback || isPlaying) ? (isPlaying ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' : 'bg-green-500 hover:bg-green-600 text-white') : 'bg-gray-600 cursor-not-allowed text-gray-400'}`}>
              {isPlaying ? 'Pause Simulation' : 'Play Simulation'}
            </button>
          </div>
           <audio ref={audioRef} src={audioSrc || undefined} className="hidden" />
        </div>
        <div className="md:col-span-2 flex justify-center items-start pt-6 md:pt-0">
          <VideoStage backgroundVideoSrc={backgroundVideoSrc} characterImageSrc={displayedCharacterImageSrc}
            contextualImageSrc={activeContextualImageSrc} isPlaying={isPlaying} isShakingCharacter={isShaking}/>
        </div>
      </div>
    </div>);
};
export default App;
