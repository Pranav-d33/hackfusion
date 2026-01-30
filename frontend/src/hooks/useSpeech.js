/**
 * Custom hook for Web Speech API (STT/TTS)
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeech() {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(true);

    const recognitionRef = useRef(null);
    const synthRef = useRef(null);

    // Initialize speech recognition
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setIsSupported(false);
            setError('Speech recognition not supported in this browser');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-IN'; // Indian English

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            setTranscript(finalTranscript || interimTranscript);
        };

        recognition.onerror = (event) => {
            setIsListening(false);
            if (event.error === 'not-allowed') {
                setError('Microphone access denied. Please allow microphone access.');
            } else if (event.error !== 'aborted') {
                setError(`Speech recognition error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        synthRef.current = window.speechSynthesis;

        return () => {
            recognition.abort();
        };
    }, []);

    // Start listening
    const startListening = useCallback(() => {
        if (!recognitionRef.current) return;

        setTranscript('');
        setError(null);

        try {
            recognitionRef.current.start();
        } catch (err) {
            // Already started
            if (err.name !== 'InvalidStateError') {
                setError(err.message);
            }
        }
    }, []);

    // Stop listening
    const stopListening = useCallback(() => {
        if (!recognitionRef.current) return;

        try {
            recognitionRef.current.stop();
        } catch (err) {
            // Ignore errors on stop
        }
    }, []);

    // Toggle listening
    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    }, [isListening, startListening, stopListening]);

    // Speak text using TTS
    const speak = useCallback((text, options = {}) => {
        if (!synthRef.current) return;

        // Cancel any ongoing speech
        synthRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.lang || 'en-IN';
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

        // Try to find an Indian English voice
        const voices = synthRef.current.getVoices();
        const indianVoice = voices.find(v => v.lang.includes('en-IN'));
        const englishVoice = voices.find(v => v.lang.includes('en'));

        if (indianVoice) {
            utterance.voice = indianVoice;
        } else if (englishVoice) {
            utterance.voice = englishVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            if (options.onEnd) {
                options.onEnd();
            }
        };
        utterance.onerror = () => setIsSpeaking(false);

        synthRef.current.speak(utterance);
    }, []);

    // Stop speaking
    const stopSpeaking = useCallback(() => {
        if (!synthRef.current) return;
        synthRef.current.cancel();
        setIsSpeaking(false);
    }, []);

    return {
        isListening,
        isSpeaking,
        transcript,
        error,
        isSupported,
        startListening,
        stopListening,
        toggleListening,
        speak,
        stopSpeaking,
        setTranscript,
    };
}
