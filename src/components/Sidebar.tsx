import { useState } from 'react';
import { Mic, BookOpen, GraduationCap, ChevronDown, ChevronRight, Plus, FolderPlus, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { Class, Semester } from '../app/page';

type SidebarProps = {
  semesters: Semester[];
  classes: Class[];
  currentView: 'record' | 'upload' | 'class' | 'study';
  onViewChange: (view: 'record' | 'upload' | 'class' | 'study') => void;
  selectedClassId: string | null;
  onClassSelect: (classId: string | null) => void;
  onAddSemester: (semester: Semester) => void;
  onAddClass: (cls: Class) => void;
};

export function Sidebar({
  semesters,
  classes,
  currentView,
  onViewChange,
  selectedClassId,
  onClassSelect,
  onAddSemester,
  onAddClass,
}: SidebarProps) {
  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(
    new Set(semesters.filter(s => s.isActive).map(s => s.id))
  );
  const [addSemesterOpen, setAddSemesterOpen] = useState(false);
  const [addClassOpen, setAddClassOpen] = useState(false);
  
  // Form states
  const [newSemesterTerm, setNewSemesterTerm] = useState<'Fall' | 'Spring' | 'Summer' | 'Winter'>('Fall');
  const [newSemesterYear, setNewSemesterYear] = useState(new Date().getFullYear().toString());
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassProfessor, setNewClassProfessor] = useState('');
  const [newClassSemester, setNewClassSemester] = useState(semesters[0]?.id || '');
  const [newClassColor, setNewClassColor] = useState('#3b82f6');

  const toggleSemester = (semesterId: string) => {
    const newExpanded = new Set(expandedSemesters);
    if (newExpanded.has(semesterId)) {
      newExpanded.delete(semesterId);
    } else {
      newExpanded.add(semesterId);
    }
    setExpandedSemesters(newExpanded);
  };

  const handleAddSemester = () => {
    const newSemester: Semester = {
      id: Date.now().toString(),
      name: `${newSemesterTerm} ${newSemesterYear}`,
      year: parseInt(newSemesterYear),
      term: newSemesterTerm,
      isActive: false,
    };
    onAddSemester(newSemester);
    setAddSemesterOpen(false);
  };

  const handleAddClass = () => {
    if (!newClassName || !newClassCode || !newClassSemester) return;
    
    const newClass: Class = {
      id: Date.now().toString(),
      semesterId: newClassSemester,
      name: newClassName,
      code: newClassCode,
      professor: newClassProfessor,
      color: newClassColor,
    };
    onAddClass(newClass);
    setAddClassOpen(false);
    // Reset form
    setNewClassName('');
    setNewClassCode('');
    setNewClassProfessor('');
    setNewClassColor('#3b82f6');
  };

  const classesBySemester = classes.reduce((acc, cls) => {
    if (!acc[cls.semesterId]) {
      acc[cls.semesterId] = [];
    }
    acc[cls.semesterId].push(cls);
    return acc;
  }, {} as Record<string, Class[]>);

  const colorOptions = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#f43f5e', // rose
    '#ec4899', // pink
    '#14b8a6', // teal
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-8 h-8 text-blue-600" />
          <div>
            <h1>LectureNote</h1>
            <p className="text-sm text-gray-500">Your AI Study Companion</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4 border-b border-gray-200">
        <div className="space-y-1">
          <Button
            variant={currentView === 'study' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => onViewChange('study')}
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Study Assistant
          </Button>
          <Button
            variant={currentView === 'record' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => onViewChange('record')}
          >
            <Mic className="w-4 h-4 mr-2" />
            Record Lecture
          </Button>
          <Button
            variant={currentView === 'upload' ? 'default' : 'ghost'}
            className="w-full justify-start"
            onClick={() => onViewChange('upload')}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Materials
          </Button>
        </div>
      </div>

      {/* Classes List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm text-gray-500">My Classes</h2>
          <div className="flex gap-1">
            <Dialog open={addClassOpen} onOpenChange={setAddClassOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="w-3 h-3" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Class</DialogTitle>
                  <DialogDescription>
                    Create a new class for one of your semesters.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="semester">Semester</Label>
                    <Select value={newClassSemester} onValueChange={setNewClassSemester}>
                      <SelectTrigger id="semester">
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {semesters.map((semester) => (
                          <SelectItem key={semester.id} value={semester.id}>
                            {semester.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="class-code">Class Code</Label>
                    <Input
                      id="class-code"
                      placeholder="e.g., CS 101"
                      value={newClassCode}
                      onChange={(e) => setNewClassCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="class-name">Class Name</Label>
                    <Input
                      id="class-name"
                      placeholder="e.g., Introduction to Computer Science"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="professor">Professor</Label>
                    <Input
                      id="professor"
                      placeholder="e.g., Dr. Smith"
                      value={newClassProfessor}
                      onChange={(e) => setNewClassProfessor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color}
                          className={cn(
                            'w-8 h-8 rounded-full border-2 transition-all',
                            newClassColor === color ? 'border-gray-900 scale-110' : 'border-gray-200'
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => setNewClassColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleAddClass} className="w-full">
                    Add Class
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={addSemesterOpen} onOpenChange={setAddSemesterOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <FolderPlus className="w-3 h-3" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Semester</DialogTitle>
                  <DialogDescription>
                    Create a new semester to organize your classes.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="term">Term</Label>
                    <Select value={newSemesterTerm} onValueChange={(v) => setNewSemesterTerm(v as 'Fall' | 'Spring' | 'Summer' | 'Winter')}>
                      <SelectTrigger id="term">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Spring">Spring</SelectItem>
                        <SelectItem value="Summer">Summer</SelectItem>
                        <SelectItem value="Fall">Fall</SelectItem>
                        <SelectItem value="Winter">Winter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      value={newSemesterYear}
                      onChange={(e) => setNewSemesterYear(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleAddSemester} className="w-full">
                    Add Semester
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 pb-4">
            {semesters.map((semester) => (
              <div key={semester.id}>
                {/* Semester Header */}
                <button
                  onClick={() => toggleSemester(semester.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {expandedSemesters.has(semester.id) ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-sm">
                    {semester.name}
                  </span>
                  {semester.isActive && (
                    <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Active
                    </span>
                  )}
                </button>

                {/* Classes in Semester */}
                {expandedSemesters.has(semester.id) && classesBySemester[semester.id] && (
                  <div className="ml-6 mt-1 space-y-1">
                    {classesBySemester[semester.id].map((cls) => (
                      <button
                        key={cls.id}
                        onClick={() => {
                          onClassSelect(selectedClassId === cls.id ? null : cls.id);
                          if (currentView !== 'class') {
                            onViewChange('class');
                          }
                        }}
                        className={cn(
                          'w-full text-left p-2 rounded-lg transition-colors',
                          selectedClassId === cls.id
                            ? 'bg-gray-100'
                            : 'hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cls.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{cls.code}</p>
                            <p className="text-xs text-gray-500 truncate">{cls.name}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}