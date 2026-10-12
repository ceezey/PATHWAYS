// Every tone StatusBadge renders.
export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

// The tones of signal surfaces such as MetricCard and ProgressBar, which have no neutral style.
export type SignalTone = Exclude<StatusTone, 'neutral'>
