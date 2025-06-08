
import { useState, useEffect, useRef } from 'react';
import { Expression, ALL_EXPRESSIONS, STRONG_EXPRESSIONS } from '../constants';

const MIN_SHAKES_PER_VIDEO = 2;

// Helper function to pick the next expression based on segment text and previous expression
const _pickNextExpression = (
    activeSegmentText: string,
    prevExpression: Expression
): Expression => {
    let candidates = ALL_EXPRESSIONS.filter(exp => exp !== prevExpression);
    if (candidates.length === 0) candidates = [...ALL_EXPRESSIONS];
    
    let nextExpression: Expression;
    const randomFactor = Math.random();
    const phrase = activeSegmentText.toLowerCase();
    const wordCount = phrase.split(/\s+/).filter(Boolean).length; // Word count of the whole sentence
    
    const complainingPool = [Expression.Frustrated, Expression.Angry].filter(exp => candidates.includes(exp));
    const questioningPool = [Expression.LittleShocked, Expression.Talking].filter(exp => candidates.includes(exp));
    const exclamatoryPool = [Expression.MoreShocked, Expression.Angry, Expression.LittleShocked].filter(exp => candidates.includes(exp) && STRONG_EXPRESSIONS.includes(exp));

    if (phrase.includes('?') && questioningPool.length > 0 && randomFactor < 0.7) {
        nextExpression = questioningPool[Math.floor(Math.random() * questioningPool.length)];
    } else if (phrase.includes('!') && exclamatoryPool.length > 0 && randomFactor < 0.7) {
        nextExpression = exclamatoryPool[Math.floor(Math.random() * exclamatoryPool.length)];
    } else if (wordCount <= 2 && randomFactor < 0.6) { // Short phrases in the sentence
         if (candidates.includes(Expression.LittleShocked) && randomFactor < 0.3) nextExpression = Expression.LittleShocked;
         else if (candidates.includes(Expression.Talking)) nextExpression = Expression.Talking;
         else nextExpression = candidates[Math.floor(Math.random() * candidates.length)];
    } 
    else if (complainingPool.length > 0 && randomFactor < 0.5) { 
        nextExpression = complainingPool[Math.floor(Math.random() * complainingPool.length)];
    }
    else if (prevExpression !== Expression.Talking && randomFactor < 0.5) { 
        const emotionalNonComplaining = candidates.filter(exp => exp !== Expression.Talking && !complainingPool.includes(exp));
        if (emotionalNonComplaining.length > 0) {
             nextExpression = emotionalNonComplaining[Math.floor(Math.random() * emotionalNonComplaining.length)];
        } else { 
             nextExpression = candidates[Math.floor(Math.random() * candidates.length)];
        }
    } else { 
        const emotionalCandidates = candidates.filter(exp => exp !== Expression.Talking);
        if (emotionalCandidates.length > 0 && randomFactor < 0.6) { 
            nextExpression = emotionalCandidates[Math.floor(Math.random() * emotionalCandidates.length)];
        } else if (candidates.includes(Expression.Talking)) { 
            nextExpression = Expression.Talking;
        } else { 
            nextExpression = candidates[Math.floor(Math.random() * candidates.length)];
        }
    }
    
    if (!nextExpression || (nextExpression === prevExpression && candidates.length > 1) ) { 
        const fallbackCandidates = ALL_EXPRESSIONS.filter(exp => exp !== prevExpression);
        nextExpression = fallbackCandidates.length > 0 ? fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)] : Expression.Talking;
    }
    if (!nextExpression) nextExpression = Expression.Talking; 

    return nextExpression;
};


