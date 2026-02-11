/**
 * Custom hook for Web Speech API (STT/TTS) with Audio Analysis
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeech() {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(true);
    const [audioLevel, setAudioLevel] = useState(0); // 0-1 normalized volume level

    const recognitionRef = useRef(null);
    const synthRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const streamRef = useRef(null);

    // Start audio analysis for voice reactivity
    const startAudioAnalysis = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            // Animation loop to get volume
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateLevel = () => {
                if (!analyserRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArray);

                // Calculate average volume (0-255) and normalize to 0-1
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                const normalized = Math.min(average / 128, 1); // Normalize to 0-1 range

                setAudioLevel(normalized);
                animationFrameRef.current = requestAnimationFrame(updateLevel);
            };

            updateLevel();
        } catch (err) {
            console.error('Audio analysis error:', err);
        }
    }, []);

    // Stop audio analysis
    const stopAudioAnalysis = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevel(0);
    }, []);

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
        recognition.lang = 'en-IN';

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
            stopAudioAnalysis();
        };
    }, [stopAudioAnalysis]);

    // Start listening with audio analysis
    const startListening = useCallback(() => {
        if (!recognitionRef.current) return;

        setTranscript('');
        setError(null);

        // Start audio analysis for visual feedback
        startAudioAnalysis();

        try {
            recognitionRef.current.start();
        } catch (err) {
            if (err.name !== 'InvalidStateError') {
                setError(err.message);
            }
        }
    }, [startAudioAnalysis]);

    // Stop listening
    const stopListening = useCallback(() => {
        if (!recognitionRef.current) return;

        stopAudioAnalysis();

        try {
            recognitionRef.current.stop();
        } catch (err) {
            // Ignore errors on stop
        }
    }, [stopAudioAnalysis]);

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

        synthRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.lang || 'en-IN';
        utterance.rate = options.rate || 1.15;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

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
        audioLevel, // New: 0-1 normalized audio volume for visualizations
        startListening,
        stopListening,
        toggleListening,
        speak,
        stopSpeaking,
        setTranscript,
    };
}
