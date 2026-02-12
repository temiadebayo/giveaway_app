/**
 * Giveaway App - Device Fingerprinting Module
 * 
 * Collects browser signals to generate a unique device fingerprint.
 * This is used for fraud prevention and multi-account detection.
 * 
 * Usage:
 *   import { generateFingerprint, getDeviceInfo } from '@/lib/fingerprint';
 *   
 *   const fingerprint = await generateFingerprint();
 *   console.log(fingerprint.hash); // Unique device hash
 */

// ============================================
// TYPES
// ============================================

export interface CanvasFingerprint {
    hash: string;
    dataUrl: string;
}

export interface WebGLInfo {
    vendor: string;
    renderer: string;
    unmaskedVendor: string;
    unmaskedRenderer: string;
}

export interface AudioFingerprint {
    hash: string;
    sampleRate: number;
}

export interface ScreenInfo {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelRatio: number;
    orientation: string;
}

export interface BrowserInfo {
    userAgent: string;
    language: string;
    languages: string[];
    platform: string;
    cookiesEnabled: boolean;
    doNotTrack: boolean;
    hardwareConcurrency: number;
    deviceMemory: number;
    maxTouchPoints: number;
}

export interface TimezoneInfo {
    timezone: string;
    timezoneOffset: number;
}

export interface DeviceFingerprint {
    hash: string;
    components: {
        canvas: CanvasFingerprint;
        webgl: WebGLInfo;
        audio: AudioFingerprint;
        screen: ScreenInfo;
        browser: BrowserInfo;
        timezone: TimezoneInfo;
        fonts: string[];
        plugins: string[];
    };
    confidence: number;
    generatedAt: string;
}

// ============================================
// HASH UTILITY
// ============================================

async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function murmurhash3(str: string, seed: number = 0): number {
    let h1 = seed;
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;

    for (let i = 0; i < str.length; i++) {
        let k1 = str.charCodeAt(i);
        k1 = Math.imul(k1, c1);
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = Math.imul(k1, c2);
        h1 ^= k1;
        h1 = (h1 << 13) | (h1 >>> 19);
        h1 = Math.imul(h1, 5) + 0xe6546b64;
    }

    h1 ^= str.length;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1 >>> 0;
}

// ============================================
// CANVAS FINGERPRINT
// ============================================

async function getCanvasFingerprint(): Promise<CanvasFingerprint> {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return { hash: 'unsupported', dataUrl: '' };
        }

        // Draw various elements to create unique pattern
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);

        ctx.fillStyle = '#069';
        ctx.font = '11pt Arial';
        ctx.fillText('Giveaway App 🎮', 2, 15);

        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.font = '18pt Arial';
        ctx.fillText('Giveaway App 🎮', 4, 45);

        // Add gradient
        const gradient = ctx.createLinearGradient(0, 0, 280, 0);
        gradient.addColorStop(0, '#9506FA');
        gradient.addColorStop(1, '#00D4FF');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 50, 280, 10);

        // Add some curves
        ctx.beginPath();
        ctx.arc(50, 50, 50, 0, Math.PI * 2, false);
        ctx.closePath();
        ctx.stroke();

        const dataUrl = canvas.toDataURL();
        const hash = await sha256(dataUrl);

        return { hash, dataUrl };
    } catch (e) {
        return { hash: 'error', dataUrl: '' };
    }
}

// ============================================
// WEBGL FINGERPRINT
// ============================================

function getWebGLInfo(): WebGLInfo {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!gl || !(gl instanceof WebGLRenderingContext)) {
            return {
                vendor: 'unsupported',
                renderer: 'unsupported',
                unmaskedVendor: 'unsupported',
                unmaskedRenderer: 'unsupported',
            };
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

        return {
            vendor: gl.getParameter(gl.VENDOR) || '',
            renderer: gl.getParameter(gl.RENDERER) || '',
            unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '',
            unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '',
        };
    } catch (e) {
        return {
            vendor: 'error',
            renderer: 'error',
            unmaskedVendor: 'error',
            unmaskedRenderer: 'error',
        };
    }
}

