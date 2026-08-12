'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';

interface VoiceInputProps {
    onTranscript: (text: string) => void;
    className?: string;
    isListening?: boolean;
    onListeningChange?: (isListening: boolean) => void;
}

const subscribeToBrowserCapability = () => () => undefined;

function getSpeechRecognitionSupport() {
    if (typeof window === 'undefined') return false;
    const browserWindow = window as typeof window & {
        SpeechRecognition?: new () => any;
        webkitSpeechRecognition?: new () => any;
    };
    return Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition);
}

export default function VoiceInput(props: Readonly<VoiceInputProps>) {
    const {
        onTranscript,
        className = '',
        isListening: externalIsListening,
        onListeningChange
    } = props;
    const [internalIsListening, setInternalIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const isSupported = useSyncExternalStore(
        subscribeToBrowserCapability,
        getSpeechRecognitionSupport,
        () => false,
    );

    const isListening = externalIsListening === undefined ? internalIsListening : externalIsListening;

    const handleIsListeningChange = useCallback((value: boolean) => {
        if (externalIsListening === undefined) {
            setInternalIsListening(value);
        }
        onListeningChange?.(value);
    }, [externalIsListening, onListeningChange]);

    useEffect(() => {
        if (!isSupported || typeof window === 'undefined') return;

        const browserWindow = window as typeof window & {
            SpeechRecognition?: new () => any;
            webkitSpeechRecognition?: new () => any;
        };
        const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognitionRef.current = recognition;

        recognition.onstart = () => setError(null);
        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                onTranscript(finalTranscript);
                setError(null);
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            let errorMessage = 'Error listening';
            if (event.error === 'not-allowed') {
                errorMessage = 'Mic access denied';
            } else if (event.error === 'no-speech') {
                return;
            } else if (event.error === 'network') {
                errorMessage = 'Network error';
            }
            setError(errorMessage);
            handleIsListeningChange(false);
        };

        recognition.onend = () => {
            handleIsListeningChange(false);
        };

        return () => {
            recognition.onstart = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            try {
                recognition.stop();
            } catch {
                // Recognition may already be stopped.
            }
            if (recognitionRef.current === recognition) recognitionRef.current = null;
        };
    }, [handleIsListeningChange, isSupported, onTranscript]);

    useEffect(() => {
        const recognition = recognitionRef.current;
        if (!recognition) return;

        if (isListening) {
            try {
                recognition.start();
            } catch {
                // Ignore if recognition is already running.
            }
        } else {
            try {
                recognition.stop();
            } catch {
                // Ignore if recognition is already stopped.
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
        <div className="relative inline-block">
            <button
                type="button"
                onClick={toggleListening}
                className={`p-2 rounded-full transition-all duration-200 flex items-center gap-2 ${isListening
                    ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-400'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    } ${className}`}
                title={isListening ? 'Stop listening' : 'Start voice input'}
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
            {error && (
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-red-100 text-red-600 px-2 py-1 rounded text-xs whitespace-nowrap shadow-md border border-red-200 z-10">
                    {error}
                </div>
            )}
        </div>
    );
}
