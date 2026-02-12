
const ADJECTIVES = [
    'Neon', 'Cyber', 'Crypto', 'Digital', 'Atomic', 'Cosmic', 'Hyper', 'Sonic',
    'Pixel', 'Meta', 'Techno', 'Quantum', 'Virtual', 'Electric', 'Solar', 'Lunar',
    'Phantom', 'Ninja', 'Shadow', 'Rapid', 'Turbo', 'Glitch', 'Laser', 'Future'
];

const NOUNS = [
    'Tiger', 'Dragon', 'Eagle', 'Wolf', 'Shark', 'Whale', 'Falcon', 'Bear',
    'Knight', 'Wizard', 'Ghost', 'Bot', 'Droid', 'Pilot', 'Racer', 'Surfer',
    'Punk', 'Coder', 'Hacker', 'Miner', 'Token', 'Coin', 'Star', 'Rocket'
];

export function generateRandomUsername(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 999);

    return `${adj}${noun}${num}`;
}