// ============================================
// AUDIO FINGERPRINT
// ============================================

async function getAudioFingerprint(): Promise<AudioFingerprint> {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) {
            return { hash: 'unsupported', sampleRate: 0 };
        }

        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const analyser = context.createAnalyser();
        const gain = context.createGain();
        const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

        // Track if we've already cleaned up to prevent double-close error
        let isClosed = false;
        const cleanup = () => {
            if (isClosed) return;
            isClosed = true;
            try {
                oscillator.stop();
                scriptProcessor.disconnect();
                if (context.state !== 'closed') {
                    context.close();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        };

        gain.gain.value = 0; // Mute
        oscillator.type = 'triangle';
        oscillator.frequency.value = 10000;

        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gain);
        gain.connect(context.destination);

        oscillator.start(0);

        return new Promise((resolve) => {
            scriptProcessor.onaudioprocess = (event) => {
                const data = event.inputBuffer.getChannelData(0);
                const sum = data.reduce((acc, val) => acc + Math.abs(val), 0);
                const hash = murmurhash3(sum.toString()).toString(16);
                const sampleRate = context.sampleRate;

                cleanup();
                resolve({ hash, sampleRate });
            };

            // Timeout fallback
            setTimeout(() => {
                const sampleRate = context.sampleRate;
                cleanup();
                resolve({ hash: 'timeout', sampleRate });
            }, 1000);
        });
    } catch (e) {
        return { hash: 'error', sampleRate: 0 };
    }
}

// ============================================
// SCREEN INFO
// ============================================

function getScreenInfo(): ScreenInfo {
    return {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        orientation: window.screen.orientation?.type || 'unknown',
    };
}

// ============================================
// BROWSER INFO
// ============================================

function getBrowserInfo(): BrowserInfo {
    return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: [...(navigator.languages || [navigator.language])],
        platform: navigator.platform,
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack === '1',
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: (navigator as any).deviceMemory || 0,
        maxTouchPoints: navigator.maxTouchPoints || 0,
    };
}

// ============================================
// TIMEZONE INFO
// ============================================

function getTimezoneInfo(): TimezoneInfo {
    return {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
    };
}

// ============================================
// INSTALLED FONTS DETECTION
// ============================================

function getInstalledFonts(): string[] {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testFonts = [
        'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
        'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
        'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Webdings',
        'Roboto', 'Open Sans', 'Inter', 'Helvetica', 'Segoe UI'
    ];

    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const detectedFonts: string[] = [];

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return [];

        const baseMeasures: Record<string, number> = {};

        // Measure base fonts
        for (const baseFont of baseFonts) {
            ctx.font = `${testSize} ${baseFont}`;
            baseMeasures[baseFont] = ctx.measureText(testString).width;
        }

        // Test each font
        for (const font of testFonts) {
            for (const baseFont of baseFonts) {
                ctx.font = `${testSize} "${font}", ${baseFont}`;
                const width = ctx.measureText(testString).width;
                if (width !== baseMeasures[baseFont]) {
                    detectedFonts.push(font);
                    break;
                }
            }
        }
    } catch (e) { }

    return detectedFonts;
}

// ============================================
// PLUGINS DETECTION
// ============================================

function getPlugins(): string[] {
    const plugins: string[] = [];

    try {
        for (let i = 0; i < navigator.plugins.length; i++) {
            const plugin = navigator.plugins[i];
            plugins.push(`${plugin.name}::${plugin.filename}`);
        }
    } catch (e) { }

    return plugins;
}

// ============================================
// MAIN FINGERPRINT GENERATOR
// ============================================

