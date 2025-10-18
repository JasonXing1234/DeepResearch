import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Pause, Play } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import type { Class } from '../app/page';

type RecordingViewProps = {
  classes: Class[];
};

export function RecordingView({ classes }: RecordingViewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [lectureTitle, setLectureTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    if (!selectedClass) {
      toast.error('Please select a class first');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      toast.info('Recording resumed');
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      toast.info('Recording paused');
    }
  };

  const handleStopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

    // Wait for final data
    await new Promise((resolve) => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = resolve;
      }
    });

    // Create audio blob
    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

    // Upload to API
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording-${Date.now()}.webm`);
      formData.append('classId', selectedClass);
      if (lectureTitle) {
        formData.append('title', lectureTitle);
      }

      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      toast.success('Recording uploaded! Transcription started.');

      // Reset
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setLectureTitle('');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload recording');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <Card className="w-full max-w-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="mb-2">Record a Lecture</h1>
          <p className="text-gray-500">
            Select your class and start recording. We&apos;ll transcribe it automatically.
          </p>
        </div>

        <div className="space-y-6">
          {/* Class Selection */}
          <div className="space-y-2">
            <Label htmlFor="class-select">Class</Label>
            <Select
              value={selectedClass}
              onValueChange={setSelectedClass}
              disabled={isRecording}
            >
              <SelectTrigger id="class-select">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cls.color }}
                      />
                      {cls.code} - {cls.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lecture Title */}
          <div className="space-y-2">
            <Label htmlFor="lecture-title">Lecture Title (Optional)</Label>
            <Input
              id="lecture-title"
              placeholder="e.g., Introduction to Variables"
              value={lectureTitle}
              onChange={(e) => setLectureTitle(e.target.value)}
              disabled={isRecording}
            />
          </div>

          {/* Recording Visualization */}
          <div className="py-12">
            <div className="flex flex-col items-center gap-4">
              {/* Timer */}
              <div className="text-5xl font-mono tabular-nums">
                {formatTime(recordingTime)}
              </div>

              {/* Visual Indicator */}
              {isRecording && (
                <div className="flex items-center gap-2">
                  {!isPaused ? (
                    <>
                      <div className="w-2 h-8 bg-red-500 rounded animate-pulse" />
                      <div className="w-2 h-12 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-6 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <div className="w-2 h-10 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.3s' }} />
                      <div className="w-2 h-8 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </>
                  ) : (
                    <p className="text-gray-500">Recording Paused</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {!isRecording ? (
              <Button
                size="lg"
                onClick={handleStartRecording}
                className="w-40"
                disabled={isUploading}
              >
                <Mic className="w-5 h-5 mr-2" />
                Start Recording
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handlePauseResume}
                  className="w-32"
                  disabled={isUploading}
                >
                  {isPaused ? (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-5 h-5 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleStopRecording}
                  className="w-32"
                  disabled={isUploading}
                >
                  <Square className="w-5 h-5 mr-2" />
                  {isUploading ? 'Uploading...' : 'Stop'}
                </Button>
              </>
            )}
          </div>

          {isRecording && (
            <p className="text-center text-sm text-gray-500">
              Your lecture is being recorded. Click stop when finished.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}