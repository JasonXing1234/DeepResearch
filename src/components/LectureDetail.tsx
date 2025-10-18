import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Calendar, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Slider } from './ui/slider';
import type { Class, Lecture } from '../app/page';
import { createClient } from '@/lib/supabase/client';

type LectureDetailProps = {
  lecture: Lecture;
  classInfo: Class;
  onBack: () => void;
};

export function LectureDetail({ lecture, classInfo, onBack }: LectureDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(lecture.duration);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load audio file from storage
  useEffect(() => {
    const loadAudio = async () => {
      const supabase = createClient();

      // Parse storage path from audioUrl (format: bucket/path)
      const path = lecture.audioUrl;

      // Generate signed URL (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from('lecture-recordings')
        .createSignedUrl(path, 3600);

      if (error) {
        console.error('Error loading audio:', error);
        return;
      }

      if (data?.signedUrl) {
        setAudioUrl(data.signedUrl);
      }
    };

    loadAudio();
  }, [lecture.audioUrl]);

  // Update current time from audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(Math.floor(audio.currentTime));
    const updateDuration = () => setDuration(Math.floor(audio.duration));
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

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
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSkipBack = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  };

  const handleSkipForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
  };

  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value[0];
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
            {/* Hidden audio element */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="metadata"
              />
            )}

            {/* Progress */}
            <div className="space-y-2">
              <Slider
                value={[currentTime]}
                max={duration}
                step={1}
                onValueChange={handleSeek}
                className="w-full"
                disabled={!audioUrl}
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipBack}
                disabled={!audioUrl}
              >
                <SkipBack className="w-4 h-4" />
              </Button>

              <Button
                size="icon"
                className="w-12 h-12"
                onClick={handlePlayPause}
                disabled={!audioUrl}
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
                disabled={!audioUrl}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {!audioUrl && (
              <p className="text-center text-sm text-gray-500">
                Loading audio...
              </p>
            )}
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
