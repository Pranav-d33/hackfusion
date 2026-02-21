/**
 * Custom hook for Web Speech API (STT/TTS) with Audio Analysis
 * Auto-detects language and displays native scripts (Hindi, Tamil, etc.)
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

const PRIORITY_LANGS = ['en-IN', 'de-DE', 'ar-SA', 'hi-IN'];
const BONUS_LANGS = ['ta-IN', 'te-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'or-IN'];



// Precompiled regex patterns for faster script detection
const SCRIPT_PATTERNS = [
    { regex: /[\u0900-\u097F]/, lang: 'hi-IN', script: 'Devanagari' },  // Hindi/Marathi
    { regex: /[\u0B80-\u0BFF]/, lang: 'ta-IN', script: 'Tamil' },       // Tamil
    { regex: /[\u0C00-\u0C7F]/, lang: 'te-IN', script: 'Telugu' },      // Telugu
    { regex: /[\u0980-\u09FF]/, lang: 'bn-IN', script: 'Bengali' },     // Bengali
    { regex: /[\u0A80-\u0AFF]/, lang: 'gu-IN', script: 'Gujarati' },    // Gujarati
    { regex: /[\u0C80-\u0CFF]/, lang: 'kn-IN', script: 'Kannada' },     // Kannada
    { regex: /[\u0D00-\u0D7F]/, lang: 'ml-IN', script: 'Malayalam' },   // Malayalam
    { regex: /[\u0A00-\u0A7F]/, lang: 'pa-IN', script: 'Gurmukhi' },    // Punjabi
    { regex: /[\u0B00-\u0B7F]/, lang: 'or-IN', script: 'Odia' },        // Odia
    { regex: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/, lang: 'ar-SA', script: 'Arabic' }, // Arabic + extended/presentation blocks
];

const LATIN_RESULT = { lang: 'en-IN', script: 'Latin', direction: 'ltr' };

const GERMAN_HINTS = /\b(und|ich|nicht|bitte|danke|für|mit|der|die|das|ein|eine|habe|haben|brauche|möchte|medizin|tabletten|bestellen|warenkorb|kasse|ja|nein)\b/i;
const ARABIC_LATIN_HINTS = /\b(salam|marhaba|shukran|yalla|tamam|aywa)\b/i;
const HINGLISH_HINTS = /\b(mujhe|chahiye|karo|dena|wala|haan|nahi|kitna|dawai|tablet|pehla|dusra|aur|bhi|hai|ke liye|manga|ruko|band)\b/i;
const ENGLISH_HINTS = /\b(the|and|please|need|add|medicine|medicines|cart|order|have|want|for|to|my)\b/i;

function normalizeLanguageTag(lang) {
    if (!lang) return '';
    const clean = String(lang).replace('_', '-');
    const [base, region] = clean.split('-');
    if (!base) return '';
    return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
}

function pickInitialLanguage() {
    if (typeof navigator === 'undefined') {
        return PRIORITY_LANGS[0];
    }

    const browserLangs = [
        ...(Array.isArray(navigator.languages) ? navigator.languages : []),
        navigator.language,
    ]
        .map(normalizeLanguageTag)
        .filter(Boolean);

    const supported = [...PRIORITY_LANGS, ...BONUS_LANGS];

    for (const browserLang of browserLangs) {
        const exact = supported.find(l => l.toLowerCase() === browserLang.toLowerCase());
        if (exact) return exact;

        const base = browserLang.split('-')[0];
        const byBase = supported.find(l => l.toLowerCase().startsWith(`${base}-`));
        if (byBase) return byBase;
    }

    return PRIORITY_LANGS[0];
}

// Ultra-fast script detection - checks first 50 chars only for speed
function detectScript(text) {
    if (!text || text.length === 0) return LATIN_RESULT;

    // Only check first 50 characters for speed (script is usually consistent)
    const sample = text.length > 50 ? text.slice(0, 50) : text;

    for (let i = 0; i < SCRIPT_PATTERNS.length; i++) {
        if (SCRIPT_PATTERNS[i].regex.test(sample)) {
            const { lang, script } = SCRIPT_PATTERNS[i];
            return { lang, script, direction: script === 'Arabic' ? 'rtl' : 'ltr' };
        }
    }

    return LATIN_RESULT;
}

function detectLanguageFromText(text, fallbackLang) {
    const scriptDetection = detectScript(text);
    if (scriptDetection.script !== 'Latin') {
        return scriptDetection;
    }

    const sample = (text || '').trim();
    if (!sample) return { ...LATIN_RESULT, lang: fallbackLang || LATIN_RESULT.lang };

    if (GERMAN_HINTS.test(sample) || /[äöüß]/i.test(sample)) {
        return { lang: 'de-DE', script: 'Latin', direction: 'ltr' };
    }

    // Arabic spoken/transliterated into Latin script by some STT engines
    if (ARABIC_LATIN_HINTS.test(sample)) {
        return { lang: 'ar-SA', script: 'Latin', direction: 'rtl' };
    }

    // Hinglish (Latin-script Hindi) → detected as hi-IN but TTS uses English
    if (HINGLISH_HINTS.test(sample)) {
        return { lang: 'hi-IN', script: 'Latin', direction: 'ltr' };
    }

    if (ENGLISH_HINTS.test(sample)) {
        return { lang: 'en-IN', script: 'Latin', direction: 'ltr' };
    }

    return { lang: fallbackLang || LATIN_RESULT.lang, script: 'Latin', direction: 'ltr' };
}

export function useSpeech() {
    const initialLanguage = useMemo(() => pickInitialLanguage(), []);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(true);
    const [audioLevel, setAudioLevel] = useState(0);
    const [detectedLanguage, setDetectedLanguage] = useState(initialLanguage);
    const [scriptInfo, setScriptInfo] = useState({ ...LATIN_RESULT, lang: initialLanguage });
    const [voices, setVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState(null);
    const [manualLanguage, setManualLanguage] = useState(null);

    const recognitionRef = useRef(null);
    const synthRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const streamRef = useRef(null);
    const lastDetectionRef = useRef({ ...LATIN_RESULT, lang: initialLanguage }); // Cache last detected state to reduce jitter

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

    // Load available TTS voices
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const synth = window.speechSynthesis;
        const loadVoices = () => {
            const available = synth.getVoices();
            if (available.length > 0) {
                setVoices(available);
                if (!selectedVoice) {
                    const defaultVoice = available.find(v => v.lang.startsWith('en')) || available[0];
                    setSelectedVoice(defaultVoice);
                }
            }
        };
        loadVoices();
        synth.onvoiceschanged = loadVoices;
        return () => { synth.onvoiceschanged = null; };
    }, []);

    // Set a specific voice
    const setVoice = useCallback((voice) => {
        setSelectedVoice(voice);
    }, []);

    const setPreferredLanguage = useCallback((langCode) => {
        const normalized = normalizeLanguageTag(langCode) || null;
        const langToUse = normalized || initialLanguage;
        const direction = (langToUse || '').toLowerCase().startsWith('ar') ? 'rtl' : 'ltr';

        setManualLanguage(normalized);
        setDetectedLanguage(langToUse);
        const info = { lang: langToUse, script: 'Latin', direction };
        setScriptInfo(info);
        lastDetectionRef.current = info;

        // Update recognition immediately if active
        if (recognitionRef.current) {
            recognitionRef.current.lang = langToUse;
        }
    }, [initialLanguage]);

    // Initialize speech recognition with auto language detection
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
        recognition.maxAlternatives = 1;

        // Dynamic default based on browser + priority languages (EN, DE, AR)
        recognition.lang = manualLanguage || initialLanguage;

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
            recognition.lang = manualLanguage || detectedLanguage || initialLanguage;
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

            const currentText = finalTranscript || interimTranscript;
            setTranscript(currentText);

            // Dynamic language + script detection with stability
            const detected = detectLanguageFromText(currentText, recognition.lang || manualLanguage || detectedLanguage || initialLanguage);

            // If user forced a language, keep that but still update script/direction for rendering
            if (manualLanguage) {
                const forced = {
                    ...detected,
                    lang: manualLanguage,
                    direction: manualLanguage.toLowerCase().startsWith('ar') ? 'rtl' : detected.direction,
                };
                lastDetectionRef.current = forced;
                setScriptInfo(forced);
                setDetectedLanguage(manualLanguage);
                return;
            }

            // Update only when meaningful changes happen (auto mode)
            if (
                detected.script !== lastDetectionRef.current.script ||
                detected.lang !== lastDetectionRef.current.lang ||
                detected.direction !== lastDetectionRef.current.direction
            ) {
                lastDetectionRef.current = detected;
                setScriptInfo(detected);
                setDetectedLanguage(detected.lang);

                // Keep recognizer aligned for the next phrase/session
                if (recognition.lang !== detected.lang) {
                    recognition.lang = detected.lang;
                }
            }
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
    }, [detectedLanguage, initialLanguage, stopAudioAnalysis, manualLanguage]);

    // Start listening with audio analysis
    const startListening = useCallback(() => {
        if (!recognitionRef.current) return;

        setTranscript('');
        setError(null);
        const langToUse = manualLanguage || detectedLanguage || initialLanguage;
        setScriptInfo(prev => ({ ...prev, lang: langToUse, direction: langToUse.toLowerCase().startsWith('ar') ? 'rtl' : 'ltr' }));

        if (recognitionRef.current?.lang !== langToUse) {
            recognitionRef.current.lang = langToUse;
        }

        // Start audio analysis for visual feedback
        startAudioAnalysis();

        try {
            recognitionRef.current.start();
        } catch (err) {
            if (err.name !== 'InvalidStateError') {
                setError(err.message);
            }
        }
    }, [detectedLanguage, initialLanguage, manualLanguage, startAudioAnalysis]);

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

        // Detect language from text content as a fallback
        const textLangDetection = detectScript(text);
        const textLang = textLangDetection.script !== 'Latin' ? textLangDetection.lang : null;

        const utterance = new SpeechSynthesisUtterance(text);
        // Priority: explicit option > detected from text > STT detected > initial
        const requestedLang = options.lang || textLang || detectedLanguage || initialLanguage;
        utterance.lang = requestedLang;
        utterance.rate = options.rate || 1.1;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

        const availableVoices = synthRef.current.getVoices();
        const requestedBase = requestedLang.split('-')[0].toLowerCase();

        // If user manually selected a voice AND it matches the requested language, use it
        const selectedMatchesLang = selectedVoice &&
            selectedVoice.lang.toLowerCase().startsWith(`${requestedBase}-`);

        // Find best voice for the requested language
        const exactVoice = availableVoices.find(v => v.lang.toLowerCase() === requestedLang.toLowerCase());
        const prefixVoice = availableVoices.find(v => v.lang.toLowerCase().startsWith(`${requestedBase}-`));
        const englishVoice = availableVoices.find(v =>
            v.lang.toLowerCase() === 'en-in' || v.lang.toLowerCase() === 'en_in'
        ) || availableVoices.find(v => v.lang.toLowerCase().startsWith('en-'));

        // Use selected voice ONLY if it matches requested language; otherwise pick best match
        utterance.voice = (selectedMatchesLang ? selectedVoice : null)
            || exactVoice || prefixVoice || englishVoice || null;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            if (options.onEnd) {
                options.onEnd();
            }
        };
        utterance.onerror = () => setIsSpeaking(false);

        synthRef.current.speak(utterance);
    }, [detectedLanguage, initialLanguage, selectedVoice]);

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
        audioLevel,
        // Auto-detected language info
        detectedLanguage,
        scriptInfo,
        manualLanguage,
        // Voice management
        voices,
        selectedVoice,
        setVoice,
        setPreferredLanguage,
        // Actions
        startListening,
        stopListening,
        toggleListening,
        speak,
        stopSpeaking,
        setTranscript,
    };
}
