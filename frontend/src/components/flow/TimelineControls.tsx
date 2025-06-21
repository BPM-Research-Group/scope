const TimelineControls: React.FC<{
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    speedMultiplier: number;
    baseSpeed: number;
    setBaseSpeed: (baseSpeed: number) => void;
    setSpeedMultiplier: (speed: number) => void;
    currentTime: Date;
    startTime: Date;
    endTime: Date;
    progress: number;
    setProgress: (progress: number) => void;
    onReset: () => void;
    onTimeChange: (newTime: Date) => void;
}> = ({
    isPlaying,
    setIsPlaying,
    speedMultiplier,
    baseSpeed,
    setBaseSpeed,
    setSpeedMultiplier,
    currentTime,
    startTime,
    endTime,
    progress,
    setProgress,
    onReset,
    onTimeChange,
}) => {
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString(['de-DE'], {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    // Ideally this should be implemented in the future. This would allow the user to use the time slider.
    // There was some bug which is why it is currently not in use.
    const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newProgress = parseFloat(e.target.value);
        // Calculate the new time based on progress
        const newTime = new Date(startTime.getTime() + (endTime.getTime() - startTime.getTime()) * newProgress);
        onTimeChange(newTime);
    };

    return (
        <div className="absolute bottom-16 left-4 right-4 bg-white p-4 rounded-lg shadow-lg z-10">
            <div className="flex items-center mb-2">
                <div className="flex space-x-2">
                    <button onClick={onReset} className="bg-gray-200 hover:bg-gray-300 rounded-full p-2" title="Reset">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M3 2v6h6"></path>
                            <path d="M3 6c3.89-4.2 11-4.2 15 0s4.2 11 0 15-11 4.2-15 0"></path>
                        </svg>
                    </button>
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2"
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                        ) : (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        )}
                    </button>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Speed:</span>
                    <select
                        value={speedMultiplier}
                        onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
                        className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                        <option value={0.5}>0.5x</option>
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={5}>5x</option>
                        <option value={10}>10x</option>
                        <option value={20}>20x</option>
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Base Speed:</span>
                    <select
                        value={baseSpeed}
                        onChange={(e) => setBaseSpeed(Number(e.target.value))}
                        className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                        <option value={0.001}>1ms</option>
                        <option value={1}>1s</option>
                        <option value={60}>1min</option>
                        <option value={60 * 60}>1h</option>
                        <option value={60 * 60 * 24}>1d</option>
                        <option value={60 * 60 * 24 * 7}>1w</option>
                    </select>
                </div>
                <div className="text-sm text-gray-600">
                    {formatTime(currentTime)} / {formatTime(endTime)}
                </div>
            </div>
        </div>
    );
};

export default TimelineControls;
