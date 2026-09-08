import { supabase } from '../supabaseClient';
import { ToolId } from '../types';
import { getToolName } from '../utils/toolRegistry';
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface ToolMetricEvent {
    userId: string;
    toolId: string;
    durationSeconds?: number;
    action?: string;
    metadata?: Record<string, any>;
    timestamp?: string;
}

export interface ToolUtilizationSummary {
    toolId: string;
    name: string;
    totalCalls: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
    uniqueUsersCount: number;
    lastUsedAt?: string;
}

export type MetricsTimeRange = '24h' | '7d' | '30d' | 'all';

interface ActiveSessionState {
    toolId: string;
    userId: string;
    startTimestamp: number;
    accumulatedSeconds: number;
    lastTick: number;
    isActive: boolean;
    metadata: Record<string, any>;
    initialLogSent: boolean;
}

/**
 * Service Utility to log tool usage metrics (frequency and duration) to Supabase.
 * Administrators can monitor which editorial utilities are most utilized.
 * 
 * Features:
 * - Dwell time tracking with active tab / visibility detection
 * - Heartbeat flushing for long editorial workflows
 * - Action/operation tracking (frequency + operation duration)
 * - Schema resiliency: automatically detects and falls back if duration_seconds or metadata columns are absent
 * - Offline queue & retry mechanism
 * - Aggregation and query methods for administrator monitoring
 */
class UsageMetricsService {
    private activeSession: ActiveSessionState | null = null;
    private hasExtendedColumns: boolean | null = null;
    private pendingQueue: ToolMetricEvent[] = [];
    private isFlushingQueue = false;
    private heartbeatTimer: any = null;

    constructor() {
        if (typeof window !== 'undefined') {
            // Check session storage cache for column capability
            const cachedCapability = sessionStorage.getItem('pt_usage_has_extended_cols');
            if (cachedCapability !== null) {
                this.hasExtendedColumns = cachedCapability === 'true';
            }

            // Listen for window unload to flush active session duration
            window.addEventListener('beforeunload', () => {
                this.flushCurrentSessionSync();
            });

            // Visibility changes: pause duration when operator is in another tab
            document.addEventListener('visibilitychange', () => {
                this.handleVisibilityChange();
            });
        }
    }

    /**
     * Start tracking a new session for an editorial tool.
     * Returns an endSession callback.
     */
    public startSession(toolId: string, userId: string, metadata: Record<string, any> = {}): () => void {
        if (!toolId || !userId) return () => {};

        // If another session was running, flush it first
        if (this.activeSession && (this.activeSession.toolId !== toolId || this.activeSession.userId !== userId)) {
            this.endSession();
        }

        const now = Date.now();
        this.activeSession = {
            toolId,
            userId,
            startTimestamp: now,
            accumulatedSeconds: 0,
            lastTick: now,
            isActive: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
            metadata,
            initialLogSent: false
        };

        // Immediately send an entry log so call frequency is captured immediately
        this.logToolUsage({
            userId,
            toolId,
            durationSeconds: 0,
            action: 'session_start',
            metadata: { ...metadata, stage: 'start' }
        }).then(() => {
            if (this.activeSession && this.activeSession.toolId === toolId) {
                this.activeSession.initialLogSent = true;
            }
        });

        // Setup periodic heartbeat every 60s for long sessions
        this.startHeartbeat();

        return () => {
            this.endSession();
        };
    }

    /**
     * End current tool session and commit the active duration to Supabase.
     */
    public async endSession(extraMetadata: Record<string, any> = {}): Promise<boolean> {
        this.stopHeartbeat();

        if (!this.activeSession) return false;

        this.updateActiveDwell();
        const session = this.activeSession;
        this.activeSession = null;

        const durationSeconds = Math.max(1, Math.round(session.accumulatedSeconds));

        return this.logToolUsage({
            userId: session.userId,
            toolId: session.toolId,
            durationSeconds,
            action: 'session_complete',
            metadata: {
                ...session.metadata,
                ...extraMetadata,
                startedAt: new Date(session.startTimestamp).toISOString(),
                completedAt: new Date().toISOString()
            }
        });
    }

    /**
     * Log a specific action / operation inside an editorial tool.
     * e.g. "xml_renumber_executed", "table_cleaned", "diff_generated"
     */
    public async trackToolAction(
        toolId: string,
        userId: string,
        action: string,
        durationSeconds?: number,
        metadata: Record<string, any> = {}
    ): Promise<boolean> {
        if (!toolId || !userId) return false;

        return this.logToolUsage({
            userId,
            toolId,
            action,
            durationSeconds: durationSeconds !== undefined ? Math.round(durationSeconds) : undefined,
            metadata
        });
    }