export async function generateFingerprint(): Promise<DeviceFingerprint> {
    const [canvas, audio] = await Promise.all([
        getCanvasFingerprint(),
        getAudioFingerprint(),
    ]);

    const webgl = getWebGLInfo();
    const screen = getScreenInfo();
    const browser = getBrowserInfo();
    const timezone = getTimezoneInfo();
    const fonts = getInstalledFonts();
    const plugins = getPlugins();

    const components = {
        canvas,
        webgl,
        audio,
        screen,
        browser,
        timezone,
        fonts,
        plugins,
    };

    // Create stable hash from components
    const stableString = JSON.stringify({
        canvasHash: canvas.hash,
        webglRenderer: webgl.unmaskedRenderer,
        audioHash: audio.hash,
        screenRes: `${screen.width}x${screen.height}`,
        pixelRatio: screen.pixelRatio,
        timezone: timezone.timezone,
        platform: browser.platform,
        cores: browser.hardwareConcurrency,
        memory: browser.deviceMemory,
        fonts: fonts.sort(),
    });

    const hash = await sha256(stableString);

    // Calculate confidence (how many signals we got)
    let confidence = 0;
    if (canvas.hash !== 'error' && canvas.hash !== 'unsupported') confidence += 25;
    if (webgl.unmaskedRenderer !== 'error') confidence += 20;
    if (audio.hash !== 'error' && audio.hash !== 'unsupported') confidence += 15;
    if (screen.width > 0) confidence += 10;
    if (fonts.length > 0) confidence += 15;
    if (browser.hardwareConcurrency > 0) confidence += 10;
    if (timezone.timezone) confidence += 5;

    return {
        hash,
        components,
        confidence,
        generatedAt: new Date().toISOString(),
    };
}

// ============================================
// HELPER: GET DEVICE INFO SUMMARY
// ============================================

export function getDeviceInfo(): {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    os: string;
    browser: string;
} {
    const ua = navigator.userAgent;

    const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
    const isDesktop = !isMobile && !isTablet;

    let os = 'Unknown';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iOS|iPhone|iPad|iPod/i.test(ua)) os = 'iOS';

    let browser = 'Unknown';
    if (/Chrome/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Edge|Edg/i.test(ua)) browser = 'Edge';
    else if (/Opera|OPR/i.test(ua)) browser = 'Opera';

    return { isMobile, isTablet, isDesktop, os, browser };
}

// ============================================
// HELPER: COMPARE FINGERPRINTS
// ============================================

export function compareFingerprints(
    fp1: DeviceFingerprint,
    fp2: DeviceFingerprint
): { similarity: number; matchingComponents: string[] } {
    const matchingComponents: string[] = [];
    let matchScore = 0;
    let totalWeight = 0;

    // Canvas hash (high weight)
    totalWeight += 30;
    if (fp1.components.canvas.hash === fp2.components.canvas.hash) {
        matchScore += 30;
        matchingComponents.push('canvas');
    }

    // WebGL (high weight)
    totalWeight += 25;
    if (fp1.components.webgl.unmaskedRenderer === fp2.components.webgl.unmaskedRenderer) {
        matchScore += 25;
        matchingComponents.push('webgl');
    }

    // Audio (medium weight)
    totalWeight += 15;
    if (fp1.components.audio.hash === fp2.components.audio.hash) {
        matchScore += 15;
        matchingComponents.push('audio');
    }

    // Screen (medium weight)
    totalWeight += 15;
    if (
        fp1.components.screen.width === fp2.components.screen.width &&
        fp1.components.screen.height === fp2.components.screen.height
    ) {
        matchScore += 15;
        matchingComponents.push('screen');
    }

    // Timezone (low weight)
    totalWeight += 10;
    if (fp1.components.timezone.timezone === fp2.components.timezone.timezone) {
        matchScore += 10;
        matchingComponents.push('timezone');
    }

    // Platform (low weight)
    totalWeight += 5;
    if (fp1.components.browser.platform === fp2.components.browser.platform) {
        matchScore += 5;
        matchingComponents.push('platform');
    }

    const similarity = Math.round((matchScore / totalWeight) * 100);
    return { similarity, matchingComponents };
}
