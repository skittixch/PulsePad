export type DrumPattern = {
    kick?: number[];
    snare?: number[];
    hat?: number[];
    bass?: number[];
};

export const DRUM_ARCHIVE: Record<string, DrumPattern> = {
    // TECHNO
    "techno_01": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
    "techno_02": { kick: [0, 4, 8, 12], snare: [4, 8, 12, 16], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "techno_03": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [1, 3, 5, 7, 9, 11, 13, 15] },
    "techno_industrial": { kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7] },

    // HOUSE
    "house_classic": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
    "house_deep": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "house_garage": { kick: [0, 4, 8, 10, 12], snare: [4, 12], hat: [2, 5, 6, 10, 13, 14] },
    "house_chicago": { kick: [0, 4, 8, 12], snare: [4, 10, 12], hat: [2, 6, 10, 14] },

    // TRAP
    "trap_01": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "trap_02": { kick: [0, 3, 8], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    "trap_03": { kick: [0, 10, 13], snare: [4, 12], hat: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14] },
    "trap_atl": { kick: [0, 6, 9, 14], snare: [8], hat: [0, 1, 2, 3, 4, 5, 6, 7] },

    // HIP HOP
    "hip_hop_boom_bap": { kick: [0, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "hip_hop_jdilla": { kick: [0, 3, 9, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "hip_hop_lofi": { kick: [0, 6, 13], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "hip_hop_west": { kick: [0, 4, 8, 10], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7] },

    // ROCK
    "rock_standard": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "rock_punk": { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "rock_heavy": { kick: [0, 2, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "rock_indie": { kick: [0, 6, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },

    // DISCO / FUNK
    "disco_01": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "funk_01": { kick: [0, 10], snare: [4, 12, 15], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "funk_break": { kick: [0, 3, 8, 11], snare: [4, 12, 14], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },

    // DNB / JUNGLE
    "dnb_standard": { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "jungle_classic": { kick: [0, 7, 10], snare: [4, 9, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    "dnb_break": { kick: [0, 8, 13], snare: [4, 12], hat: [0, 2, 5, 8, 10, 13] },

    // GARAGE / 2-STEP
    "garage_2step": { kick: [0, 10], snare: [4, 12], hat: [2, 6, 7, 10, 14, 15] },
    "garage_4x4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 5, 6, 10, 13, 14] },

    // EXTRA VARIATIONS
    "half_time_01": { kick: [0, 14], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "reggae_one_drop": { kick: [8], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "reggae_steppers": { kick: [0, 4, 8, 12], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "minimal_glitch": { kick: [0, 9], snare: [13], hat: [1, 5, 11, 15] },
    "latin_groove": { kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 1, 4, 5, 8, 9, 12, 13] },
    "electro_808": { kick: [0, 7, 8, 15], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
};