    /**
     * Insert a metric event into Supabase usage_logs.
     * Handles schema fallback and retry resilience.
     */
    public async logToolUsage(event: ToolMetricEvent, attempt = 1): Promise<boolean> {
        if (!event.userId || !event.toolId) return false;

        try {
            // Build payload based on schema support
            let payload: Record<string, any> = {
                user_id: event.userId,
                tool_id: event.toolId
            };

            // If we know extended columns are supported or not tested yet
            if (this.hasExtendedColumns !== false) {
                if (event.durationSeconds !== undefined) {
                    payload.duration_seconds = event.durationSeconds;
                }
                if (event.metadata || event.action) {
                    payload.metadata = {
                        action: event.action || 'view',
                        ...(event.metadata || {})
                    };
                }
            }

            const { error } = await supabase.from('usage_logs').insert([payload]);

            if (error) {
                const errorMsg = (error.message || '').toLowerCase();
                const isColumnError = 
                    error.code === 'PGRST204' || 
                    errorMsg.includes('duration_seconds') || 
                    errorMsg.includes('metadata') ||
                    errorMsg.includes('column') ||
                    errorMsg.includes('does not exist');

                if (isColumnError && this.hasExtendedColumns !== false) {
                    console.warn('[UsageMetrics] Remote usage_logs lacks duration/metadata columns. Falling back to basic schema.');
                    this.hasExtendedColumns = false;
                    try {
                        sessionStorage.setItem('pt_usage_has_extended_cols', 'false');
                    } catch (_) {}

                    // Fallback to basic schema insert
                    const { error: fallbackError } = await supabase.from('usage_logs').insert([{
                        user_id: event.userId,
                        tool_id: event.toolId
                    }]);

                    if (!fallbackError) return true;
                }

                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    return this.logToolUsage(event, attempt + 1);
                }

                // Queue event locally for later flush
                this.enqueuePending(event);
                return false;
            }

            // Succeeded with extended columns
            if (this.hasExtendedColumns === null && (event.durationSeconds !== undefined || event.metadata)) {
                this.hasExtendedColumns = true;
                try {
                    sessionStorage.setItem('pt_usage_has_extended_cols', 'true');
                } catch (_) {}
            }

            // Flush pending if any
            if (this.pendingQueue.length > 0 && !this.isFlushingQueue) {
                this.flushQueue();
            }

            return true;
        } catch (err) {
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
                return this.logToolUsage(event, attempt + 1);
            }
            this.enqueuePending(event);
            return false;
        }
    }

    /**
     * Query and aggregate tool utilization metrics for administrators.
     */
    public async fetchUtilizationMetrics(range: MetricsTimeRange = '7d'): Promise<{
        summaries: ToolUtilizationSummary[];
        totalLogs: number;
        totalDurationSeconds: number;
        activeToolsCount: number;
    }> {
        try {
            let query = supabase
                .from('usage_logs')
                .select('id, user_id, tool_id, timestamp, duration_seconds, metadata')
                .order('timestamp', { ascending: false });

            const now = Date.now();
            let rangeMs = 0;
            if (range === '24h') rangeMs = 24 * 60 * 60 * 1000;
            else if (range === '7d') rangeMs = 7 * 24 * 60 * 60 * 1000;
            else if (range === '30d') rangeMs = 30 * 24 * 60 * 60 * 1000;

            if (rangeMs > 0) {
                const cutoff = new Date(now - rangeMs).toISOString();
                query = query.gte('timestamp', cutoff);
            }

            const { data, error } = await query;
            if (error) throw error;

            const logs = data || [];
            const toolStats: Record<string, {
                totalCalls: number;
                totalDuration: number;
                users: Set<string>;
                lastUsedAt?: string;
            }> = {};

            let grandTotalDuration = 0;

            logs.forEach(log => {
                const tid = log.tool_id;
                if (!toolStats[tid]) {
                    toolStats[tid] = {
                        totalCalls: 0,
                        totalDuration: 0,
                        users: new Set<string>(),
                        lastUsedAt: log.timestamp
                    };
                }

                toolStats[tid].totalCalls += 1;
                const dur = typeof log.duration_seconds === 'number' ? Math.max(0, log.duration_seconds) : 0;
                toolStats[tid].totalDuration += dur;
                grandTotalDuration += dur;
                if (log.user_id) toolStats[tid].users.add(log.user_id);
            });

            // Convert to summary list and sort by utilization frequency and duration
            const summaries: ToolUtilizationSummary[] = Object.keys(toolStats).map(toolId => {
                const stat = toolStats[toolId];
                return {
                    toolId,
                    name: getToolName(toolId as ToolId),
                    totalCalls: stat.totalCalls,
                    totalDurationSeconds: stat.totalDuration,
                    avgDurationSeconds: stat.totalCalls > 0 ? Math.round(stat.totalDuration / stat.totalCalls) : 0,
                    uniqueUsersCount: stat.users.size,
                    lastUsedAt: stat.lastUsedAt
                };
            }).sort((a, b) => b.totalCalls - a.totalCalls || b.totalDurationSeconds - a.totalDurationSeconds);

            return {
                summaries,
                totalLogs: logs.length,
                totalDurationSeconds: grandTotalDuration,
                activeToolsCount: summaries.length
            };
        } catch (err) {
            console.error('[UsageMetrics] Failed to fetch utilization metrics:', err);
            return {
                summaries: [],
                totalLogs: 0,
                totalDurationSeconds: 0,
                activeToolsCount: 0
            };
        }
    }

    /**
     * Format duration into human-readable shorthand (e.g. 45s, 3m 20s, 1h 15m)
     */
    public formatDuration(seconds: number): string {
        if (!seconds || seconds <= 0) return '0s';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins < 60) {
            return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        }
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
    }

    // ==========================================
    // Internal Helper Methods
    // ==========================================

    private handleVisibilityChange() {
        if (!this.activeSession) return;
        const now = Date.now();

        if (document.visibilityState === 'visible') {
            this.activeSession.isActive = true;
            this.activeSession.lastTick = now;
        } else {
            // Document became hidden - accumulate time spent up to now
            if (this.activeSession.isActive) {
                const deltaSec = (now - this.activeSession.lastTick) / 1000;
                // Bound unreasonable spikes (e.g. max 10 mins continuous single tick)
                if (deltaSec > 0 && deltaSec < 600) {
                    this.activeSession.accumulatedSeconds += deltaSec;
                }
            }
            this.activeSession.isActive = false;
            this.activeSession.lastTick = now;
        }
    }

    private updateActiveDwell() {
        if (!this.activeSession) return;
        const now = Date.now();
        if (this.activeSession.isActive) {
            const deltaSec = (now - this.activeSession.lastTick) / 1000;
            if (deltaSec > 0 && deltaSec < 600) {
                this.activeSession.accumulatedSeconds += deltaSec;
            }
        }
        this.activeSession.lastTick = now;
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        // Update accumulated time every 60 seconds
        this.heartbeatTimer = setInterval(() => {
            this.updateActiveDwell();
        }, 60000);
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private flushCurrentSessionSync() {
        if (!this.activeSession) return;
        this.updateActiveDwell();
        const session = this.activeSession;
        this.activeSession = null;

        const durationSeconds = Math.max(1, Math.round(session.accumulatedSeconds));
        // Use non-blocking async call (or navigator.sendBeacon where available)
        this.logToolUsage({
            userId: session.userId,
            toolId: session.toolId,
            durationSeconds,
            action: 'session_unload',
            metadata: { unloaded: true }
        });
    }

    private enqueuePending(event: ToolMetricEvent) {
        if (this.pendingQueue.length > 50) this.pendingQueue.shift();
        this.pendingQueue.push(event);
    }

    private async flushQueue() {
        if (this.isFlushingQueue || this.pendingQueue.length === 0) return;
        this.isFlushingQueue = true;
        try {
            while (this.pendingQueue.length > 0) {
                const event = this.pendingQueue.shift();
                if (event) {
                    await this.logToolUsage(event, 3);
                }
            }
        } finally {
            this.isFlushingQueue = false;
        }
    }
}

