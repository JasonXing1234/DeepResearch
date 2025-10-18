import { useState } from 'react';
import { Calendar, Clock, ChevronRight, BookOpen, FileText, Download } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { LectureDetail } from './LectureDetail';
import type { Class, Lecture, ClassMaterial } from '../app/page';

type ClassViewProps = {
  selectedClassId: string | null;
  classes: Class[];
  lectures: Lecture[];
  materials: ClassMaterial[];
};

export function ClassView({
  selectedClassId,
  classes,
  lectures,
  materials,
}: ClassViewProps) {
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const classLectures = selectedClassId
    ? lectures.filter((l) => l.classId === selectedClassId)
    : [];
  const classMaterials = selectedClassId
    ? materials.filter((m) => m.classId === selectedClassId)
    : [];

  // Sort lectures by date (newest first)
  const sortedLectures = [...classLectures].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Sort materials by upload date (newest first)
  const sortedMaterials = [...classMaterials].sort((a, b) => 
    new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
  );

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined 
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (_type: string) => {
    return FileText;
  };

  const getFileTypeLabel = (type: string) => {
    return type.toUpperCase();
  };

  if (selectedLecture && selectedClass) {
    return (
      <LectureDetail
        lecture={selectedLecture}
        classInfo={selectedClass}
        onBack={() => setSelectedLecture(null)}
      />
    );
  }

  if (!selectedClassId || !selectedClass) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="mb-2 text-gray-900">Select a Class</h2>
          <p className="text-gray-500">
            Choose a class from the sidebar to view your lecture recordings and transcripts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
            style={{ backgroundColor: selectedClass.color }}
          />
          <div className="flex-1">
            <h1 className="mb-1">{selectedClass.name}</h1>
            <p className="text-gray-500">{selectedClass.code}</p>
            <p className="text-sm text-gray-400 mt-1">
              Professor {selectedClass.professor} • {sortedLectures.length} lectures • {sortedMaterials.length} materials
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          <Tabs defaultValue="lectures" className="w-full">
            <TabsList>
              <TabsTrigger value="lectures">
                Lectures ({sortedLectures.length})
              </TabsTrigger>
              <TabsTrigger value="materials">
                Materials ({sortedMaterials.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lectures" className="mt-6">
              {sortedLectures.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No lectures recorded yet for this class.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Start recording your first lecture to see it here!
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl">
                  {sortedLectures.map((lecture) => (
                    <Card
                      key={lecture.id}
                      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setSelectedLecture(lecture)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="truncate">{lecture.title}</h3>
                            <Badge variant="secondary" className="flex-shrink-0">
                              {formatDuration(lecture.duration)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(lecture.date)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {new Date(lecture.date).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {lecture.transcript.substring(0, 150)}...
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="materials" className="mt-6">
              {sortedMaterials.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No materials uploaded yet for this class.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Upload PDFs, presentations, or documents to see them here!
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl">
                  {sortedMaterials.map((material) => {
                    const Icon = getFileIcon(material.type);
                    return (
                      <Card
                        key={material.id}
                        className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Icon className="w-10 h-10 text-blue-600 flex-shrink-0 mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="truncate">{material.name}</h3>
                                <Badge variant="outline" className="flex-shrink-0">
                                  {getFileTypeLabel(material.type)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span>{formatFileSize(material.size)}</span>
                                <span>•</span>
                                <span>Uploaded {formatDate(material.uploadDate)}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0"
                            onClick={() => {
                              // Mock download
                              window.open(material.url, '_blank');
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}