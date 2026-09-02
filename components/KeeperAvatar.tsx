import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'motion/react';

export type KeeperState = 'idle' | 'listening' | 'thinking' | 'success' | 'lazy' | 'petting';

export interface KeeperAvatarProps {
    state?: KeeperState;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
    showBadge?: boolean;
    interactive?: boolean;
    className?: string;
    onClick?: () => void;
    overrideBadge?: React.ReactNode;
}

const KEEPER_IMG_SRC = '/keeper_avatar.jpg';

export const KeeperAvatar: React.FC<KeeperAvatarProps> = ({
    state = 'idle',
    size = 'md',
    showBadge = true,
    interactive = true,
    className = '',
    onClick,
    overrideBadge
}) => {
    const [isPetted, setIsPetted] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // If locally petted, temporary override state to 'petting'
    const currentState: KeeperState = isPetted ? 'petting' : state;

    useEffect(() => {
        if (isPetted) {
            const timer = setTimeout(() => {
                setIsPetted(false);
            }, 2200);
            return () => clearTimeout(timer);
        }
    }, [isPetted]);

    const handleClick = (e: React.MouseEvent) => {
        if (interactive) {
            setIsPetted(true);
        }
        if (onClick) {
            onClick();
        }
    };

    // Size dimensions & typography
    const sizeConfig = {
        xs: {
            box: 'w-5 h-5 rounded-full',
            border: 'border',
            imgFocal: 'object-[center_12%]',
            badgeSize: 'w-2 h-2 text-[7px]',
            badgeOffset: '-bottom-0.5 -right-0.5',
            zzzOffset: '-top-2 -right-1',
            sparkleOffset: '-top-1.5 -right-1.5'
        },
        sm: {
            box: 'w-7 h-7 rounded-xl',
            border: 'border',
            imgFocal: 'object-[center_12%]',
            badgeSize: 'w-2.5 h-2.5 text-[8px]',
            badgeOffset: '-bottom-0.5 -right-0.5',
            zzzOffset: '-top-2.5 -right-1',
            sparkleOffset: '-top-2 -right-2'
        },
        md: {
            box: 'w-8 h-8 rounded-full',
            border: 'border-2',
            imgFocal: 'object-[center_12%]',
            badgeSize: 'w-3 h-3 text-[9px]',
            badgeOffset: 'bottom-0 right-0',
            zzzOffset: '-top-3 -right-1.5',
            sparkleOffset: '-top-2.5 -right-2'
        },
        lg: {
            box: 'w-10 h-10 rounded-xl',
            border: 'border-2',
            imgFocal: 'object-[center_12%]',
            badgeSize: 'w-3.5 h-3.5 text-[10px]',
            badgeOffset: 'bottom-0 right-0',
            zzzOffset: '-top-3.5 -right-1.5',
            sparkleOffset: '-top-3 -right-2.5'
        },
        hero: {
            box: 'w-20 h-20 rounded-full',
            border: 'border-3',
            imgFocal: 'object-[center_20%]',
            badgeSize: 'w-6 h-6 text-xs',
            badgeOffset: 'bottom-0 right-0',
            zzzOffset: '-top-5 -right-2',
            sparkleOffset: '-top-4 -right-3'
        }
    }[size];

    // Animation variants based on Keeper's interaction state
    const avatarVariants: Variants = {
        idle: {
            scale: 1,
            y: 0,
            rotate: 0,
            transition: { type: 'spring' as const, stiffness: 300, damping: 20 }
        },
        listening: {
            scale: 1.05,
            y: -2,
            rotate: [0, -1.5, 1.5, 0],
            transition: {
                rotate: { repeat: Infinity, duration: 3.5, ease: 'easeInOut' },
                scale: { duration: 0.2 },
                y: { duration: 0.2 }
            }
        },
        thinking: {
            scale: [1, 1.04, 1],
            y: [-1, 1, -1],
            rotate: [-4, 4, -4],
            transition: {
                rotate: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' },
                scale: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' },
                y: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' }
            }
        },
        success: {
            scale: [1, 1.12, 0.98, 1.04, 1],
            y: [0, -7, 0, -3, 0],
            rotate: [0, -6, 6, -3, 0],
            transition: {
                duration: 0.7,
                ease: 'easeOut'
            }
        },
        lazy: {
            scale: [1, 0.96, 1],
            y: [0, 2, 0],
            rotate: [0, 1, 0],
            transition: {
                repeat: Infinity,
                duration: 3.8,
                ease: 'easeInOut'
            }
        },
        petting: {
            scale: [1, 1.16, 0.95, 1.1, 1],
            y: [0, -8, 2, -4, 0],
            rotate: [-8, 8, -6, 6, 0],
            transition: {
                duration: 0.9,
                ease: 'easeOut'
            }
        }
    };

    // State-specific ring / border styles
    const getRingStyle = () => {
        switch (currentState) {
            case 'thinking':
                return 'border-amber-400/90 ring-4 ring-amber-400/40 shadow-lg shadow-amber-500/20';
            case 'success':
                return 'border-emerald-400 ring-4 ring-emerald-400/50 shadow-lg shadow-emerald-500/25';
            case 'listening':
                return 'border-indigo-400 ring-3 ring-indigo-400/50 shadow-md shadow-indigo-500/20';
            case 'lazy':
                return 'border-slate-600/70 ring-2 ring-slate-700/40 opacity-90';
            case 'petting':
                return 'border-rose-400 ring-4 ring-rose-400/60 shadow-xl shadow-rose-500/30';
            case 'idle':
            default:
                return 'border-indigo-400/70 ring-2 ring-indigo-100/60';
        }
    };

    // Tooltip helper
    const getStateTooltip = () => {
        if (isPetted) return '🐾 *Happy tail wagging!* Good dog Keeper!';
        switch (state) {
            case 'thinking': return 'Keeper is thinking hard & sniffing out editorial rules... 💭';
            case 'success': return 'Keeper solved it! 🐾✨';
            case 'listening': return 'Keeper has his fluffy ears perked up, listening attentively! 👀';
            case 'lazy': return 'Keeper is taking a cozy power nap on his keyboard... (Hover or click to wake!) 💤';
            case 'idle':
            default:
                return 'Keeper (Japanese Spitz Mascot) — Click to pet! 🐾';
        }
    };

    return (
        <div 
            className={`relative inline-block select-none ${interactive ? 'cursor-pointer' : ''} ${className}`}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title={getStateTooltip()}
        >
            {/* Animated Avatar Box with Motion */}
            <motion.div
                variants={avatarVariants}
                animate={currentState}
                whileHover={interactive ? { scale: 1.08, y: -2 } : undefined}
                whileTap={interactive ? { scale: 0.94 } : undefined}
                className={`relative overflow-hidden bg-slate-950 shadow-md transition-shadow ${sizeConfig.box} ${sizeConfig.border} ${getRingStyle()}`}
            >
                <img
                    src={KEEPER_IMG_SRC}
                    alt="Keeper"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover pointer-events-none transition-transform duration-300 ${sizeConfig.imgFocal} ${
                        currentState === 'lazy' ? 'brightness-90 contrast-95' : 'brightness-100'
                    }`}
                />

                {/* Subtle overlay shimmer during thinking */}
                {currentState === 'thinking' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.1, 0.35, 0.1] }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                        className="absolute inset-0 bg-gradient-to-tr from-amber-400/20 via-indigo-500/20 to-transparent pointer-events-none"
                    />
                )}
            </motion.div>

            {/* Lazy Mode Floating "Zzz" Micro-Particles */}
            <AnimatePresence>
                {currentState === 'lazy' && (
                    <div className={`absolute ${sizeConfig.zzzOffset} pointer-events-none z-20 flex flex-col items-center`}>
                        <motion.span
                            initial={{ opacity: 0, y: 3, x: 0, scale: 0.6 }}
                            animate={{
                                opacity: [0, 1, 0.9, 0],
                                y: [-1, -8, -14],
                                x: [0, 3, 6],
                                scale: [0.6, 1, 0.9]
                            }}
                            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
                            className="font-bold text-indigo-400 font-mono text-[10px] leading-none drop-shadow-sm"
                        >
                            z
                        </motion.span>
                        <motion.span
                            initial={{ opacity: 0, y: 4, x: -2, scale: 0.7 }}
                            animate={{
                                opacity: [0, 1, 0.9, 0],
                                y: [2, -6, -16],
                                x: [-2, 2, 5],
                                scale: [0.7, 1.1, 1]
                            }}
                            transition={{ repeat: Infinity, duration: 2.2, delay: 0.8, ease: 'easeOut' }}
                            className="font-black text-indigo-300 font-mono text-[11px] leading-none drop-shadow-sm"
                        >
                            Z
                        </motion.span>
                    </div>
                )}
            </AnimatePresence>

            {/* Thinking Floating Thought Bubble / Question */}
            <AnimatePresence>
                {currentState === 'thinking' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5, y: 2 }}
                        animate={{ opacity: 1, scale: [0.9, 1.15, 0.9], y: [-1, -4, -1] }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                        className={`absolute ${sizeConfig.sparkleOffset} pointer-events-none z-20`}
                    >
                        <span className="text-amber-400 drop-shadow-md text-xs font-bold leading-none">
                            💭
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Success Sparkling Burst */}
            <AnimatePresence>
                {(currentState === 'success' || currentState === 'petting') && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0, rotate: -20 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.3, 1.1, 0.8], rotate: [-20, 15] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        className={`absolute ${sizeConfig.sparkleOffset} pointer-events-none z-20`}
                    >
                        <span className="text-xs leading-none drop-shadow-md">
                            {currentState === 'petting' ? '💖' : '✨'}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Status Corner Badge */}
            {showBadge && (
                <div className={`absolute ${sizeConfig.badgeOffset} z-10 pointer-events-none`}>
                    {overrideBadge ? (
                        overrideBadge
                    ) : (
                        <div className={`rounded-full flex items-center justify-center shadow-md ring-2 ring-white font-bold transition-colors ${sizeConfig.badgeSize} ${
                            currentState === 'thinking'
                                ? 'bg-amber-500 text-slate-950'
                                : currentState === 'success'
                                    ? 'bg-emerald-500 text-white'
                                    : currentState === 'listening'
                                        ? 'bg-indigo-600 text-white'
                                        : currentState === 'lazy'
                                            ? 'bg-slate-700 text-indigo-300'
                                            : currentState === 'petting'
                                                ? 'bg-rose-500 text-white'
                                                : 'bg-emerald-500 text-white'
                        }`}>
                            {currentState === 'thinking' ? (
                                <span className="leading-none text-[8px] animate-spin">⚙️</span>
                            ) : currentState === 'success' ? (
                                <span className="leading-none text-[8px]">✓</span>
                            ) : currentState === 'listening' ? (
                                <span className="leading-none text-[8px]">👂</span>
                            ) : currentState === 'lazy' ? (
                                <span className="leading-none text-[8px]">💤</span>
                            ) : currentState === 'petting' ? (
                                <span className="leading-none text-[8px]">❤️</span>
                            ) : (
                                <span className="leading-none">🐾</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default KeeperAvatar;