// Global singleton instance
export const usageMetricsService = new UsageMetricsService();

/**
 * React Hook to automatically track tool session frequency and duration.
 * Integrates directly into Layout or any Tool page.
 */
export function useToolMetrics(currentTool?: string) {
    const { user, loading: authLoading } = useAuth();
    const sessionActiveRef = useRef<boolean>(false);
    const cleanupFnRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!currentTool || !user?.id || authLoading) {
            if (cleanupFnRef.current) {
                cleanupFnRef.current();
                cleanupFnRef.current = null;
                sessionActiveRef.current = false;
            }
            return;
        }

        // Start session for current tool
        const cleanup = usageMetricsService.startSession(currentTool, user.id);
        cleanupFnRef.current = cleanup;
        sessionActiveRef.current = true;

        return () => {
            if (cleanupFnRef.current) {
                cleanupFnRef.current();
                cleanupFnRef.current = null;
                sessionActiveRef.current = false;
            }
        };
    }, [currentTool, user?.id, authLoading]);

    const trackAction = useCallback((action: string, durationSeconds?: number, metadata?: Record<string, any>) => {
        if (!currentTool || !user?.id) return Promise.resolve(false);
        return usageMetricsService.trackToolAction(currentTool, user.id, action, durationSeconds, metadata);
    }, [currentTool, user?.id]);

    return {
        trackAction,
        isTracking: sessionActiveRef.current,
        formatDuration: usageMetricsService.formatDuration.bind(usageMetricsService)
    };
}