export const useExpressionSynthesizer = (
    isPlaying: boolean,
    activeSegmentText: string | undefined,
    currentWordStartTime: number | undefined, // New prop: start time of the current word in ms
    onEmphasize?: () => void 
) => {
    const [currentExpression, setCurrentExpression] = useState<Expression>(Expression.Talking);
    const prevExpressionRef = useRef<Expression>(Expression.Talking);
    
    const wordCounterForCurrentExpression = useRef<number>(0);
    const wordsNeededForChange = useRef<number>(Math.floor(Math.random() * 4) + 2); // 2 to 5 words
    const lastProcessedWordStartTime = useRef<number | undefined>(undefined);
    const lastProcessedSegmentText = useRef<string | undefined>(undefined);
    const shakeCountRef = useRef<number>(0);

    // Effect 1: Handle overall playback state (isPlaying changes)
    useEffect(() => {
        if (!isPlaying) {
            setCurrentExpression(Expression.Talking);
            prevExpressionRef.current = Expression.Talking;
            wordCounterForCurrentExpression.current = 0;
            lastProcessedWordStartTime.current = undefined;
            lastProcessedSegmentText.current = undefined; // Reset for next play
            shakeCountRef.current = 0;
            wordsNeededForChange.current = Math.floor(Math.random() * 4) + 2;
        } else {
            // Reset counters when playback (re)starts
            shakeCountRef.current = 0;
            wordCounterForCurrentExpression.current = 0;
            wordsNeededForChange.current = Math.floor(Math.random() * 4) + 2;
            lastProcessedWordStartTime.current = undefined; // Allow first word of new playback to be processed
            // If activeSegmentText is not yet available, set default.
            // The "new segment" effect will pick a better one if activeSegmentText becomes available.
            if (!activeSegmentText) {
                setCurrentExpression(Expression.Talking);
                prevExpressionRef.current = Expression.Talking;
            }
        }
    }, [isPlaying, activeSegmentText]); // activeSegmentText included to help initialize if play starts mid-segment

    // Effect 2: Handle new segment starting (activeSegmentText changes while playing)
    useEffect(() => {
        if (isPlaying && activeSegmentText && activeSegmentText !== lastProcessedSegmentText.current) {
            lastProcessedSegmentText.current = activeSegmentText;
            wordCounterForCurrentExpression.current = 0; // Reset for the new segment
            wordsNeededForChange.current = Math.floor(Math.random() * 4) + 2;
            lastProcessedWordStartTime.current = undefined; // Critical: allow first word of new segment to be processed by Effect 3

            const nextExpression = _pickNextExpression(activeSegmentText, prevExpressionRef.current);
            setCurrentExpression(nextExpression);
            prevExpressionRef.current = nextExpression;

            if (onEmphasize && STRONG_EXPRESSIONS.includes(nextExpression)) {
                let emphasizeProbability = 0.35; 
                if (shakeCountRef.current < MIN_SHAKES_PER_VIDEO) {
                    emphasizeProbability = 0.50; 
                }
                if (Math.random() < emphasizeProbability) {
                    onEmphasize();
                    shakeCountRef.current++;
                }
            }
        }
    }, [isPlaying, activeSegmentText, onEmphasize]);

    // Effect 3: Handle new word starting (currentWordStartTime changes while playing)
    useEffect(() => {
        if (!isPlaying || currentWordStartTime === undefined || currentWordStartTime === lastProcessedWordStartTime.current) {
            // Not playing, or no new word, or this word was already processed
            return;
        }

        // A new word has started
        lastProcessedWordStartTime.current = currentWordStartTime;
        wordCounterForCurrentExpression.current += 1;

        if (wordCounterForCurrentExpression.current >= wordsNeededForChange.current) {
            // Time to change expression
            if (!activeSegmentText) { 
                setCurrentExpression(Expression.Talking); // Fallback
                prevExpressionRef.current = Expression.Talking;
            } else {
                const nextExpression = _pickNextExpression(activeSegmentText, prevExpressionRef.current);
                setCurrentExpression(nextExpression);
                prevExpressionRef.current = nextExpression;

                if (onEmphasize && STRONG_EXPRESSIONS.includes(nextExpression)) {
                    let emphasizeProbability = 0.30; 
                    if (shakeCountRef.current < MIN_SHAKES_PER_VIDEO) {
                        emphasizeProbability = 0.55; 
                    }
                    if (Math.random() < emphasizeProbability) {
                        onEmphasize();
                        shakeCountRef.current++;
                    }
                }
            }
            // Reset for the new expression's word count cycle
            wordCounterForCurrentExpression.current = 0;
            wordsNeededForChange.current = Math.floor(Math.random() * 4) + 2; // 2 to 5
        }
        // If not time to change, currentExpression remains; wordCounterForCurrentExpression was just incremented.
    }, [isPlaying, currentWordStartTime, activeSegmentText, onEmphasize]);

    return { currentExpression };
};
