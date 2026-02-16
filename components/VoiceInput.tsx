'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceInputProps {
    onTranscript: (text: string) => void;
    className?: string;
    isListening?: boolean;
    onListeningChange?: (isListening: boolean) => void;
}

export default function VoiceInput({
    onTranscript,
    className = '',
    isListening: externalIsListening,
    onListeningChange
}: VoiceInputProps) {
    const [internalIsListening, setInternalIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const recognitionRef = useRef<any>(null);

    const isListening = typeof externalIsListening !== 'undefined' ? externalIsListening : internalIsListening;

    const handleIsListeningChange = useCallback((value: boolean) => {
        if (typeof externalIsListening === 'undefined') {
            setInternalIsListening(value);
        }
        onListeningChange?.(value);
    }, [externalIsListening, onListeningChange]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                setIsSupported(true);
                recognitionRef.current = new SpeechRecognition();
                recognitionRef.current.continuous = true;
                recognitionRef.current.interimResults = true;
                recognitionRef.current.lang = 'en-US';

                recognitionRef.current.onresult = (event: any) => {
                    let finalTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        }
                    }
                    if (finalTranscript) {
                        onTranscript(finalTranscript);
                    }
                };

                recognitionRef.current.onerror = (event: any) => {
                    console.error('Speech recognition error', event.error);
                    handleIsListeningChange(false);
                };

                recognitionRef.current.onend = () => {
                    handleIsListeningChange(false);
                };
            }
        }
    }, [onTranscript, handleIsListeningChange]);

    useEffect(() => {
        if (recognitionRef.current) {
            if (isListening) {
                try {
                    recognitionRef.current.start();
                } catch (e) {
                    // Ignore error if already started
                }
            } else {
                try {
                    recognitionRef.current.stop();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }, [isListening]);


    const toggleListening = () => {
        handleIsListeningChange(!isListening);
    };

    if (!isSupported) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={toggleListening}
            className={`p-2 rounded-full transition-all duration-200 flex items-center gap-2 ${isListening
                    ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-400'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                } ${className}`}
            title={isListening ? "Stop listening" : "Start voice input"}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {isListening && <span className="text-xs font-medium">Listening...</span>}
        </button>
    );
}
