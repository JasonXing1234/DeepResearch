'use client'

import { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { RecordingView } from '../components/RecordingView';
import { ClassView } from '../components/ClassView';
import { StudyAssistant } from '../components/StudyAssistant';
import { UploadMaterialsView } from '../components/UploadMaterialsView';
import { Toaster } from '../components/ui/sonner';
import { toast } from 'sonner';

export type Semester = {
  id: string;
  name: string;
  year: number;
  term: 'Fall' | 'Spring' | 'Summer' | 'Winter';
  isActive: boolean;
};

export type Class = {
  id: string;
  semesterId: string;
  name: string;
  code: string;
  color: string;
  professor: string;
};

export type Lecture = {
  id: string;
  classId: string;
  title: string;
  date: string;
  duration: number; // in seconds
  audioUrl: string;
  transcript: string;
};

export type ClassMaterial = {
  id: string;
  classId: string;
  name: string;
  type: 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'other';
  size: number; // in bytes
  uploadDate: string;
  url: string;
};


export default function App() {
  const [currentView, setCurrentView] = useState<'record' | 'upload' | 'class' | 'study'>('class');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [materials, setMaterials] = useState<ClassMaterial[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch semesters and classes from API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch semesters
        const semestersResponse = await fetch('/api/semesters');
        const semestersResult = await semestersResponse.json();

        // Fetch classes
        const classesResponse = await fetch('/api/classes');
        const classesResult = await classesResponse.json();

        // Fetch documents (lectures and materials)
        const documentsResponse = await fetch('/api/documents');
        const documentsResult = await documentsResponse.json();

        if (semestersResult.success && semestersResult.semesters) {
          // Map database semesters to UI format
          const mappedSemesters = semestersResult.semesters.map((s: any) => ({
            id: s.id,
            name: `${s.term} ${s.year}`,
            year: s.year,
            term: s.term,
            isActive: false, // TODO: Determine active semester logic
          }));
          console.log('Loaded semesters:', mappedSemesters);
          setSemesters(mappedSemesters);
        }

        if (classesResult.success && classesResult.classes) {
          // Map database classes to UI format
          const mappedClasses = classesResult.classes.map((c: any) => ({
            id: c.id,
            semesterId: c.semester_id,
            name: c.name,
            code: c.class_code || '',
            color: c.color_code || '#3b82f6',
            professor: c.instructor || '',
          }));
          console.log('Loaded classes:', mappedClasses);
          setClasses(mappedClasses);
        }

        if (documentsResult.success && documentsResult.documents) {
          // Split documents into lectures and materials
          const allDocuments = documentsResult.documents;

          // Lectures: audio files (identified by mime type or storage bucket)
          const mappedLectures = allDocuments
            .filter((d: any) =>
              d.mime_type?.startsWith('audio/') ||
              d.storage_bucket === 'lecture-recordings'
            )
            .map((d: any) => ({
              id: d.id,
              classId: d.class_id,
              title: d.title || d.original_filename || 'Untitled Lecture',
              date: d.date_of_material || d.created_at.split('T')[0],
              duration: d.audio_duration_seconds || 0,
              audioUrl: d.file_path || '#',
              transcript: d.transcription_text || 'Transcription in progress...',
            }));

          // Materials: PDFs, DOCX, PPTX, etc. (non-audio files)
          const mappedMaterials = allDocuments
            .filter((d: any) =>
              !d.mime_type?.startsWith('audio/') &&
              d.storage_bucket !== 'lecture-recordings'
            )
            .map((d: any) => {
              // Determine type from mime_type
              let type: 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'other' = 'other';
              if (d.mime_type?.includes('pdf')) type = 'pdf';
              else if (d.mime_type?.includes('presentation') || d.mime_type?.includes('powerpoint')) type = 'pptx';
              else if (d.mime_type?.includes('word') || d.mime_type?.includes('document')) type = 'docx';
              else if (d.mime_type?.includes('spreadsheet') || d.mime_type?.includes('excel')) type = 'xlsx';

              return {
                id: d.id,
                classId: d.class_id,
                name: d.title || d.original_filename || 'Untitled Document',
                type,
                size: d.file_size_bytes || 0,
                uploadDate: d.date_of_material || d.created_at.split('T')[0],
                url: d.file_path || '#',
              };
            });

          console.log('Loaded lectures:', mappedLectures);
          console.log('Loaded materials:', mappedMaterials);
          setLectures(mappedLectures);
          setMaterials(mappedMaterials);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAddSemester = (semester: Semester) => {
    setSemesters([...semesters, semester]);
  };

  const handleAddClass = (cls: Class) => {
    setClasses([...classes, cls]);
  };

  const handleAddMaterial = (material: ClassMaterial) => {
    setMaterials([...materials, material]);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        semesters={semesters}
        classes={classes}
        currentView={currentView}
        onViewChange={setCurrentView}
        selectedClassId={selectedClassId}
        onClassSelect={setSelectedClassId}
        onAddSemester={handleAddSemester}
        onAddClass={handleAddClass}
      />
      
      <main className="flex-1 overflow-hidden">
        {currentView === 'study' && (
          <StudyAssistant classes={classes} lectures={lectures} />
        )}
        {currentView === 'record' && (
          <RecordingView classes={classes} />
        )}
        {currentView === 'upload' && (
          <UploadMaterialsView classes={classes} onAddMaterial={handleAddMaterial} />
        )}
        {currentView === 'class' && (
          <ClassView
            selectedClassId={selectedClassId}
            classes={classes}
            lectures={lectures}
            materials={materials}
          />
        )}
      </main>
      
      <Toaster />
    </div>
  );
}