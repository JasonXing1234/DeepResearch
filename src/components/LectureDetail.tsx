import { useState, useRef } from 'react';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Calendar, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Slider } from './ui/slider';
import type { Class, Lecture } from '../app/page';

type LectureDetailProps = {
  lecture: Lecture;
  classInfo: Class;
  onBack: () => void;
};

export function LectureDetail({ lecture, classInfo, onBack }: LectureDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const playIntervalRef = useRef<number | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    } else {
      setIsPlaying(true);
      playIntervalRef.current = window.setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= lecture.duration) {
            setIsPlaying(false);
            if (playIntervalRef.current) {
              clearInterval(playIntervalRef.current);
            }
            return lecture.duration;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleSkipBack = () => {
    setCurrentTime((prev) => Math.max(0, prev - 10));
  };

  const handleSkipForward = () => {
    setCurrentTime((prev) => Math.min(lecture.duration, prev + 10));
  };

  const handleSeek = (value: number[]) => {
    setCurrentTime(value[0]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-6">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Library
        </Button>
        
        <div className="flex items-start gap-3">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
            style={{ backgroundColor: classInfo.color }}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1>{lecture.title}</h1>
            </div>
            <p className="text-gray-500">{classInfo.code} - {classInfo.name}</p>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(lecture.date)}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTime(lecture.duration)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Player */}
      <div className="border-b border-gray-200 bg-white p-6">
        <Card className="p-6">
          <div className="space-y-4">
            {/* Progress */}
            <div className="space-y-2">
              <Slider
                value={[currentTime]}
                max={lecture.duration}
                step={1}
                onValueChange={handleSeek}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(lecture.duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipBack}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              
              <Button
                size="icon"
                className="w-12 h-12"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>
              
              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipForward}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-center text-sm text-gray-500">
              {isPlaying ? 'Playing audio recording...' : 'Audio player (mock)'}
            </p>
          </div>
        </Card>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-6 pb-3">
          <h2>Transcript</h2>
        </div>
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="prose max-w-none">
            {lecture.transcript.split('\n\n').map((paragraph, index) => (
              <p key={index} className="mb-4">
                {paragraph}
              </p>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
